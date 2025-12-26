import React, { useEffect, useMemo, useRef, useState } from "react";

type Strip = { id: string; label: string; level: number; on: boolean };

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

export default function App() {
  const [connected, setConnected] = useState(false);
  const [strips, setStrips] = useState<Strip[]>([
    { id: "mic1", label: "MIC 1", level: 0.6, on: true },
    { id: "mic2", label: "MIC 2", level: 0.4, on: false },
    { id: "cd1", label: "CD 1", level: 0.2, on: true },
    { id: "pc", label: "PC", level: 0.5, on: true },
  ]);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`${location.origin.replace("http", "ws")}/ws`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = () => { /* placeholder */ };
    return () => ws.close();
  }, []);

  function sendControl(id: string, payload: any) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "control", id, ...payload }));
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#101216", color: "#eaeef5", minHeight: "100vh" }}>
      <header style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>WLCB-Mixer</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Prototype UI • WS: {connected ? "Connected" : "Disconnected"}</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Landing + Studio pages coming next</div>
      </header>

      <main style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {strips.map((s) => (
            <ChannelStrip
              key={s.id}
              strip={s}
              onChange={(next) => {
                setStrips((prev) => prev.map((p) => (p.id === s.id ? next : p)));
                sendControl(s.id, { value: next.level, on: next.on });
              }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function ChannelStrip({ strip, onChange }: { strip: Strip; onChange: (s: Strip) => void }) {
  const [dragging, setDragging] = useState(false);

  return (
    <div style={{ width: 140, borderRadius: 14, background: "#171a20", padding: 12, boxShadow: "0 10px 20px rgba(0,0,0,.25)" }}>
      <div style={{ height: 90, borderRadius: 10, background: "#0f1116", padding: 10, display: "flex", alignItems: "flex-end" }}>
        <div style={{ width: 16, height: "100%", borderRadius: 8, background: "#1f2430", overflow: "hidden" }}>
          <div style={{ width: "100%", height: `${Math.round(strip.level * 100)}%`, background: strip.level > 0.85 ? "#ff4d4d" : "#35d07f" }} />
        </div>
        <div style={{ marginLeft: 10, fontSize: 12, opacity: 0.8 }}>Meter</div>
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>{strip.label}</div>

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
          fontWeight: 800,
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
          <span>0</span><span>{(strip.level * 100).toFixed(0)}</span><span>100</span>
        </div>
      </div>

      {dragging && <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>Adjusting…</div>}
    </div>
  );
}
