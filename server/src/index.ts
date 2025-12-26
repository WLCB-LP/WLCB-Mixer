import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 80);
const ACTIVITY_FILE = process.env.ACTIVITY_FILE || "/var/lib/wlcb-mixer/last_activity_epoch";

function markOperatorActivity() {
  try {
    fs.mkdirSync(path.dirname(ACTIVITY_FILE), { recursive: true });
    fs.writeFileSync(ACTIVITY_FILE, String(Math.floor(Date.now() / 1000)), "utf8");
  } catch {
    // Non-fatal
  }
}

const app = express();
const server = http.createServer(app);

// Serve UI if built
const publicDir = path.resolve("./public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
} else {
  app.get("/", (_req, res) => {
    res.type("text/plain").send("WLCB-Mixer server running. Build the UI to serve a web interface.");
  });
}

// WebSocket for control/meter messaging (placeholder)
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", app: "WLCB-Mixer", ts: Date.now() }));

  ws.on("message", (data) => {
    // Expect JSON messages from UI
    try {
      const msg = JSON.parse(String(data));
      if (msg?.type === "control") {
        // TODO: forward to Symetrix
        markOperatorActivity();
        ws.send(JSON.stringify({ type: "ack", id: msg.id ?? null }));
      }
    } catch {
      // ignore bad data
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WLCB-Mixer listening on http://0.0.0.0:${PORT}`);
});
