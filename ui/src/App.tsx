/**
 * WLCB-Mixer — UI App Shell
 * =============================================================================
 *
 * GOAL (this milestone)
 * ---------------------
 * Add a simple landing page that lets operators choose:
 *   - Studio A
 *   - Studio B
 *   - Engineering
 *
 * WHY NOT React Router (yet)?
 * ---------------------------
 * We *could* add react-router, but early on it's helpful to keep dependencies
 * minimal. A simple hash-based router is:
 *   - zero extra dependencies,
 *   - works on a static-file hosted SPA,
 *   - easy to understand for learning and future maintenance.
 */

import React, { useEffect, useRef, useState } from "react";

type Route = "landing" | "studio-a" | "studio-b" | "engineering";

type Strip = {
  id: string;
  label: string;
  level: number; // 0..1 (placeholder scale for now)
  on: boolean;
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/**
 * Hash-based routing helpers
 * =============================================================================
 * We use URLs like:
 *   http://host:8080/#/studio-a
 *
 * This avoids server-side routing complexity and works with static hosting.
 */
function parseRouteFromHash(): Route {
  const h = (window.location.hash || "").toLowerCase();

  if (h.startsWith("#/studio-a")) return "studio-a";
  if (h.startsWith("#/studio-b")) return "studio-b";
  if (h.startsWith("#/engineering")) return "engineering";
  return "landing";
}

function navigate(route: Route) {
  const target = route === "landing" ? "#/" : `#/${route}`;
  window.location.hash = target;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRouteFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseRouteFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // WebSocket (shared across pages)
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`${location.origin.replace("http", "ws")}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = () => {
      // TODO: handle state/meter messages
    };

    return () => ws.close();
  }, []);

  function sendControl(id: string, payload: any) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "control", id, ...payload }));
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#101216",
        color: "#eaeef5",
        minHeight: "100vh",
      }}
    >
      <Header connected={connected} route={route} onHome={() => navigate("landing")} />

      <main style={{ padding: 20 }}>
        {route === "landing" && (
          <LandingPage
            onSelectStudioA={() => navigate("studio-a")}
            onSelectStudioB={() => navigate("studio-b")}
            onSelectEngineering={() => navigate("engineering")}
          />
        )}

        {route === "studio-a" && (
          <StudioPage
            title="Studio A"
            strips={[
              { id: "mic1", label: "MIC 1", level: 0.6, on: true },
              { id: "mic2", label: "MIC 2", level: 0.4, on: false },
              { id: "cd1", label: "CD 1 (L/R)", level: 0.2, on: true },
              { id: "pc", label: "PC (L/R)", level: 0.5, on: true },
            ]}
            onControl={sendControl}
          />
        )}

        {route === "studio-b" && (
          <StudioPage
            title="Studio B"
            strips={[
              { id: "mic1", label: "MIC 1", level: 0.6, on: true },
              { id: "mic2", label: "MIC 2", level: 0.4, on: false },
              { id: "turn1", label: "TT 1 (L/R)", level: 0.3, on: true },
              { id: "turn2", label: "TT 2 (L/R)", level: 0.3, on: true },
            ]}
            onControl={sendControl}
          />
        )}

        {route === "engineering" && <EngineeringPage />}
      </main>
    </div>
  );
}

function Header({
  connected,
  route,
  onHome,
}: {
  connected: boolean;
  route: Route;
  onHome: () => void;
}) {
  const subtitle =
    route === "landing"
      ? "Select a room"
      : route === "engineering"
      ? "Engineering"
      : route === "studio-a"
      ? "Studio A"
      : "Studio B";

  return (
    <header
      style={{
        padding: "16px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>WLCB-Mixer</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {subtitle} • WS: {connected ? "Connected" : "Disconnected"}
        </div>
      </div>

      <button
        onClick={onHome}
        style={{
          border: "none",
          borderRadius: 10,
          padding: "10px 12px",
          background: "#303747",
          color: "#eaeef5",
          fontWeight: 700,
          cursor: "pointer",
        }}
        title="Return to landing page"
      >
        Home
      </button>
    </header>
  );
}

function LandingPage({
  onSelectStudioA,
  onSelectStudioB,
  onSelectEngineering,
}: {
  onSelectStudioA: () => void;
  onSelectStudioB: () => void;
  onSelectEngineering: () => void;
}) {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ margin: "10px 0 6px" }}>Choose a room</h2>
      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        This is the operator entry point. Each room has its own mixer layout.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        <RoomCard title="Studio A" description="Primary studio mixer surface" onClick={onSelectStudioA} />
        <RoomCard title="Studio B" description="Secondary studio mixer surface" onClick={onSelectStudioB} />
        <RoomCard title="Engineering" description="Meters, routing status, diagnostics (restricted)" onClick={onSelectEngineering} />
      </div>
    </div>
  );
}

function RoomCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        border: "none",
        borderRadius: 14,
        padding: 16,
        background: "#171a20",
        color: "#eaeef5",
        cursor: "pointer",
        boxShadow: "0 10px 20px rgba(0,0,0,.25)",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>{description}</div>
      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>Open →</div>
    </button>
  );
}

function StudioPage({
  title,
  strips: initialStrips,
  onControl,
}: {
  title: string;
  strips: Strip[];
  onControl: (id: string, payload: any) => void;
}) {
  const [strips, setStrips] = useState<Strip[]>(initialStrips);

  return (
    <div>
      <h2 style={{ margin: "10px 0 12px" }}>{title}</h2>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {strips.map((s) => (
          <ChannelStrip
            key={s.id}
            strip={s}
            onChange={(next) => {
              setStrips((prev) => prev.map((p) => (p.id === s.id ? next : p)));
              onControl(s.id, { value: next.level, on: next.on });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function EngineeringPage() {
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        if (alive) {
          setStatus(json);
          setError(null);
        }
      } catch (e: any) {
        if (alive) setError(String(e?.message || e));
      }
    }

    tick();
    const t = window.setInterval(tick, 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  function fmtEpoch(epoch?: number | null) {
    if (!epoch) return "—";
    const d = new Date(epoch * 1000);
    return d.toLocaleString();
  }

  function fmtAge(epoch?: number | null) {
    if (!epoch) return "—";
    const sec = Math.max(0, Math.floor(Date.now() / 1000 - epoch));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ${min % 60}m ago`;
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <h2 style={{ margin: "10px 0 6px" }}>Engineering</h2>
      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        System status, versioning, and operational visibility.
      </div>

      <div
        style={{
          borderRadius: 14,
          background: "#171a20",
          padding: 16,
          boxShadow: "0 10px 20px rgba(0,0,0,.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>System Status</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {status ? `Live • WS clients: ${status.wsClients}` : "Loading…"}
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              background: "#2a1a1a",
            }}
          >
            <div style={{ fontWeight: 800 }}>Error</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{error}</div>
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <InfoCard
            title="Release"
            value={status?.releaseId || "—"}
            hint="Short commit id from atomic release (.release_id)"
          />
          <InfoCard
            title="Uptime"
            value={status ? `${status.uptimeSec}s` : "—"}
            hint="Server process uptime"
          />
          <InfoCard
            title="WS Clients"
            value={status ? String(status.wsClients) : "—"}
            hint="Connected operator browsers"
          />
          <InfoCard
            title="Last Operator Activity"
            value={fmtAge(status?.lastOperatorActivityEpoch)}
            hint={fmtEpoch(status?.lastOperatorActivityEpoch)}
          />
          <InfoCard
            title="Last Update Check"
            value={fmtAge(status?.update?.lastCheckEpoch)}
            hint={fmtEpoch(status?.update?.lastCheckEpoch)}
          />
          <InfoCard
            title="Last Update Deploy"
            value={fmtAge(status?.update?.lastDeployEpoch)}
            hint={fmtEpoch(status?.update?.lastDeployEpoch)}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>DSP Targets (reachability)</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
            Phase 0: network reachability only (no control yet). Probe port:{" "}
            <span style={{ fontWeight: 900 }}>{status?.dsp?.probePort ?? "—"}</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.8 }}>
                  <th style={{ padding: "8px 6px" }}>Device</th>
                  <th style={{ padding: "8px 6px" }}>IP</th>
                  <th style={{ padding: "8px 6px" }}>Status</th>
                  <th style={{ padding: "8px 6px" }}>Method</th>
                  <th style={{ padding: "8px 6px" }}>RTT</th>
                  <th style={{ padding: "8px 6px" }}>Last Check</th>
                </tr>
              </thead>
              <tbody>
                {(status?.dsp?.targets || []).map((t: any) => {
                  const disabled = !!t.disabled;
                  const ok = t.ok;
                  const statusText = disabled
                    ? "Disabled"
                    : ok === true
                    ? "Online"
                    : ok === false
                    ? "Offline"
                    : "Unknown";

                  const pillBg = disabled
                    ? "#303747"
                    : ok === true
                    ? "#35d07f"
                    : ok === false
                    ? "#ff4d4d"
                    : "#303747";

                  const pillFg = disabled ? "#eaeef5" : ok === true ? "#0b1a10" : "#fff";

                  return (
                    <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                      <td style={{ padding: "10px 6px", fontWeight: 800 }}>{t.name}</td>
                      <td
                        style={{
                          padding: "10px 6px",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: 12,
                          opacity: 0.9,
                        }}
                      >
                        {t.ip}
                      </td>
                      <td style={{ padding: "10px 6px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: pillBg,
                            color: pillFg,
                            fontWeight: 900,
                            fontSize: 12,
                          }}
                        >
                          {statusText}
                        </span>
                      </td>
                      <td style={{ padding: "10px 6px", opacity: 0.85 }}>{t.method || "—"}</td>
                      <td style={{ padding: "10px 6px", opacity: 0.85 }}>
                        {t.rttMs ? `${t.rttMs} ms` : "—"}
                      </td>
                      <td style={{ padding: "10px 6px", opacity: 0.75 }}>
                        {t.lastCheckEpoch ? fmtAge(t.lastCheckEpoch) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
            Tip: if your Radius devices don&apos;t expose HTTP on port 80, set <code>DSP_PROBE_PORT</code> in
            <code> /etc/wlcb-mixer/config.env</code>.
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
          Next: add real Symetrix control + meters.
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        background: "#0f1116",
        padding: 12,
        border: "1px solid rgba(255,255,255,.06)",
      }}
      title={hint || ""}
    >
      <div style={{ fontSize: 12, opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900 }}>{value}</div>
      {hint && (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>{hint}</div>
      )}
    </div>
  );
}

function ChannelStrip({
  strip,
  onChange,
}: {
  strip: Strip;
  onChange: (s: Strip) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      style={{
        width: 160,
        borderRadius: 14,
        background: "#171a20",
        padding: 12,
        boxShadow: "0 10px 20px rgba(0,0,0,.25)",
      }}
    >
      <div
        style={{
          height: 90,
          borderRadius: 10,
          background: "#0f1116",
          padding: 10,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            width: 16,
            height: "100%",
            borderRadius: 8,
            background: "#1f2430",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              height: `${Math.round(strip.level * 100)}%`,
              background: strip.level > 0.85 ? "#ff4d4d" : "#35d07f",
            }}
          />
        </div>
        <div style={{ marginLeft: 10, fontSize: 12, opacity: 0.8 }}>Meter</div>
      </div>

      <div style={{ marginTop: 10, fontWeight: 800 }}>{strip.label}</div>

      <button
        onClick={() => onChange({ ...strip, on: !strip.on })}
        style={{
          marginTop: 10,
          width: "100%",
          border: "none",
          borderRadius: 10,
          padding: "10px 12px",
          background: strip.on ? "#35d07f" : "#303747",
          color: strip.on ? "#0b1a10" : "#eaeef5",
          fontWeight: 900,
          letterSpacing: 0.5,
          cursor: "pointer",
        }}
      >
        {strip.on ? "ON" : "OFF"}
      </button>

      <div style={{ marginTop: 12 }}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={strip.level}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onTouchStart={() => setDragging(true)}
          onTouchEnd={() => setDragging(false)}
          onChange={(e) => onChange({ ...strip, level: clamp(Number(e.target.value), 0, 1) })}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7 }}>
          <span>0</span>
          <span>{(strip.level * 100).toFixed(0)}</span>
          <span>100</span>
        </div>
      </div>

      {dragging && <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>Adjusting…</div>}
    </div>
  );
}
