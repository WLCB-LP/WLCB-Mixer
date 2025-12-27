/**
 * WLCB-Mixer — Server Gateway
 * =============================================================================
 *
 * v0.2.3 milestone:
 *  - DSP targets config + reachability probing (NO control yet)
 *  - Expose probe results on GET /api/status (Engineering)
 */

import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { execFile } from "node:child_process";
import { WebSocketServer } from "ws";
import { SymetrixMeterClient, type MeterDef } from "./symetrix.js";

const PORT = Number(process.env.PORT || 8080);

const ACTIVITY_FILE =
  process.env.ACTIVITY_FILE || "/var/lib/wlcb-mixer/last_activity_epoch";

const UPDATE_LAST_CHECK_FILE =
  process.env.UPDATE_LAST_CHECK_FILE ||
  "/var/lib/wlcb-mixer/update_last_check_epoch";
const UPDATE_LAST_DEPLOY_FILE =
  process.env.UPDATE_LAST_DEPLOY_FILE ||
  "/var/lib/wlcb-mixer/update_last_deploy_epoch";

type DspTarget = { id: string; name: string; ip: string; disabled?: boolean };

function loadDspTargets(): DspTarget[] {
  const raw = process.env.DSP_TARGETS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x: any) => ({
        id: String(x?.id ?? ""),
        name: String(x?.name ?? ""),
        ip: String(x?.ip ?? ""),
        disabled: Boolean(x?.disabled ?? false),
      }))
      .filter((t) => t.id && t.name && t.ip);
  } catch {
    return [];
  }
}


/**
 * Meter map config
 * -----------------------------------------------------------------------------
 * DSP_METER_MAP_JSON example:
 * {
 *   "aec": [
 *     {"id":"vu_program","label":"Program","controller":9001},
 *     {"id":"vu_rec","label":"Record","controller":9002}
 *   ]
 * }
 *
 * Keys must match DSP target IDs from DSP_TARGETS_JSON.
 */
function loadMeterMap(): Record<string, MeterDef[]> {
  const raw = process.env.DSP_METER_MAP_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, MeterDef[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!Array.isArray(v)) continue;
      out[k] = v
        .map((m: any) => ({
          id: String((m as any)?.id ?? ""),
          label: String((m as any)?.label ?? ""),
          controller: Number((m as any)?.controller ?? NaN),
        }))
        .filter((m) => m.id && m.label && Number.isFinite(m.controller));
    }
    return out;
  } catch {
    return {};
  }
}

const DSP_METER_PUSH_INTERVAL_MS = Number(process.env.DSP_METER_PUSH_INTERVAL_MS || 200);
const DSP_METER_PUSH_THRESHOLD = Number(process.env.DSP_METER_PUSH_THRESHOLD || 50);

const DSP_PROBE_PORT = Number(process.env.DSP_PROBE_PORT || 80);

function readReleaseId(): string | null {
  try {
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
    fs.writeFileSync(
      ACTIVITY_FILE,
      String(Math.floor(Date.now() / 1000)),
      "utf8"
    );
  } catch {}
}

type DspProbe = {
  id: string;
  name: string;
  ip: string;
  disabled?: boolean;
  ok: boolean | null;
  method?: "tcp" | "ping";
  rttMs?: number;
  lastCheckEpoch?: number;
  error?: string;
};

const dspStatus: Record<string, DspProbe> = {};

function ensureTargets() {
  for (const t of loadDspTargets()) {
    if (!dspStatus[t.id]) {
      dspStatus[t.id] = {
        id: t.id,
        name: t.name,
        ip: t.ip,
        disabled: t.disabled,
        ok: null,
      };
    } else {
      dspStatus[t.id].name = t.name;
      dspStatus[t.id].ip = t.ip;
      dspStatus[t.id].disabled = t.disabled;
    }
  }
}

function tcpProbe(ip: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const sock = new net.Socket();

    const finish = (err?: Error) => {
      sock.removeAllListeners();
      try {
        sock.destroy();
      } catch {}
      if (err) reject(err);
      else resolve(Date.now() - started);
    };

    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish());
    sock.once("timeout", () => finish(new Error("tcp timeout")));
    sock.once("error", (e) => finish(e as Error));
    sock.connect(port, ip);
  });
}

function pingProbe(ip: string, timeoutSec: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    execFile("/bin/ping", ["-c", "1", "-W", String(timeoutSec), ip], (err) => {
      if (err) return reject(err);
      resolve(Date.now() - started);
    });
  });
}

async function probeOne(t: DspTarget): Promise<void> {
  const slot = dspStatus[t.id];
  slot.lastCheckEpoch = Math.floor(Date.now() / 1000);

  if (t.disabled) {
    slot.ok = null;
    slot.error = "disabled";
    slot.method = undefined;
    slot.rttMs = undefined;
    return;
  }

  try {
    const rtt = await tcpProbe(t.ip, DSP_PROBE_PORT, 800);
    slot.ok = true;
    slot.method = "tcp";
    slot.rttMs = rtt;
    slot.error = undefined;
    return;
  } catch (e: any) {
    slot.ok = false;
    slot.method = "tcp";
    slot.rttMs = undefined;
    slot.error = String(e?.message || e);
  }

  try {
    const rtt = await pingProbe(t.ip, 1);
    slot.ok = true;
    slot.method = "ping";
    slot.rttMs = rtt;
    slot.error = undefined;
  } catch {
    // keep tcp failure info
  }
}

async function probeAll(): Promise<void> {
  ensureTargets();
  for (const t of loadDspTargets()) {
    await probeOne(t);
  }
}

setInterval(() => {
  probeAll().catch(() => {});
}, 5000);
probeAll().catch(() => {});


// -----------------------------------------------------------------------------
// Symetrix meter clients (Phase 1)
// -----------------------------------------------------------------------------
// We start with the Engineering DSP only (target id: "aec").
//
// Later we can enable studio DSPs in the same pattern.
const meterClients: Record<string, SymetrixMeterClient> = {};

(function startMeterClients() {
  const targets = loadDspTargets();
  const meterMap = loadMeterMap();

  for (const t of targets) {
    const meters = meterMap[t.id] || [];
    if (!meters.length) continue;
    if (t.id !== "aec") continue;

    const client = new SymetrixMeterClient({
      host: t.ip,
      port: 48631,
      meters,
      pushIntervalMs: DSP_METER_PUSH_INTERVAL_MS,
      pushThresholdMeter: DSP_METER_PUSH_THRESHOLD,
    });

    client.start();
    meterClients[t.id] = client;
  }
})();

const app = express();
const server = http.createServer(app);
const bootTimeMs = Date.now();

const wss = new WebSocketServer({ server, path: "/ws" });

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
    dsp: {
      probePort: DSP_PROBE_PORT,
      targets: Object.values(dspStatus),
    },
    meters: {
      pushIntervalMs: DSP_METER_PUSH_INTERVAL_MS,
      pushThreshold: DSP_METER_PUSH_THRESHOLD,
      targets: Object.keys(meterClients).map((id) => ({
        id,
        connected: meterClients[id].snapshot().connected,
        meterCount: meterClients[id].snapshot().meters.length,
      })),
    },
  });
});
app.get("/api/meters/:targetId", (req, res) => {
  const { targetId } = req.params;
  const c = meterClients[targetId];
  if (!c) return res.status(404).json({ error: "No meter client configured for targetId." });
  return res.json({ targetId, ...c.snapshot() });
});



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
    } catch {}
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WLCB-Mixer listening on http://0.0.0.0:${PORT}`);
});
