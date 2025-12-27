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
   * Studio B — Broadcast-style mixer shell (Phase 1)
   * =============================================================================
   * This page is intentionally "read-only" for now:
   *   - Faders and mutes are rendered, but disabled.
   *   - Meters update live once Composer controller numbers are assigned and
   *     DSP_METER_MAP_JSON is configured for targetId "b1".
   *
   * WHY build the UI before enabling control writes?
   * ----------------------------------------------
   * In broadcast, the *layout* and operator muscle memory matter. Building the UI
   * first lets you validate ergonomics, labeling, meter ballistics, and screen
   * density while keeping the DSP safe.
   * =============================================================================
   */

  const { status, error } = useStatusPoll();

  // Studio B DSP target id (from DSP_TARGETS_JSON):
  //   {"id":"b1","name":"Radius 12x8 #3 (Studio B)","ip":"10.101.2.2"}
  const [metersB1, setMetersB1] = React.useState<any>(null);

  React.useEffect(() => {
    let alive = true;
    const t = window.setInterval(async () => {
      try {
        const r = await fetch("/api/meters/b1");
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setMetersB1(j);
      } catch {
        // keep rendering
      }
    }, 250);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  // Studio B channel plan (your current spec)
  const channels: Array<{
    id: string;
    label: string;
    kind: "mic" | "stereo" | "monitor";
    meterId?: string;
  }> = [
    { id: "mic1", label: "Mic 1", kind: "mic", meterId: "mic1" },
    { id: "mic2", label: "Mic 2", kind: "mic", meterId: "mic2" },
    { id: "mic3", label: "Mic 3", kind: "mic", meterId: "mic3" },
    { id: "mic4", label: "Mic 4", kind: "mic", meterId: "mic4" },

    { id: "cd1", label: "CD 1", kind: "stereo", meterId: "cd1" },
    { id: "cd2", label: "CD 2", kind: "stereo", meterId: "cd2" },
    { id: "aux", label: "AUX", kind: "stereo", meterId: "aux" },
    { id: "bt", label: "Bluetooth", kind: "stereo", meterId: "bt" },
    { id: "pc", label: "PC", kind: "stereo", meterId: "pc" },
    { id: "zoom", label: "Zoom", kind: "stereo", meterId: "zoom" },

    { id: "tt1", label: "Turntable 1", kind: "stereo", meterId: "tt1" },
    { id: "tt2", label: "Turntable 2", kind: "stereo", meterId: "tt2" },

    { id: "spk", label: "Speakers", kind: "monitor", meterId: "spk" },
  ];

  const meterById: Record<string, any> = {};
  for (const m of metersB1?.meters || []) meterById[m.id] = m;

  function Strip(props: { ch: typeof channels[number] }) {
    const m = props.ch.meterId ? meterById[props.ch.meterId] : null;
    const raw = typeof m?.raw === "number" ? m.raw : null;
    const dBu = raw === null ? null : dBuFromRaw(raw);
    const pct = dBu === null ? 0 : Math.max(0, Math.min(1, (dBu + 48) / 72));

    return (
      <div
        style={{
          width: 120,
          minWidth: 120,
          padding: 10,
          borderRadius: 16,
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.08)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 950, lineHeight: 1.1 }}>{props.ch.label}</div>

        <div>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
            {raw === null ? "—" : `${dBu!.toFixed(1)} dBu`}
          </div>
          <div style={{ height: 120, borderRadius: 999, background: "rgba(0,0,0,.35)", overflow: "hidden" }}>
            <div
              style={{
                width: "100%",
                height: `${pct * 100}%`,
                marginTop: `${(1 - pct) * 100}%`,
                background: "rgba(53,208,127,.9)",
              }}
            />
          </div>
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 6 }}>
            {m?.controller ? <>Ctrl <code>{String(m.controller).padStart(5, "0")}</code></> : "No meter"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            disabled
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(255,255,255,.04)",
              color: "rgba(255,255,255,.55)",
              fontWeight: 900,
            }}
            title="Mute will be enabled once we add safe DSP write controls."
          >
            MUTE
          </button>
          <button
            disabled
            style={{
              width: 44,
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(255,255,255,.04)",
              color: "rgba(255,255,255,.55)",
              fontWeight: 900,
            }}
            title="PFL / cue will be added later."
          >
            PFL
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="range" min={0} max={100} defaultValue={75} disabled />
          <div style={{ fontSize: 10, opacity: 0.55 }}>Read-only (Phase 1)</div>
        </div>
      </div>
    );
  }

  const dspIp = (status?.dsp?.targets || []).find((t: any) => t.id === "b1")?.ip;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 6 }}>Studio B</div>
      <div style={{ opacity: 0.7, marginBottom: 14 }}>
        Mixer shell (read-only). Live meters appear once Studio B meter controllers are assigned in Composer.
      </div>

      {error ? (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: "rgba(255,50,50,.16)" }}>
          Status error: {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Card title="Studio B DSP">
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
            <div>Target: <strong>b1</strong> {dspIp ? <span style={{ opacity: 0.8 }}>({dspIp})</span> : null}</div>
            <div>Meter stream: <strong>{fmtYesNo(metersB1?.connected)}</strong></div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
              Connected=Yes but blank meters is OK until audio is present and the correct controllers are mapped.
            </div>
          </div>
        </Card>

        <Card title="Operator notes">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, opacity: 0.85 }}>
            <li>Phase 1: verify layout + labels + meter motion</li>
            <li>Phase 2: add “confidence monitoring” cues and talkback</li>
            <li>Phase 3: enable safe control writes (mute/level) with guardrails</li>
          </ul>
        </Card>
      </div>

      <Card title="Channel strips">
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
          {channels.filter(c => c.kind !== "monitor").map((ch) => (
            <Strip key={ch.id} ch={ch} />
          ))}

          <div style={{ width: 1, background: "rgba(255,255,255,.12)", margin: "0 6px" }} />
          {channels.filter(c => c.kind === "monitor").map((ch) => (
            <Strip key={ch.id} ch={ch} />
          ))}
        </div>

        {!metersB1?.meters?.length ? (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
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
