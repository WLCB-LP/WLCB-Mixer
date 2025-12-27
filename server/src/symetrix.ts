/**
 * server/src/symetrix.ts
 * =============================================================================
 * Symetrix Composer Control Protocol client (minimal, read-only metering).
 *
 * Design goals for Phase 1:
 *  - Keep ONE TCP session open to a Symetrix DSP and ingest PUSHED meter updates.
 *  - No writes to the DSP (other than enabling push + setting push interval/threshold).
 *  - Safe by default: if config is missing/invalid, we do nothing.
 *
 * Protocol facts (Composer Control Protocol v7.0):
 *  - Ethernet control uses TCP/UDP port 48631.
 *  - Commands are ASCII terminated by a carriage return \r.
 *  - Push output format is: #<CONTROLLER>=<VALUE>\r (both 5 digits, leading zeros).
 */

import net from "node:net";

export type MeterDef = { id: string; label: string; controller: number };
export type MeterValue = {
  id: string;
  label: string;
  controller: number;
  raw: number | null;        // 0..65535
  lastEpoch: number | null;  // unix seconds
};

type Options = {
  host: string;
  port?: number; // default 48631
  quietMode?: boolean; // SQ 1
  echoMode?: boolean;  // EH 0
  pushIntervalMs?: number;      // PUI <ms>
  pushThresholdMeter?: number;  // PUT <param> <meter>
  meters: MeterDef[];
};

const DEFAULT_PORT = 48631;

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

function parsePushLine(line: string): { controller: number; value: number } | null {
  const m = line.match(/^#(\d{5})=(\d{5})$/);
  if (!m) return null;
  return { controller: Number(m[1]), value: Number(m[2]) };
}

export class SymetrixMeterClient {
  private opt: Options;
  private sock: net.Socket | null = null;
  private buffer = "";
  private values: Record<string, MeterValue> = {};
  private byController: Map<number, string> = new Map();
  private connected = false;
  private lastConnectEpoch: number | null = null;
  private lastError: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(opt: Options) {
    this.opt = {
      ...opt,
      port: opt.port ?? DEFAULT_PORT,
      quietMode: opt.quietMode ?? true,
      echoMode: opt.echoMode ?? false,
    };

    for (const m of opt.meters) {
      this.values[m.id] = { id: m.id, label: m.label, controller: m.controller, raw: null, lastEpoch: null };
      this.byController.set(m.controller, m.id);
    }
  }

  start(): void {
    if (!this.opt.meters.length) return;
    this.connect();
  }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connected = false;
    try { this.sock?.destroy(); } catch {}
    this.sock = null;
  }

  snapshot(): { connected: boolean; lastConnectEpoch: number | null; lastError: string | null; meters: MeterValue[] } {
    return { connected: this.connected, lastConnectEpoch: this.lastConnectEpoch, lastError: this.lastError, meters: Object.values(this.values) };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private send(cmd: string): void {
    this.sock?.write(cmd + "\r");
  }

  private connect(): void {
    this.stop();

    const sock = new net.Socket();
    this.sock = sock;
    sock.setNoDelay(true);

    sock.on("connect", () => {
      this.connected = true;
      this.lastError = null;
      this.lastConnectEpoch = nowEpoch();

      // Keep output consistent for parsing
      if (this.opt.quietMode) this.send("SQ 1");
      if (this.opt.echoMode === false) this.send("EH 0");

      // Symetrix guidance: PU 1 globally, then PUE per controller.
      this.send("PU 1");

      if (this.opt.pushIntervalMs) this.send(`PUI ${Math.floor(this.opt.pushIntervalMs)}`);

      if (typeof this.opt.pushThresholdMeter === "number") {
        const t = Math.max(0, Math.min(65535, Math.floor(this.opt.pushThresholdMeter)));
        this.send(`PUT ${t} ${t}`);
      }

      for (const m of this.opt.meters) this.send(`PUE ${m.controller}`);
    });

    sock.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      const parts = this.buffer.split("\r");
      this.buffer = parts.pop() ?? "";
      for (const rawLine of parts) {
        const line = rawLine.trim();
        if (!line) continue;
        const parsed = parsePushLine(line);
        if (!parsed) continue;
        const id = this.byController.get(parsed.controller);
        if (!id) continue;
        this.values[id].raw = parsed.value;
        this.values[id].lastEpoch = nowEpoch();
      }
    });

    sock.on("error", (e) => { this.lastError = String((e as any)?.message || e); });
    sock.on("close", () => { this.connected = false; this.scheduleReconnect(); });

    sock.connect(this.opt.port!, this.opt.host);
  }
}
