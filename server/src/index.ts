/**
 * WLCB-Mixer — Server Gateway
 * =============================================================================
 *
 * This Node.js service is the "bridge" between:
 *   1) Operator browsers (the web mixer UI), and
 *   2) Symetrix Radius DSP control (to be implemented next).
 *
 * Why a server at all?
 * -------------------
 * Browsers are a poor place to talk directly to DSPs because:
 *   - Security: you would expose DSP IPs/ports (and any credentials) to clients.
 *   - Networking: browsers can't easily do raw TCP/UDP the way embedded DSP control
 *     protocols often expect.
 *   - Reliability: you typically want ONE stable connection to the DSP, even if
 *     multiple tablets are open. A server can multiplex many UIs to one DSP.
 *
 * This file is intentionally **heavily commented** to make it educational and
 * maintainable for future co-developers.
 *
 * Current status (v0.1.x)
 * -----------------------
 * - Serves the compiled UI from ./public (copied there during build)
 * - Hosts a WebSocket endpoint at /ws
 * - Tracks operator activity by writing a timestamp file (for safe auto-updates)
 * - Provides a placeholder control-message flow (UI -> server -> ACK)
 *
 * Next milestone
 * --------------
 * Implement Symetrix Radius control protocol:
 * - Translate incoming UI control messages to Composer control commands
 * - Read back current levels/mutes and broadcast state to connected clients
 * - Poll or subscribe for meter levels and broadcast meter frames to the UI
 */

import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { WebSocketServer } from "ws";

/**
 * Runtime configuration
 * =============================================================================
 * The installer writes /etc/wlcb-mixer/config.env, and systemd loads it via
 * EnvironmentFile=... in wlcb-mixer.service.
 *
 * IMPORTANT: We default to PORT 8080 because processes running as a normal user
 * (wlcb) cannot bind to privileged ports (<1024) without extra capabilities.
 */
const PORT = Number(process.env.PORT || 8080);

/**
 * Activity file
 * =============================================================================
 * We write a single Unix epoch timestamp (seconds) whenever an operator changes
 * a control (fader, ON/OFF, etc.). This allows an auto-updater to say:
 *   "Only update if nobody touched the mixer for >= 30 minutes."
 *
 * NOTE: Meter polling should NOT update this file. Only real operator actions.
 */
const ACTIVITY_FILE =
  process.env.ACTIVITY_FILE || "/var/lib/wlcb-mixer/last_activity_epoch";

/**
 * markOperatorActivity()
 * =============================================================================
 * Writes the last operator action timestamp to ACTIVITY_FILE.
 *
 * Why write to disk instead of memory?
 * - The updater runs as a separate systemd unit/process. A file is a simple,
 *   robust "shared state" mechanism between processes.
 */
function markOperatorActivity(): void {
  try {
    fs.mkdirSync(path.dirname(ACTIVITY_FILE), { recursive: true });
    fs.writeFileSync(ACTIVITY_FILE, String(Math.floor(Date.now() / 1000)), "utf8");
  } catch {
    // Non-fatal: we do not want UI control to crash because of a disk write issue.
  }
}

/**
 * HTTP server
 * =============================================================================
 * We use Express primarily to serve static UI files.
 * The WebSocket server attaches to the same underlying HTTP server so the UI
 * can reach both HTTP and WS on the same port.
 */
const app = express();
const server = http.createServer(app);

/**
 * Serve UI
 * =============================================================================
 * The UI (React/Vite) is built into ui/dist. Our server build step copies it to
 * server/public so production runtime is self-contained under /opt/wlcb-mixer.
 */
const publicDir = path.resolve("./public");

if (fs.existsSync(publicDir)) {
  // Serve static assets (JS/CSS/images)
  app.use(express.static(publicDir));

  // Single-page app fallback: unknown paths return index.html
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
} else {
  // Helpful message if server is started before UI build occurs
  app.get("/", (_req, res) => {
    res
      .type("text/plain")
      .send("WLCB-Mixer server running. Build the UI to serve a web interface.");
  });
}

/**
 * WebSocket server
 * =============================================================================
 * The UI connects to ws://<host>:<port>/ws
 *
 * Message design (current prototype)
 * ----------------------------------
 * UI -> server:
 *   { type: "control", id: "<channel-id>", value: 0..1, on: true|false }
 *
 * server -> UI:
 *   { type: "hello", app: "WLCB-Mixer", ts: 1234567890 }
 *   { type: "ack", id: "<channel-id>" }
 *
 * Later we will add:
 *   - { type: "state", ... } (full mixer state snapshot)
 *   - { type: "meter", ... } (meter frames at ~5-15Hz for confidence monitoring)
 */
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  // Greeting lets the UI confirm it connected to the right service/version
  ws.send(JSON.stringify({ type: "hello", app: "WLCB-Mixer", ts: Date.now() }));

  ws.on("message", (data) => {
    // We only accept JSON messages
    try {
      const msg = JSON.parse(String(data));

      if (msg?.type === "control") {
        /**
         * Operator action detected.
         * In the next milestone this is where we translate the UI message into
         * Symetrix control protocol commands.
         */
        markOperatorActivity();

        // Acknowledge receipt (UI can use this for debugging or optimistic UI)
        ws.send(JSON.stringify({ type: "ack", id: msg.id ?? null }));
      }
    } catch {
      // Ignore malformed payloads. Avoid crashing the server on bad input.
    }
  });
});

/**
 * Start listening
 * =============================================================================
 * Bind on all interfaces so tablets/PCs on the LAN can reach the UI.
 */
server.listen(PORT, "0.0.0.0", () => {
  console.log(`WLCB-Mixer listening on http://0.0.0.0:${PORT}`);
});
