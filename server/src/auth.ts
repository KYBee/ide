import type express from "express";
import type { IncomingHttpHeaders } from "node:http";

function configuredToken(): string | undefined {
  return process.env.SESSION_CONTROL_AGENT_TOKEN;
}

export function isAuthEnabled(): boolean {
  return Boolean(configuredToken());
}

export function isAuthorized(headers: IncomingHttpHeaders): boolean {
  const token = configuredToken();
  if (!token) return true;

  const authorization = headers.authorization;
  if (authorization === `Bearer ${token}`) return true;

  const websocketProtocol = headers["sec-websocket-protocol"];
  if (typeof websocketProtocol === "string") {
    return websocketProtocol.split(",").map((value) => value.trim()).includes(`session-control-token.${token}`);
  }

  return false;
}

export function requireAgentToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (isAuthorized(req.headers)) {
    next();
    return;
  }

  res.status(401).json({ error: "unauthorized" });
}
