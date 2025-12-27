/**
 * WLCB-Mixer — Server Gateway
 * =============================================================================
 *
 * v0.2.1 milestone:
 *  - Add GET /api/status for the Engineering page
 *  - Report release id, uptime, WS client count, activity timestamps
 */

import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8080);

// Written by server when operators move controls (NOT meters)
const ACTIVITY_FILE =
  process.env.ACTIVITY_FILE || "/var/lib/wlcb-mixer/last_activity_epoch";

// Written by updater timer/script (root) so Engineering can see update behavior
const UPDATE_LAST_CHECK_FILE =
  process.env.UPDATE_LAST_CHECK_FILE ||
  "/var/lib/wlcb-mixer/update_last_check_epoch";
const UPDATE_LAST_DEPLOY_FILE =
  process.env.UPDATE_LAST_DEPLOY_FILE ||
  "/var/lib/wlcb-mixer/update_last_deploy_epoch";

function readReleaseId(): string | null {
  try {
    // WorkingDirectory is /opt/wlcb-mixer/current/server
    const p = path.resolve(process.cwd(), "..", ".release_id");
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function readEpochFile(filePath: string): number | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function markOperatorActivity(): void {
  try {
    fs.mkdirSync(path.dirname(ACTIVITY_FILE), { recursive: true });
    fs.writeFileSync(ACTIVITY_FILE, String(Math.floor(Date.now() / 1000)), "utf8");
  } catch {
    // Non-fatal by design
  }
}

const app = express();
const server = http.createServer(app);
const bootTimeMs = Date.now();

/**
 * WebSocket server
 * (declared before /api/status uses it so TypeScript knows it's defined)
 */
const wss = new WebSocketServer({ server, path: "/ws" });

/**
 * Engineering status endpoint
 */
app.get("/api/status", (_req, res) => {
  res.json({
    app: "WLCB-Mixer",
    releaseId: readReleaseId(),
    nowEpoch: Math.floor(Date.now() / 1000),
    bootTimeEpoch: Math.floor(bootTimeMs / 1000),
    uptimeSec: Math.floor(process.uptime()),
    wsClients: wss.clients.size,
    lastOperatorActivityEpoch: readEpochFile(ACTIVITY_FILE),
    update: {
      lastCheckEpoch: readEpochFile(UPDATE_LAST_CHECK_FILE),
      lastDeployEpoch: readEpochFile(UPDATE_LAST_DEPLOY_FILE),
    },
  });
});

/**
 * Serve UI
 */
const publicDir = path.resolve("./public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
} else {
  app.get("/", (_req, res) =>
    res.type("text/plain").send("WLCB-Mixer server running (UI not built yet).")
  );
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", app: "WLCB-Mixer", ts: Date.now() }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(String(data));
      if (msg?.type === "control") {
        markOperatorActivity();
        ws.send(JSON.stringify({ type: "ack", id: msg.id ?? null }));
      }
    } catch {
      // ignore malformed messages
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WLCB-Mixer listening on http://0.0.0.0:${PORT}`);
});
