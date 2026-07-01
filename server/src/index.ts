import http from "node:http";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { loadConfig } from "./config.js";
import {
  inferAgentType,
  removeSessionMetadata,
  renameSessionMetadata,
  updateSessionMetadata,
  upsertSessionMetadata,
  withSessionMetadata
} from "./metadataStore.js";
import { attachTerminalSocket } from "./terminalSocket.js";
import { listCodexSkills } from "./skills.js";
import { enrichTmuxSessionsWithStatus } from "./sessionStatus.js";
import {
  captureAgentSnapshot,
  getAgentHost,
  listAgentHostSessions,
  listAgentTmuxWindows,
  requestAgent
} from "./agentHosts.js";
import {
  captureTmuxPane,
  createTmuxWindow,
  createTmuxSession,
  detectSessionStatus,
  killTmuxPane,
  killTmuxSession,
  killTmuxWindow,
  listTmuxSessions,
  listTmuxWindows,
  renameTmuxWindow,
  renameTmuxSession,
  resolveUniqueTmuxSessionName,
  sendKeysToTmuxSession,
  sendLiteralToTmuxSession,
  selectTmuxPane,
  selectTmuxWindow,
  splitTmuxPane
} from "./tmux.js";
import { createPtySession, killPtySession, listPtySessions } from "./ptyRegistry.js";
import { tmuxSessionNameSchema, tmuxWindowNameSchema, zodErrorMessage } from "./validation.js";
import { requireAgentToken } from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(requireAgentToken);

const createSessionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["tmux", "pty"]).default("tmux"),
  agentType: z.enum(["codex", "claude", "gemini", "shell", "build", "custom"]).optional(),
  cwd: z.string().optional(),
  command: z.string().optional()
}).superRefine((input, ctx) => {
  if (input.type !== "tmux") return;
  const result = tmuxSessionNameSchema.safeParse(input.name);
  if (result.success) return;
  for (const issue of result.error.issues) {
    ctx.addIssue({ ...issue, path: ["name", ...issue.path] });
  }
});

const renameSessionSchema = z.object({
  name: tmuxSessionNameSchema
});

const renameWindowSchema = z.object({
  name: tmuxWindowNameSchema
});

const metadataPatchSchema = z.object({
  displayName: z.string().optional(),
  agentType: z.enum(["codex", "claude", "gemini", "shell", "build", "custom"]).optional(),
  cwd: z.string().optional(),
  command: z.string().optional(),
  tags: z.array(z.string()).optional()
});

const sendKeysSchema = z.object({
  command: z.string().min(1)
});

const inputTextSchema = z.object({
  text: z.string().min(1)
});

const createWindowSchema = z.object({
  name: tmuxWindowNameSchema.optional(),
  cwd: z.string().optional(),
  command: z.string().optional()
});

const splitPaneSchema = z.object({
  direction: z.enum(["horizontal", "vertical"]),
  cwd: z.string().optional(),
  command: z.string().optional()
});

const windowIndexSchema = z.coerce.number().int().min(0);
type SessionMetadataPatch = Parameters<typeof updateSessionMetadata>[1];

function touchTmuxSession(name: string, patch: SessionMetadataPatch = {}) {
  updateSessionMetadata(`tmux:${name}`, {
    ...patch,
    lastActiveAt: new Date().toISOString()
  });
}

async function forwardAgentRequest(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
  path: string
) {
  try {
    const host = getAgentHost(req.params.hostId);
    if (!host) {
      res.status(404).json({ error: "agent host not found" });
      return;
    }

    const result = await requestAgent<unknown>(host, path, {
      method: req.method,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {})
    });
    if (result === undefined) {
      res.status(204).send();
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json(loadConfig());
});

app.get("/api/skills", (_req, res, next) => {
  try {
    res.json({ codex: listCodexSkills() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions", async (_req, res, next) => {
  try {
    const [tmuxSessions, ptySessions, agentSessions] = await Promise.all([
      listTmuxSessions(),
      listPtySessions(),
      listAgentHostSessions()
    ]);
    const enrichedTmuxSessions = await enrichTmuxSessionsWithStatus(tmuxSessions.map(withSessionMetadata));
    res.json([...enrichedTmuxSessions, ...ptySessions.map(withSessionMetadata), ...agentSessions]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions", async (req, res, next) => {
  try {
    const input = createSessionSchema.parse(req.body);
    const agentType = input.agentType ?? inferAgentType(`${input.name} ${input.command ?? ""}`);
    const now = new Date().toISOString();
    if (input.type === "tmux") {
      const tmuxName = await resolveUniqueTmuxSessionName(input.name);
      await createTmuxSession({ ...input, name: tmuxName });
      const id = `tmux:${tmuxName}`;
      upsertSessionMetadata({
        id,
        name: tmuxName,
        hostId: "local",
        agentType,
        tmuxName,
        cwd: input.cwd,
        command: input.command,
        createdAt: now,
        lastActiveAt: now
      });
      res.status(201).json({ id });
      return;
    }

    if (!input.command) {
      res.status(400).json({ error: "command is required for pty sessions" });
      return;
    }
    const session = createPtySession({
      name: input.name,
      cwd: input.cwd,
      command: input.command,
      agentType
    });
    upsertSessionMetadata({
      id: session.id,
      name: session.name,
      hostId: "local",
      agentType,
      cwd: session.cwd,
      command: session.command,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt
    });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

app.post("/api/quick-launch/:index", async (req, res, next) => {
  try {
    const index = Number(req.params.index);
    const project = loadConfig().projects[index];
    if (!project) {
      res.status(404).json({ error: "quick launch not found" });
      return;
    }

    const safeName = project.name.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 60);
    const agentType = project.agentType ?? inferAgentType(`${project.name} ${project.command}`);
    const now = new Date().toISOString();
    if (project.tmux) {
      const tmuxName = await resolveUniqueTmuxSessionName(safeName);
      await createTmuxSession({ name: tmuxName, cwd: project.cwd, command: project.command });
      const id = `tmux:${tmuxName}`;
      upsertSessionMetadata({
        id,
        name: tmuxName,
        displayName: project.name,
        hostId: "local",
        agentType,
        tmuxName,
        cwd: project.cwd,
        command: project.command,
        createdAt: now,
        lastActiveAt: now,
        tags: project.tags
      });
      res.status(201).json({ id });
      return;
    }

    const session = createPtySession({
      name: project.name,
      cwd: project.cwd,
      command: project.command,
      agentType
    });
    upsertSessionMetadata({
      id: session.id,
      name: session.name,
      hostId: "local",
      agentType,
      cwd: session.cwd,
      command: session.command,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      tags: project.tags
    });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions/tmux/:name/snapshot", async (req, res, next) => {
  try {
    const snapshot = await captureTmuxPane(req.params.name, 120);
    res.json({
      sessionId: `tmux:${req.params.name}`,
      snapshot,
      status: detectSessionStatus(snapshot),
      capturedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/hosts/:hostId/sessions/tmux/:name/snapshot", async (req, res, next) => {
  try {
    const host = getAgentHost(req.params.hostId);
    if (!host) {
      res.status(404).json({ error: "agent host not found" });
      return;
    }

    res.json(await captureAgentSnapshot(host, req.params.name));
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/tmux/:name/send", async (req, res, next) => {
  try {
    const input = sendKeysSchema.parse(req.body);
    await sendKeysToTmuxSession(req.params.name, input.command);
    touchTmuxSession(req.params.name, { command: input.command });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/hosts/:hostId/sessions/tmux/:name/send", (req, res, next) => {
  forwardAgentRequest(req, res, next, `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/send`);
});

app.post("/api/sessions/tmux/:name/input", async (req, res, next) => {
  try {
    const input = inputTextSchema.parse(req.body);
    await sendLiteralToTmuxSession(req.params.name, input.text);
    touchTmuxSession(req.params.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/hosts/:hostId/sessions/tmux/:name/input", (req, res, next) => {
  forwardAgentRequest(req, res, next, `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/input`);
});

app.get("/api/sessions/tmux/:name/windows", async (req, res, next) => {
  try {
    const windows = await listTmuxWindows(req.params.name);
    res.json({ sessionId: `tmux:${req.params.name}`, windows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/hosts/:hostId/sessions/tmux/:name/windows", async (req, res, next) => {
  try {
    const host = getAgentHost(req.params.hostId);
    if (!host) {
      res.status(404).json({ error: "agent host not found" });
      return;
    }

    res.json(await listAgentTmuxWindows(host, req.params.name));
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/tmux/:name/windows", async (req, res, next) => {
  try {
    const input = createWindowSchema.parse(req.body);
    await createTmuxWindow(req.params.name, input);
    touchTmuxSession(req.params.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/hosts/:hostId/sessions/tmux/:name/windows", (req, res, next) => {
  forwardAgentRequest(req, res, next, `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/windows`);
});

app.post("/api/sessions/tmux/:name/windows/:windowIndex/select", async (req, res, next) => {
  try {
    const windowIndex = windowIndexSchema.parse(req.params.windowIndex);
    await selectTmuxWindow(req.params.name, windowIndex);
    touchTmuxSession(req.params.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/hosts/:hostId/sessions/tmux/:name/windows/:windowIndex/select", (req, res, next) => {
  forwardAgentRequest(
    req,
    res,
    next,
    `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/windows/${req.params.windowIndex}/select`
  );
});

app.patch("/api/sessions/tmux/:name/windows/:windowIndex", async (req, res, next) => {
  try {
    const windowIndex = windowIndexSchema.parse(req.params.windowIndex);
    const input = renameWindowSchema.parse(req.body);
    await renameTmuxWindow(req.params.name, windowIndex, input.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/hosts/:hostId/sessions/tmux/:name/windows/:windowIndex", (req, res, next) => {
  forwardAgentRequest(
    req,
    res,
    next,
    `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/windows/${req.params.windowIndex}`
  );
});

app.delete("/api/sessions/tmux/:name/windows/:windowIndex", async (req, res, next) => {
  try {
    const windowIndex = windowIndexSchema.parse(req.params.windowIndex);
    const windows = await listTmuxWindows(req.params.name);
    if (windows.length <= 1) {
      res.status(400).json({ error: "cannot close the last tmux window" });
      return;
    }
    await killTmuxWindow(req.params.name, windowIndex);
    touchTmuxSession(req.params.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/hosts/:hostId/sessions/tmux/:name/windows/:windowIndex", (req, res, next) => {
  forwardAgentRequest(
    req,
    res,
    next,
    `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/windows/${req.params.windowIndex}`
  );
});

app.post("/api/sessions/tmux/:name/windows/:windowIndex/panes/split", async (req, res, next) => {
  try {
    const windowIndex = windowIndexSchema.parse(req.params.windowIndex);
    const input = splitPaneSchema.parse(req.body);
    await splitTmuxPane(req.params.name, windowIndex, input);
    touchTmuxSession(req.params.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/hosts/:hostId/sessions/tmux/:name/windows/:windowIndex/panes/split", (req, res, next) => {
  forwardAgentRequest(
    req,
    res,
    next,
    `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/windows/${req.params.windowIndex}/panes/split`
  );
});

app.post("/api/sessions/tmux/:name/panes/:paneId/select", async (req, res, next) => {
  try {
    await selectTmuxPane(req.params.paneId);
    touchTmuxSession(req.params.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/hosts/:hostId/sessions/tmux/:name/panes/:paneId/select", (req, res, next) => {
  forwardAgentRequest(
    req,
    res,
    next,
    `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/panes/${encodeURIComponent(req.params.paneId)}/select`
  );
});

app.delete("/api/sessions/tmux/:name/panes/:paneId", async (req, res, next) => {
  try {
    await killTmuxPane(req.params.paneId);
    touchTmuxSession(req.params.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/hosts/:hostId/sessions/tmux/:name/panes/:paneId", (req, res, next) => {
  forwardAgentRequest(
    req,
    res,
    next,
    `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/panes/${encodeURIComponent(req.params.paneId)}`
  );
});

app.delete("/api/sessions/:type/:name", async (req, res, next) => {
  try {
    const { type, name } = req.params;
    const id = type === "tmux" ? `tmux:${name}` : `${type}:${name}`;
    if (type === "tmux") await killTmuxSession(name);
    else killPtySession(id);
    removeSessionMetadata(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/hosts/:hostId/sessions/tmux/:name", (req, res, next) => {
  forwardAgentRequest(req, res, next, `/api/sessions/tmux/${encodeURIComponent(req.params.name)}`);
});

app.patch("/api/sessions/tmux/:name", async (req, res, next) => {
  try {
    const input = renameSessionSchema.parse(req.body);
    await renameTmuxSession(req.params.name, input.name);
    renameSessionMetadata(`tmux:${req.params.name}`, `tmux:${input.name}`, input.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/hosts/:hostId/sessions/tmux/:name", (req, res, next) => {
  forwardAgentRequest(req, res, next, `/api/sessions/tmux/${encodeURIComponent(req.params.name)}`);
});

app.patch("/api/sessions/:type/:name/metadata", async (req, res, next) => {
  try {
    const { type, name } = req.params;
    const input = metadataPatchSchema.parse(req.body);
    updateSessionMetadata(`${type}:${name}`, {
      ...input,
      lastActiveAt: new Date().toISOString()
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/hosts/:hostId/sessions/tmux/:name/metadata", (req, res, next) => {
  forwardAgentRequest(req, res, next, `/api/sessions/tmux/${encodeURIComponent(req.params.name)}/metadata`);
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: zodErrorMessage(error) });
    return;
  }

  const message = error instanceof Error ? error.message : "unknown error";
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 3635);
const host = process.env.HOST ?? process.env.SESSION_CONTROL_HOST ?? "127.0.0.1";
const server = http.createServer(app);
attachTerminalSocket(server);

server.listen(port, host, () => {
  console.log(`session-control server listening on http://${host}:${port}`);
});
