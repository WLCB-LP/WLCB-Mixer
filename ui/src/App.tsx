import React from "react";

/**
 * =============================================================================
 * WLCB-Mixer UI (Full shell)
 * =============================================================================
 * This file restores the app shell (Landing + Studio pages + Engineering) while
 * keeping the working Engineering DSP live meters.
 *
 * Routing is hash-based (no external deps) to keep installs simple:
 *   /#/            Landing
 *   /#/studio-a    Studio A
 *   /#/studio-b    Studio B
 *   /#/engineering Engineering (status + meters)
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

function fmtAge(epoch: number | null | undefined): string {
  if (!epoch) return "—";
  const s = Math.max(0, nowEpoch() - epoch);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtYesNo(v: any): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

/** Convert Symetrix raw meter value (0..65535) to dBu */
function dBuFromRaw(raw: number): number {
  // Symetrix scaling: -48 dBu .. +24 dBu
  // dBu = 72*(raw/65535) - 48
  return 72 * (raw / 65535) - 48;
}

// -----------------------------------------------------------------------------
// Simple hash routing
// -----------------------------------------------------------------------------

type Route = "/" | "/studio-a" | "/studio-b" | "/engineering";

function normalizeRoute(hash: string): Route {
  const h = (hash || "").replace(/^#/, "");
  if (h === "" || h === "/") return "/";
  if (h.startsWith("/studio-a")) return "/studio-a";
  if (h.startsWith("/studio-b")) return "/studio-b";
  if (h.startsWith("/engineering")) return "/engineering";
  return "/";
}

function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = React.useState<Route>(() => normalizeRoute(window.location.hash));

  React.useEffect(() => {
    const onHash = () => setRoute(normalizeRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function nav(to: Route) {
    window.location.hash = `#${to}`;
  }

  return [route, nav];
}

// -----------------------------------------------------------------------------
// UI building blocks (dependency-free)
// -----------------------------------------------------------------------------

function Card(props: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 16,
        background: "rgba(255,255,255,.04)",
        border: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>{props.title}</div>
        {props.right}
      </div>
      {props.children}
    </div>
  );
}

function Button(props: { onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        border: "1px solid rgba(255,255,255,.14)",
        background: props.active ? "rgba(53,208,127,.22)" : "rgba(255,255,255,.06)",
        color: "white",
        padding: "10px 12px",
        borderRadius: 12,
        cursor: "pointer",
        fontWeight: 800,
      }}
    >
      {props.children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Data hooks
// -----------------------------------------------------------------------------

function useStatusPoll() {
  const [status, setStatus] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;

    async function fetchStatus() {
      try {
        const r = await fetch("/api/status");
        if (!r.ok) throw new Error(`status http ${r.status}`);
        const j = await r.json();
        if (!alive) return;
        setStatus(j);
        setError(null);
      } catch (e: any) {
        if (!alive) return;
        setError(String(e?.message || e));
      }
    }

    fetchStatus();
    const t = window.setInterval(fetchStatus, 1000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  return { status, error };
}

function useEngineeringMeters() {
  const [metersAec, setMetersAec] = React.useState<any>(null);

  React.useEffect(() => {
    let alive = true;
    const tm = window.setInterval(async () => {
      try {
        const r = await fetch("/api/meters/aec");
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setMetersAec(j);
      } catch {
        // Keep UI rendering even if a single fetch fails.
      }
    }, 250);

    return () => {
      alive = false;
      window.clearInterval(tm);
    };
  }, []);

  return metersAec;
}

// -----------------------------------------------------------------------------
// Pages
// -----------------------------------------------------------------------------

function LandingPage({ nav }: { nav: (r: Route) => void }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 6 }}>Select a location</div>
      <div style={{ opacity: 0.7, marginBottom: 18 }}>
        Choose which studio you are operating, or open Engineering for system status and metering.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <Card title="Studio A">
          <div style={{ opacity: 0.75, marginBottom: 12 }}>On-air / production controls for Studio A.</div>
          <Button onClick={() => nav("/studio-a")}>Open Studio A</Button>
        </Card>

        <Card title="Studio B">
          <div style={{ opacity: 0.75, marginBottom: 12 }}>On-air / production controls for Studio B.</div>
          <Button onClick={() => nav("/studio-b")}>Open Studio B</Button>
        </Card>

        <Card title="Engineering">
          <div style={{ opacity: 0.75, marginBottom: 12 }}>DSP connectivity, update status, and live output meters.</div>
          <Button onClick={() => nav("/engineering")}>Open Engineering</Button>
        </Card>
      </div>
    </div>
  );
}

function StudioPlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 6 }}>{title}</div>
      <div style={{ opacity: 0.7, marginBottom: 18 }}>
        This page will become the broadcast-style mixer interface. Next phases will add faders, mutes, and confidence
        monitoring meters.
      </div>

      <Card title="Coming next">
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, opacity: 0.85 }}>
          <li>Studio-specific channel strips (10–12 faders)</li>
          <li>VU meters + peak/clip indicators</li>
          <li>Safe control writes to DSP (mute / level) with guardrails</li>
        </ul>
      </Card>
    </div>
  );
}


function StudioBPage() {
  /**
   * =============================================================================
   * Studio B — Broadcast console view (Design-first / Read-only)
   * =============================================================================
   * Goals:
   *  - Operator confidence monitoring: big labels + tall meters + clear grouping
   *  - No DSP writes yet: CUT/MUTE, PFL, and faders are rendered but disabled
   *  - Meters poll /api/meters/b1 every 250ms (null / no audio is OK)
   *
   * Expected meter ids:
   *   mic1..mic4, cd1, cd2, aux, bt, pc, zoom, tt1, tt2, spk
   * =============================================================================
   */

  const { status, error } = useStatusPoll();

  const [metersB1, setMetersB1] = React.useState<any>(null);
  const [peaks, setPeaks] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    let alive = true;
    const t = window.setInterval(async () => {
      try {
        const r = await fetch("/api/meters/b1", { cache: "no-store" as RequestCache });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setMetersB1(j);

        // Peak hold / decay (UI-only). Track by meter id using raw values.
        const nowMeters: any[] = (j && j.meters) ? j.meters : [];
        setPeaks((prev) => {
          const next: Record<string, number> = { ...prev };
          const decay = 0.965; // ~smooth decay across 250ms ticks
          for (const k of Object.keys(next)) next[k] = next[k] * decay;

          for (const m of nowMeters) {
            const id = m?.id;
            const raw = typeof m?.raw === "number" ? m.raw : null;
            if (!id || raw === null) continue;
            next[id] = Math.max(next[id] || 0, raw);
          }
          return next;
        });
      } catch {
        // keep rendering
      }
    }, 250);

    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const channels: Array<{
    id: string;
    label: string;
    group: "MICS" | "SOURCES" | "TURNTABLES" | "MONITOR";
    meterId: string;
  }> = [
    { id: "mic1", label: "MIC 1", group: "MICS", meterId: "mic1" },
    { id: "mic2", label: "MIC 2", group: "MICS", meterId: "mic2" },
    { id: "mic3", label: "MIC 3", group: "MICS", meterId: "mic3" },
    { id: "mic4", label: "MIC 4", group: "MICS", meterId: "mic4" },

    { id: "cd1", label: "CD 1", group: "SOURCES", meterId: "cd1" },
    { id: "cd2", label: "CD 2", group: "SOURCES", meterId: "cd2" },
    { id: "aux", label: "AUX", group: "SOURCES", meterId: "aux" },
    { id: "bt", label: "BLUETOOTH", group: "SOURCES", meterId: "bt" },
    { id: "pc", label: "PC", group: "SOURCES", meterId: "pc" },
    { id: "zoom", label: "ZOOM", group: "SOURCES", meterId: "zoom" },

    { id: "tt1", label: "TT 1", group: "TURNTABLES", meterId: "tt1" },
    { id: "tt2", label: "TT 2", group: "TURNTABLES", meterId: "tt2" },

    { id: "spk", label: "SPEAKERS", group: "MONITOR", meterId: "spk" },
  ];

  const meterById: Record<string, any> = {};
  for (const m of metersB1?.meters || []) meterById[m.id] = m;

  // Visual mapping: Symetrix raw -> dBu -> meter percent
  function meterPctFromRaw(raw: number | null): number {
    if (raw === null) return 0;
    const dBu = dBuFromRaw(raw);
    // Map -48..+24 dBu to 0..1
    return Math.max(0, Math.min(1, (dBu + 48) / 72));
  }

  function dBuLabel(raw: number | null): string {
    if (raw === null) return "—";
    return `${dBuFromRaw(raw).toFixed(1)} dBu`;
  }

  // Heuristic "signal present" threshold for UI lamp
  function hasSignal(raw: number | null): boolean {
    if (raw === null) return false;
    const dBu = dBuFromRaw(raw);
    return dBu > -40;
  }

  // Heuristic "clip/over" threshold for UI lamp
  function isHot(raw: number | null): boolean {
    if (raw === null) return false;
    const dBu = dBuFromRaw(raw);
    return dBu > 18; // near top of the configured range
  }

  function GroupDivider(props: { title: string }) {
    return (
      <div className="sb-group-divider" aria-hidden="true">
        <div className="sb-group-divider-line" />
        <div className="sb-group-divider-title">{props.title}</div>
      </div>
    );
  }

  function Strip(props: { ch: typeof channels[number] }) {
    const m = meterById[props.ch.meterId];
    const raw = typeof m?.raw === "number" ? m.raw : null;
    const pct = meterPctFromRaw(raw);

    const peakRaw = typeof peaks?.[props.ch.meterId] === "number" ? peaks[props.ch.meterId] : null;
    const peakPct = peakRaw === null ? null : meterPctFromRaw(peakRaw);

    return (
      <div className={`sb-strip ${raw === null ? "is-null" : ""} ${props.ch.group === "MONITOR" ? "is-monitor" : ""}`}>
        <div className="sb-strip-top">
          <div className="sb-strip-label">{props.ch.label}</div>
          <div className="sb-strip-lamps">
            <span className={`sb-lamp ${hasSignal(raw) ? "on" : ""}`} title="Signal present" />
            <span className={`sb-lamp sb-lamp-hot ${isHot(raw) ? "on" : ""}`} title="Hot / near clip" />
          </div>
        </div>

        <div className="sb-meter-block">
          <div className="sb-meter-readout">{dBuLabel(raw)}</div>

          <div className="sb-meter" role="img" aria-label={`${props.ch.label} meter`}>
            <div className="sb-meter-bg" />
            <div className="sb-meter-fill" style={{ height: `${pct * 100}%` }} />
            {peakPct !== null ? (
              <div className="sb-meter-peak" style={{ bottom: `${peakPct * 100}%` }} />
            ) : null}
            <div className="sb-meter-ticks" />
          </div>

          <div className="sb-meter-meta">
            {m?.controller ? (
              <>
                Ctrl <code>{String(m.controller).padStart(5, "0")}</code>
              </>
            ) : (
              <span style={{ opacity: 0.75 }}>No meter</span>
            )}
          </div>
        </div>

        <div className="sb-buttons">
          <button className="sb-btn sb-btn-cut" disabled title="CUT/MUTE will be enabled in a later phase.">
            CUT / MUTE
          </button>
          <button className="sb-btn sb-btn-pfl" disabled title="PFL will be enabled in a later phase.">
            PFL
          </button>
        </div>

        <div className="sb-fader-block" aria-hidden="true">
          <div className="sb-fader-scale">
            <div className="sb-mark"><span className="sb-mark-line" /><span className="sb-mark-text">0</span></div>
            <div className="sb-mark"><span className="sb-mark-line" /><span className="sb-mark-text">-5</span></div>
            <div className="sb-mark"><span className="sb-mark-line" /><span className="sb-mark-text">-10</span></div>
            <div className="sb-mark"><span className="sb-mark-line" /><span className="sb-mark-text">-20</span></div>
            <div className="sb-mark"><span className="sb-mark-line" /><span className="sb-mark-text">-30</span></div>
            <div className="sb-mark"><span className="sb-mark-line" /><span className="sb-mark-text">-40</span></div>
            <div className="sb-mark"><span className="sb-mark-line" /><span className="sb-mark-text">-50</span></div>
            <div className="sb-mark"><span className="sb-mark-line" /><span className="sb-mark-text">-60</span></div>
          </div>

          <div className="sb-fader-slot">
            <input className="sb-fader" type="range" min={0} max={100} defaultValue={72} disabled />
            <div className="sb-fader-note">Read-only</div>
          </div>
        </div>
      </div>
    );
  }

  const dspIp = (status?.dsp?.targets || []).find((t: any) => t.id === "b1")?.ip;

  // Render: Single-row console with group dividers (still one row)
  const mics = channels.filter((c) => c.group === "MICS");
  const sources = channels.filter((c) => c.group === "SOURCES");
  const tts = channels.filter((c) => c.group === "TURNTABLES");
  const monitor = channels.filter((c) => c.group === "MONITOR");

  return (
    <div className="studio-b">
      <div className="studio-b-head">
        <div className="studio-b-title">Studio B</div>
        <div className="studio-b-sub">
          Broadcast console view • Confidence monitoring • Controls disabled
        </div>
      </div>

      <div className="studio-b-statusbar">
        <span>
          Target: <code>b1</code> {dspIp ? <>({dspIp})</> : null}
        </span>
        <span className="muted">
          • Updates: <code>/api/meters/b1</code> every 250ms
        </span>
        <span className="muted">
          • Meters: {metersB1?.meters?.length ? <b>{metersB1.meters.length}</b> : <b>none</b>}
        </span>
        <details>
          <summary>About this page</summary>
          <div style={{ marginTop: 8, lineHeight: 1.4, opacity: 0.9 }}>
            Built for <b>confidence monitoring</b>: clear labels, tall meters, and familiar console ergonomics. Controls are
            intentionally disabled until DSP write controls are implemented.
          </div>
        </details>
      </div>
<div style={{ fontWeight: 850 }}>{error ? "Offline / error" : "Online"}</div>
            </div>
            <div style={{ minWidth: 220 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Meters</div>
              <div style={{ fontWeight: 850 }}>{metersB1?.meters?.length ? `${metersB1.meters.length} active` : "Not configured"}</div>
            </div>
            <div style={{ minWidth: 260 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Mode</div>
              <div style={{ fontWeight: 850 }}>Read-only (design-first)</div>
            </div>
          </div>
        </Card>

        <Card title="Operator intent">
          <div style={{ lineHeight: 1.55, opacity: 0.9 }}>
            This page is built for <b>confidence monitoring</b>: clear labels, tall meters, and familiar console ergonomics.
            When Studio B comes online, you’ll be able to confirm “is it there / is it hot / is it muted” at a glance.
          </div>
        </Card>
      </div>

      <Card title="Studio B console">
        <div className="sb-console" role="region" aria-label="Studio B console">
          {mics.map((ch) => <Strip key={ch.id} ch={ch} />)}
          <GroupDivider title="SOURCES" />
          {sources.map((ch) => <Strip key={ch.id} ch={ch} />)}
          <GroupDivider title="TURNTABLES" />
          {tts.map((ch) => <Strip key={ch.id} ch={ch} />)}
          <GroupDivider title="MONITOR" />
          {monitor.map((ch) => <Strip key={ch.id} ch={ch} />)}
        </div>

        {!metersB1?.meters?.length ? (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            No Studio B meters configured yet. Add entries under <code>DSP_METER_MAP_JSON</code> for target <code>b1</code>.
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function EngineeringPage() {
  const { status, error } = useStatusPoll();
  const metersAec = useEngineeringMeters();

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 6 }}>Engineering</div>
      <div style={{ opacity: 0.7, marginBottom: 18 }}>System health + live output metering (Engineering DSP).</div>

      {error ? (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: "rgba(255,50,50,.16)" }}>
          Status error: {error}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <Card title="Server">
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 6, columnGap: 10, fontSize: 13 }}>
            <div style={{ opacity: 0.7 }}>Release</div>
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{status?.releaseId ?? "—"}</div>

            <div style={{ opacity: 0.7 }}>Uptime</div>
            <div>{typeof status?.uptimeSec === "number" ? `${status.uptimeSec}s` : "—"}</div>

            <div style={{ opacity: 0.7 }}>WebSocket clients</div>
            <div>{status?.wsClients ?? "—"}</div>

            <div style={{ opacity: 0.7 }}>Last operator activity</div>
            <div>{fmtAge(status?.lastOperatorActivityEpoch)}</div>
          </div>
        </Card>

        <Card title="Updater">
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 6, columnGap: 10, fontSize: 13 }}>
            <div style={{ opacity: 0.7 }}>Last check</div>
            <div>{fmtAge(status?.update?.lastCheckEpoch)}</div>

            <div style={{ opacity: 0.7 }}>Last deploy</div>
            <div>{fmtAge(status?.update?.lastDeployEpoch)}</div>
          </div>
        </Card>

        <Card title="Meters (AEC)">
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Connected: <strong>{fmtYesNo(metersAec?.connected)}</strong>{" "}
            {metersAec?.lastError ? <span style={{ marginLeft: 10 }}>Error: {String(metersAec.lastError)}</span> : null}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Values update in the UI every 250ms. The DSP itself pushes meter changes to the server.
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <Card title="Engineering DSP meters">
          {metersAec?.meters?.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {metersAec.meters.map((m: any) => {
                const raw = typeof m.raw === "number" ? m.raw : null;
                const dBu = raw === null ? null : dBuFromRaw(raw);
                const pct = dBu === null ? 0 : Math.max(0, Math.min(1, (dBu + 48) / 72));
                return (
                  <div
                    key={m.id}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: "rgba(255,255,255,.03)",
                      border: "1px solid rgba(255,255,255,.08)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ fontWeight: 900 }}>{m.label}</div>
                      <div
                        style={{
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: 12,
                          opacity: 0.85,
                        }}
                      >
                        {raw === null ? "—" : `${dBu!.toFixed(1)} dBu`}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        height: 12,
                        borderRadius: 999,
                        background: "rgba(0,0,0,.35)",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ height: "100%", width: `${pct * 100}%`, background: "rgba(53,208,127,.9)" }} />
                    </div>

                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
                      Controller <code>{String(m.controller).padStart(5, "0")}</code> · Updated {fmtAge(m.lastEpoch)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7 }}>No meters configured (DSP_METER_MAP_JSON).</div>
          )}
        </Card>

        <Card title="DSP targets (reachability)">
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
            Snapshot from /api/status. Helpful to verify IP reachability before enabling control writes.
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.7 }}>
                  <th style={{ padding: "8px 6px" }}>Name</th>
                  <th style={{ padding: "8px 6px" }}>IP</th>
                  <th style={{ padding: "8px 6px" }}>Reachable</th>
                  <th style={{ padding: "8px 6px" }}>Last seen</th>
                  <th style={{ padding: "8px 6px" }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(status?.dsp?.targets || []).map((t: any) => (
                  <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                    <td style={{ padding: "8px 6px" }}>{t.name ?? t.id}</td>
                    <td
                      style={{
                        padding: "8px 6px",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {t.ip ?? "—"}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{fmtYesNo(t.reachable)}</td>
                    <td style={{ padding: "8px 6px" }}>{fmtAge(t.lastSeenEpoch)}</td>
                    <td style={{ padding: "8px 6px", opacity: 0.8 }}>{t.error ? String(t.error) : t.disabled ? "disabled" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!status?.dsp?.targets?.length ? <div style={{ fontSize: 12, opacity: 0.7 }}>No DSP targets configured.</div> : null}
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// App shell
// -----------------------------------------------------------------------------

export default function App() {
  const [route, nav] = useRoute();

  const page = (() => {
    if (route === "/") return <LandingPage nav={nav} />;
    if (route === "/studio-a") return <StudioPlaceholderPage title="Studio A" />;
    if (route === "/studio-b") return <StudioBPage />;
    if (route === "/engineering") return <EngineeringPage />;
    return <LandingPage nav={nav} />;
  })();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(1200px 900px at 20% 0%, rgba(53,208,127,.12), rgba(0,0,0,0)), #0b0f14",
        color: "white",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>WLCB-Mixer</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button onClick={() => nav("/")} active={route === "/"}>Home</Button>
            <Button onClick={() => nav("/studio-a")} active={route === "/studio-a"}>Studio A</Button>
            <Button onClick={() => nav("/studio-b")} active={route === "/studio-b"}>Studio B</Button>
            <Button onClick={() => nav("/engineering")} active={route === "/engineering"}>Engineering</Button>
          </div>
        </div>

        {page}

        <div style={{ marginTop: 18, fontSize: 12, opacity: 0.55 }}>
          URLs: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>/#/</span>{" "}
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>/#/studio-a</span>{" "}
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>/#/studio-b</span>{" "}
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>/#/engineering</span>
        </div>
      </div>
    </div>
  );
}
