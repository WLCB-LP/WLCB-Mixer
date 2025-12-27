import React from "react";

/*
 * =============================================================================
 * WLCB-Mixer UI — Engineering Page (meters)
 * =============================================================================
 * Fixes:
 *  - metersAec state defined
 *  - dBuFromRaw helper defined
 */

/** Convert Symetrix raw meter value (0..65535) to dBu */
function dBuFromRaw(raw: number): number {
  return 72 * (raw / 65535) - 48;
}

function fmtAge(epoch: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - epoch));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function EngineeringPage() {
  const [status, setStatus] = React.useState<any>(null);
  const [metersAec, setMetersAec] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = window.setInterval(async () => {
      const r = await fetch("/api/status");
      setStatus(await r.json());
    }, 1000);

    const tm = window.setInterval(async () => {
      try {
        const r = await fetch("/api/meters/aec");
        if (!r.ok) return;
        setMetersAec(await r.json());
      } catch {}
    }, 250);

    return () => {
      window.clearInterval(t);
      window.clearInterval(tm);
    };
  }, []);

  if (error) return <div>Error: {error}</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Engineering DSP Meters</h2>
      {metersAec?.meters?.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {metersAec.meters.map((m: any) => {
            const raw = typeof m.raw === "number" ? m.raw : null;
            const dBu = raw === null ? null : dBuFromRaw(raw);
            const pct = dBu === null ? 0 : Math.max(0, Math.min(1, (dBu + 48) / 72));
            return (
              <div key={m.id} style={{ padding: 12, background: "#222", color: "#eee", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{m.label}</strong>
                  <span>{dBu === null ? "—" : `${dBu.toFixed(1)} dBu`}</span>
                </div>
                <div style={{ marginTop: 8, height: 10, background: "#000", borderRadius: 6 }}>
                  <div style={{ width: `${pct * 100}%`, height: "100%", background: "#3dd07f" }} />
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  Ctrl {String(m.controller).padStart(5, "0")} · {m.lastEpoch ? fmtAge(m.lastEpoch) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>No meters configured.</div>
      )}
    </div>
  );
}