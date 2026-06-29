import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import type { AppConfig } from "./types.js";

const projectSchema = z.object({
  name: z.string().min(1),
  cwd: z.string().min(1),
  command: z.string().min(1),
  tmux: z.boolean().default(true),
  agentType: z.enum(["codex", "claude", "gemini", "shell", "build", "custom"]).optional(),
  tags: z.array(z.string()).optional()
});

const configSchema = z.object({
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
    return { projects: [] };
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = yaml.load(raw) ?? {};
  const config = configSchema.parse(parsed);

  return {
    projects: config.projects.map((project) => ({
      ...project,
      cwd: expandHome(project.cwd)
    }))
  };
}
