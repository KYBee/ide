import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import type { AppConfig } from "./types.js";

const DEFAULT_HOSTS = [{ id: "local", label: "Local", type: "local" as const }];

const hostIdSchema = z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/);

const localHostSchema = z.object({
  id: hostIdSchema.default("local"),
  label: z.string().min(1).default("Local"),
  type: z.literal("local")
});

const agentHostSchema = z.object({
  id: hostIdSchema,
  label: z.string().min(1),
  type: z.literal("agent"),
  baseUrl: z.string().url(),
  tokenEnv: z.string().min(1).optional(),
  token: z.string().min(1).optional()
});

const projectSchema = z.object({
  name: z.string().min(1),
  cwd: z.string().min(1),
  command: z.string().min(1),
  tmux: z.boolean().default(true),
  agentType: z.enum(["codex", "claude", "gemini", "shell", "build", "custom"]).optional(),
  tags: z.array(z.string()).optional()
});

const configSchema = z.object({
  hosts: z.array(z.discriminatedUnion("type", [localHostSchema, agentHostSchema])).default(DEFAULT_HOSTS),
  projects: z.array(projectSchema).default([])
});

export function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function loadConfig(): AppConfig {
  const configuredPath = process.env.SESSION_CONTROL_CONFIG;
  const configPath = configuredPath
    ? expandHome(configuredPath)
    : path.resolve(process.cwd(), "../config/projects.yaml");

  if (!fs.existsSync(configPath)) {
    return { hosts: DEFAULT_HOSTS, projects: [] };
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = yaml.load(raw) ?? {};
  const config = configSchema.parse(parsed);

  return {
    hosts: config.hosts.map((host) => {
      if (host.type === "local") return host;
      return {
        id: host.id,
        label: host.label,
        type: host.type,
        baseUrl: host.baseUrl.replace(/\/+$/, ""),
        tokenEnv: host.tokenEnv
      };
    }),
    projects: config.projects.map((project) => ({
      ...project,
      cwd: expandHome(project.cwd)
    }))
  };
}
