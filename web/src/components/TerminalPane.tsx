import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { SessionSummary } from "../lib/api";

interface TerminalPaneProps {
  session?: SessionSummary;
}

export function TerminalPane({ session }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | undefined>();
  const reconnectAttemptRef = useRef(0);
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "connected" | "closed" | "error">("idle");
  const [message, setMessage] = useState<string>();
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const reconnect = useCallback(() => {
    socketRef.current?.close();
    setReconnectNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!hostRef.current || !session) {
      setConnectionState("idle");
      setMessage(undefined);
      return;
    }

    setConnectionState("connecting");
    setMessage(`Attaching ${session.name}`);

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: "#101418",
        foreground: "#e7edf2",
        cursor: "#f7c948",
        selectionBackground: "#334155"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    hostRef.current.replaceChildren();
    terminal.open(hostRef.current);
    fitAddon.fit();
    terminal.focus();

    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    let disposed = false;
    let resizeFrame: number | undefined;
    const sendResize = () => {
      if (disposed) return;
      fitAddon.fit();
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        const cols = Math.max(terminal.cols, 40);
        const rows = Math.max(terminal.rows, 10);
        socket.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    };
    const scheduleResize = () => {
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(sendResize);
    };

    const openSocket = () => {
      if (disposed) return;
      window.clearTimeout(reconnectTimerRef.current);
      setConnectionState("connecting");
      setMessage(reconnectAttemptRef.current > 0
        ? `Reconnecting ${session.displayName ?? session.name}`
        : `Attaching ${session.displayName ?? session.name}`);

      const socket = new WebSocket(`${scheme}://${window.location.host}/term?session=${encodeURIComponent(session.id)}`);
      socketRef.current = socket;
      let shouldReconnect = true;

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        setConnectionState("connected");
        setMessage(undefined);
        sendResize();
        window.setTimeout(sendResize, 50);
        window.setTimeout(sendResize, 250);
      });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "data") terminal.write(message.data);
        if (message.type === "exit") {
          shouldReconnect = false;
          setConnectionState("closed");
          setMessage(`Process exited: ${message.exitCode}`);
          terminal.writeln(`\r\n[process exited: ${message.exitCode}]`);
        }
        if (message.type === "error") {
          shouldReconnect = false;
          setConnectionState("error");
          setMessage(message.message ?? "Failed to attach session");
          terminal.writeln(`\r\n[attach error] ${message.message ?? "Failed to attach session"}`);
        }
      });
      socket.addEventListener("error", () => {
        setConnectionState("error");
        setMessage("Terminal connection failed");
      });
      socket.addEventListener("close", () => {
        if (disposed || socketRef.current !== socket) return;
        if (!shouldReconnect) return;
        reconnectAttemptRef.current += 1;
        const delay = Math.min(1000 * reconnectAttemptRef.current, 5000);
        setConnectionState("closed");
        setMessage(`Reconnecting in ${Math.round(delay / 1000)}s`);
        terminal.writeln("\r\n[detached, reconnecting]");
        reconnectTimerRef.current = window.setTimeout(openSocket, delay);
      });
    };

    openSocket();

    const inputDisposable = terminal.onData((data) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(hostRef.current);

    return () => {
      disposed = true;
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      window.clearTimeout(reconnectTimerRef.current);
      resizeObserver.disconnect();
      inputDisposable.dispose();
      socketRef.current?.close();
      socketRef.current = null;
      reconnectAttemptRef.current = 0;
      terminal.dispose();
    };
  }, [session?.id, reconnectNonce]);

  if (!session) {
    return (
      <div className="terminal-empty">
        <div>
          <p>Select a session</p>
          <span>Attach to tmux or launch a new pty from the controls.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-frame">
      <div className="terminal-toolbar">
        <div>
          <strong title={session.name}>{session.displayName ?? session.name}</strong>
          <span>{session.type === "tmux" ? "tmux attach" : "pty"} · {session.agentType}</span>
        </div>
        <div className={`connection-pill ${connectionState}`}>
          {message ?? connectionState}
        </div>
        <button className="reconnect-button" onClick={reconnect} title="Reconnect terminal">
          Reconnect
        </button>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
