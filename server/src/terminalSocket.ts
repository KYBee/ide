import { WebSocket, WebSocketServer } from "ws";
import pty from "@homebridge/node-pty-prebuilt-multiarch";
import type { Server } from "node:http";
import { execFile } from "node:child_process";
import { cleanProcessEnv } from "./env.js";
import { getPtyProcess } from "./ptyRegistry.js";
import { isAuthorized } from "./auth.js";
import { createAgentTerminalSocket, getAgentHost } from "./agentHosts.js";

function parseSessionId(url?: string): string | undefined {
  if (!url) return undefined;
  const requestUrl = new URL(url, "http://127.0.0.1");
  return requestUrl.searchParams.get("session") ?? undefined;
}

function spawnTmuxAttach(name: string, cols: number, rows: number): pty.IPty {
  return pty.spawn("tmux", ["attach-session", "-d", "-t", `=${name}`], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: process.env.HOME,
    env: cleanProcessEnv()
  });
}

function refreshTmuxClient(name: string, cols: number, rows: number): void {
  execFile("tmux", ["refresh-client", "-t", `=${name}:`, "-C", `${cols},${rows}`], {
    env: cleanProcessEnv()
  }, () => {
    // Some tmux versions do not support resizing a client this way; the pty resize still applies.
  });
}

function parseRemoteTmuxSessionId(sessionId: string): { hostId: string; name: string } | undefined {
  const match = /^tmux:([^:]+):(.+)$/.exec(sessionId);
  if (!match) return undefined;
  return { hostId: match[1], name: match[2] };
}

function bridgeRemoteTerminal(socket: WebSocket, remoteSocket: WebSocket): void {
  const pendingMessages: WebSocket.RawData[] = [];

  socket.on("message", (raw) => {
    if (remoteSocket.readyState === WebSocket.OPEN) {
      remoteSocket.send(raw);
      return;
    }
    pendingMessages.push(raw);
  });

  remoteSocket.on("open", () => {
    for (const message of pendingMessages.splice(0)) remoteSocket.send(message);
  });

  remoteSocket.on("message", (raw) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(raw);
  });

  remoteSocket.on("close", () => {
    if (socket.readyState === WebSocket.OPEN) socket.close();
  });

  remoteSocket.on("error", () => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "error", message: "remote terminal connection failed" }));
      socket.close(1011, "remote terminal connection failed");
    }
  });

  socket.on("close", () => {
    remoteSocket.close();
  });
}

export function attachTerminalSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/term" });

  wss.on("connection", (socket, request) => {
    if (!isAuthorized(request.headers)) {
      socket.close(1008, "unauthorized");
      return;
    }

    const sessionId = parseSessionId(request.url);
    if (!sessionId) {
      socket.close(1008, "missing session id");
      return;
    }

    const remoteTmuxSession = parseRemoteTmuxSessionId(sessionId);
    if (remoteTmuxSession) {
      const host = getAgentHost(remoteTmuxSession.hostId);
      if (!host) {
        socket.close(1008, "agent host not found");
        return;
      }

      const remoteSocket = createAgentTerminalSocket(host, remoteTmuxSession.name);
      bridgeRemoteTerminal(socket, remoteSocket);
      return;
    }

    let cols = 100;
    let rows = 30;
    let terminal: pty.IPty | undefined;
    let ownsProcess = false;
    let tmuxName: string | undefined;

    try {
      if (sessionId.startsWith("tmux:")) {
        tmuxName = sessionId.slice("tmux:".length);
        terminal = spawnTmuxAttach(tmuxName, cols, rows);
        ownsProcess = true;
      } else if (sessionId.startsWith("pty:")) {
        terminal = getPtyProcess(sessionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to attach session";
      socket.send(JSON.stringify({ type: "error", message }));
      socket.close(1011, message);
      return;
    }

    if (!terminal) {
      socket.close(1008, "session not found");
      return;
    }

    const dataDisposable = terminal.onData((data) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "data", data }));
    });

    const exitDisposable = terminal.onExit(({ exitCode }) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "exit", exitCode }));
      socket.close();
    });

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as
          | { type: "input"; data: string }
          | { type: "resize"; cols: number; rows: number };
        if (message.type === "input") terminal?.write(message.data);
        if (message.type === "resize") {
          cols = message.cols;
          rows = message.rows;
          terminal?.resize(cols, rows);
          if (tmuxName) refreshTmuxClient(tmuxName, cols, rows);
        }
      } catch {
        socket.close(1003, "invalid terminal message");
      }
    });

    socket.on("close", () => {
      dataDisposable.dispose();
      exitDisposable.dispose();
      if (ownsProcess) terminal?.kill();
    });
  });
}
