import type { AgentType } from "./api";

export const LAUNCH_AGENT_TYPES = ["codex", "claude", "gemini", "shell"] as const satisfies readonly AgentType[];

export type LaunchAgentType = (typeof LAUNCH_AGENT_TYPES)[number];

export function agentCommand(agentType: AgentType): string | undefined {
  if (agentType === "codex") return "codex";
  if (agentType === "claude") return "claude";
  if (agentType === "gemini") return "agy";
  return undefined;
}

export function agentLabel(agentType: AgentType): string {
  if (agentType === "codex") return "Codex";
  if (agentType === "claude") return "Claude";
  if (agentType === "gemini") return "Gemini";
  if (agentType === "shell") return "Shell";
  if (agentType === "build") return "Build";
  return "Custom";
}

export function agentWindowName(agentType: AgentType, index: number): string {
  if (agentType === "shell") return `zsh-${index}`;
  return `${agentType}-${index}`;
}
