import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AgentType, SessionSummary } from "./types.js";

const metadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().optional(),
  hostId: z.literal("local").default("local"),
  agentType: z.enum(["codex", "claude", "gemini", "shell", "build", "custom"]).default("shell"),
  tmuxName: z.string().optional(),
  cwd: z.string().optional(),
  command: z.string().optional(),
  createdAt: z.string().optional(),
  lastActiveAt: z.string().optional(),
  tags: z.array(z.string()).optional()
});

type SessionMetadata = z.infer<typeof metadataSchema>;

const storeSchema = z.object({
  sessions: z.record(metadataSchema).default({})
});

function storePath(): string {
  const configured = process.env.SESSION_CONTROL_DATA_DIR;
  const dataDir = configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), "../.session-control");
  return path.join(dataDir, "sessions.json");
}

function readStore(): { sessions: Record<string, SessionMetadata> } {
  const file = storePath();
  if (!fs.existsSync(file)) return { sessions: {} };
  const raw = fs.readFileSync(file, "utf8");
  return storeSchema.parse(JSON.parse(raw));
}

function writeStore(store: { sessions: Record<string, SessionMetadata> }): void {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

export function inferAgentType(value?: string): AgentType {
  const text = (value ?? "").toLowerCase();
  if (text.includes("codex")) return "codex";
  if (text.includes("claude")) return "claude";
  if (text.includes("gemini") || text.includes("agy")) return "gemini";
  if (text.includes("npm") || text.includes("pnpm") || text.includes("yarn") || text.includes("docker")) return "build";
  if (text.includes("zsh") || text.includes("bash") || text.includes("fish") || text.includes("$shell")) return "shell";
  return "custom";
}

export function getSessionMetadata(id: string): SessionMetadata | undefined {
  return readStore().sessions[id];
}

export function upsertSessionMetadata(metadata: SessionMetadata): void {
  const store = readStore();
  store.sessions[metadata.id] = metadataSchema.parse({
    ...store.sessions[metadata.id],
    ...metadata,
    hostId: "local"
  });
  writeStore(store);
}

export function updateSessionMetadata(
  id: string,
  patch: Partial<Pick<SessionMetadata, "displayName" | "agentType" | "cwd" | "command" | "tags" | "lastActiveAt">>
): void {
  const store = readStore();
  const current = store.sessions[id] ?? {
    id,
    name: id.replace(/^(tmux|pty):/, ""),
    hostId: "local",
    agentType: inferAgentType(id)
  };
  const normalizedPatch = {
    ...patch,
    displayName: patch.displayName?.trim() || undefined
  };
  store.sessions[id] = metadataSchema.parse({
    ...current,
    ...normalizedPatch,
    hostId: "local"
  });
  writeStore(store);
}

export function removeSessionMetadata(id: string): void {
  const store = readStore();
  delete store.sessions[id];
  writeStore(store);
}

export function renameSessionMetadata(id: string, nextId: string, nextName: string): void {
  const store = readStore();
  const current = store.sessions[id];
  if (!current) return;
  delete store.sessions[id];
  store.sessions[nextId] = {
    ...current,
    id: nextId,
    name: nextName,
    tmuxName: nextName
  };
  writeStore(store);
}

export function withSessionMetadata(session: SessionSummary): SessionSummary {
  const metadata = getSessionMetadata(session.id);
  const guessedAgentType = inferAgentType(`${session.name} ${session.command ?? ""}`);
  return {
    ...session,
    hostId: "local",
    displayName: metadata?.displayName,
    agentType: metadata?.agentType ?? session.agentType ?? guessedAgentType,
    tmuxName: metadata?.tmuxName ?? session.tmuxName,
    cwd: metadata?.cwd ?? session.cwd,
    command: metadata?.command ?? session.command,
    createdAt: metadata?.createdAt ?? session.createdAt,
    lastActiveAt: metadata?.lastActiveAt ?? session.lastActiveAt,
    tags: metadata?.tags ?? session.tags
  };
}
