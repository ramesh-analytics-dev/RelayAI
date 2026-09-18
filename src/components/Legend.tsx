interface LegendProps {
  visible: boolean;
  onToggle: () => void;
}

const NODE_ITEMS = [
  { color: "#4a5568", label: "Warehouse / Hub", desc: "Active sorting facility", filled: true, radius: 6 },
  { color: "#f85149", label: "Closed Hub", desc: "Unavailable / blocked facility", filled: true, radius: 6 },
  { color: "#2f81f7", label: "Vehicle", desc: "Truck, van, train, or plane", filled: true, radius: 3 },
  { color: "#3fb950", label: "In-transit shipment", desc: "Package moving normally", filled: true, radius: 4 },
  { color: "#f85149", label: "Misplaced shipment", desc: "Lost / needs recovery", filled: true, radius: 8 },
  { color: "#2f81f7", label: "Recovering shipment", desc: "Rescue plan in progress", filled: true, radius: 8 },
  { color: "#6e7681", label: "Delivered shipment", desc: "Reached its destination", filled: true, radius: 4 },
];

const ROUTE_ITEMS = [
  { color: "#2a3a4a", label: "Active route", desc: "Operational vehicle path", dashed: true, width: 1 },
  { color: "#f85149", label: "Blocked route", desc: "Passes through a closed hub", dashed: true, width: 1 },
  { color: "#3fb950", label: "Recommended recovery", desc: "Best-scored rescue path", dashed: false, width: 4 },
  { color: "#d29922", label: "Alternative plan", desc: "Other feasible recovery routes", dashed: false, width: 2 },
  { color: "#2f81f7", label: "Current vehicle route", desc: "Selected shipment's assigned vehicle", dashed: false, width: 3 },
];

export function Legend({ visible, onToggle }: LegendProps) {
  return (
    <>
      <button
        onClick={onToggle}
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          background: "var(--bg-glass)",
          backdropFilter: "blur(12px)",
          border: "1px solid var(--border-medium)",
          borderRadius: "var(--radius)",
          color: "var(--text-secondary)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-blue)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-medium)"; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        LEGEND
      </button>

      {visible && (
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 12,
            zIndex: 1000,
            width: 280,
            maxHeight: "calc(100% - 70px)",
            overflowY: "auto",
            background: "var(--bg-glass)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--border-medium)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-soft)",
            animation: "slide-up 0.25s ease",
          }}
        >
          <div style={{ padding: "12px 14px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.04em" }}>
              MAP LEGEND
            </span>
            <button
              onClick={onToggle}
              style={{
                background: "transparent", border: "none", color: "var(--text-muted)",
                cursor: "pointer", fontSize: 14, padding: "2px 6px",
              }}
              aria-label="Close legend"
            >
              ×
            </button>
          </div>

          <div style={{ padding: "0 14px 8px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 6 }}>
              NODES
            </div>
            {NODE_ITEMS.map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                <div style={{ flexShrink: 0, width: 22, display: "flex", justifyContent: "center" }}>
                  <div style={{
                    width: item.radius * 2.5,
                    height: item.radius * 2.5,
                    borderRadius: "50%",
                    background: item.color,
                    opacity: item.label.includes("Delivered") ? 0.5 : 0.8,
                    border: `2px solid ${item.color}`,
                  }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: "4px 14px 12px", borderTop: "1px solid var(--border-thin)", marginTop: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", margin: "8px 0 6px" }}>
              ROUTES & LINES
            </div>
            {ROUTE_ITEMS.map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                <div style={{ flexShrink: 0, width: 22, display: "flex", justifyContent: "center" }}>
                  <svg width="22" height="6" style={{ overflow: "visible" }}>
                    <line
                      x1="0" y1="3" x2="22" y2="3"
                      stroke={item.color}
                      strokeWidth={item.width}
                      strokeDasharray={item.dashed ? "4 3" : "none"}
                      opacity={item.dashed ? 0.5 : 0.85}
                    />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
