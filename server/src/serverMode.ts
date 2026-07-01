export type ServerMode = "coordinator" | "agent";

export function serverMode(): ServerMode {
  return process.env.SESSION_CONTROL_MODE === "agent" ? "agent" : "coordinator";
}
