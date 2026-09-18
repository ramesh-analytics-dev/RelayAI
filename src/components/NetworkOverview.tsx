import type { EngineState } from "../engine/engine";
import type { Shipment } from "../types";

interface NetworkOverviewProps {
  engine: EngineState;
}

interface HubFlow {
  hubId: string;
  hubName: string;
  status: string;
  incoming: number;
  outgoing: number;
  inTransitToHere: number;
  delivered: number;
  misplaced: number;
}

function computeHubFlows(engine: EngineState): HubFlow[] {
  const flows: Record<string, HubFlow> = {};

  for (const h of engine.hubs) {
    flows[h.id] = {
      hubId: h.id,
      hubName: h.name,
      status: h.status,
      incoming: 0,
      outgoing: 0,
      inTransitToHere: 0,
      delivered: 0,
      misplaced: 0,
    };
  }

  for (const s of engine.shipments) {
    const origin = flows[s.origin_hub_id];
    const dest = flows[s.destination_hub_id];

    if (origin) {
      if (s.status === "IN_TRANSIT" || s.status === "MISPLACED" || s.status === "RECOVERING" || s.status === "RECOVERED") {
        origin.outgoing++;
      }
    }
    if (dest) {
      if (s.status === "IN_TRANSIT" || s.status === "MISPLACED" || s.status === "RECOVERING" || s.status === "RECOVERED") {
        dest.incoming++;
      }
      if (s.status === "DELIVERED") {
        dest.delivered++;
      }
      if (s.status === "MISPLACED" || s.status === "DISRUPTED") {
        dest.misplaced++;
      }
    }
  }

  for (const a of engine.assignments) {
    if (a.status === "IN_TRANSIT") {
      const dest = flows[a.to_hub_id];
      if (dest) dest.inTransitToHere++;
    }
  }

  return Object.values(flows).sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing));
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "var(--color-green)",
  CLOSED: "var(--color-red)",
};

export function NetworkOverview({ engine }: NetworkOverviewProps) {
  const flows = computeHubFlows(engine);

  const totals = flows.reduce(
    (acc, f) => ({
      incoming: acc.incoming + f.incoming,
      outgoing: acc.outgoing + f.outgoing,
      delivered: acc.delivered + f.delivered,
      misplaced: acc.misplaced + f.misplaced,
    }),
    { incoming: 0, outgoing: 0, delivered: 0, misplaced: 0 }
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 340,
        maxHeight: "calc(100% - 24px)",
        background: "var(--bg-glass)",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--border-medium)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-soft)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "slide-in-right 0.3s ease",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-thin)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            Network Overview
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            All Hubs — Incoming & Outgoing
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-blue)" }}>{totals.incoming}</div>
            <div style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.05em" }}>IN</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-green)" }}>{totals.outgoing}</div>
            <div style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.05em" }}>OUT</div>
          </div>
        </div>
      </div>

      <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
        {flows.map((f) => (
          <div
            key={f.hubId}
            style={{
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderBottom: "1px solid var(--border-thin)",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: STATUS_DOT[f.status] || "var(--text-muted)",
                flexShrink: 0,
                boxShadow: f.status === "CLOSED" ? "0 0 6px var(--color-red-glow)" : "0 0 6px var(--color-green-glow)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.hubName}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {f.status === "CLOSED" ? "CLOSED" : "Active"}
                {f.misplaced > 0 && <span style={{ color: "var(--color-red)", marginLeft: 6 }}>{f.misplaced} lost</span>}
                {f.delivered > 0 && <span style={{ color: "var(--color-green)", marginLeft: 6 }}>{f.delivered} delivered</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <div style={{ textAlign: "center", minWidth: 32 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-blue)" }}>{f.incoming}</div>
                <div style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.03em" }}>IN</div>
              </div>
              <div style={{ textAlign: "center", minWidth: 32 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-green)" }}>{f.outgoing}</div>
                <div style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.03em" }}>OUT</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
