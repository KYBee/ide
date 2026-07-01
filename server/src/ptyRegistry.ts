import os from "node:os";
import pty from "@homebridge/node-pty-prebuilt-multiarch";
import { expandHome } from "./config.js";
import { colorProcessEnv } from "./env.js";
import { inferAgentType } from "./metadataStore.js";
import type { AgentType, SessionSummary } from "./types.js";

interface PtyRecord {
  id: string;
  name: string;
  cwd: string;
  command: string;
  agentType: AgentType;
  createdAt: string;
  lastActiveAt: string;
  process: pty.IPty;
}

const records = new Map<string, PtyRecord>();

function splitCommand(command: string): [string, string[]] {
  return [process.env.SHELL ?? "/bin/zsh", ["-lc", command]];
}

export function listPtySessions(): SessionSummary[] {
  return Array.from(records.values()).map((record) => ({
    id: record.id,
    name: record.name,
    hostId: "local",
    type: "pty",
    agentType: record.agentType,
    cwd: record.cwd,
    command: record.command,
    status: "running",
    persistent: false,
    createdAt: record.createdAt,
    lastActiveAt: record.lastActiveAt
  }));
}

export function createPtySession(input: {
  name: string;
  cwd?: string;
  command: string;
  agentType?: AgentType;
  cols?: number;
  rows?: number;
}): SessionSummary {
  const id = `pty:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const cwd = expandHome(input.cwd || os.homedir());
  const [file, args] = splitCommand(input.command);
  const proc = pty.spawn(file, args, {
    name: "xterm-256color",
    cols: input.cols ?? 100,
    rows: input.rows ?? 30,
    cwd,
    env: colorProcessEnv()
  });
  const now = new Date().toISOString();
  const record: PtyRecord = {
    id,
    name: input.name,
    cwd,
    command: input.command,
    agentType: input.agentType ?? inferAgentType(`${input.name} ${input.command}`),
    createdAt: now,
    lastActiveAt: now,
    process: proc
  };
  records.set(id, record);

  proc.onExit(() => records.delete(id));
  proc.onData(() => {
    record.lastActiveAt = new Date().toISOString();
  });

  return {
    id,
    name: record.name,
    hostId: "local",
    type: "pty",
    agentType: record.agentType,
    cwd,
    command: record.command,
    status: "running",
    persistent: false,
    createdAt: now,
    lastActiveAt: now
  };
}

export function getPtyProcess(id: string): pty.IPty | undefined {
  return records.get(id)?.process;
}

export function killPtySession(id: string): boolean {
  const record = records.get(id);
  if (!record) return false;
  record.process.kill();
  records.delete(id);
  return true;
}
