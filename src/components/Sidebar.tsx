interface SidebarProps {
  activeView: string;
  onNavigate: (view: "network" | "events" | "chaos") => void;
}

const NAV_ITEMS = [
  { id: "network" as const, label: "Live Network", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { id: "events" as const, label: "Events", icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" },
  { id: "chaos" as const, label: "Chaos Mode", icon: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" },
];

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <nav
      style={{
        width: "56px",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-thin)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: "8px",
        flexShrink: 0,
      }}
    >
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          title={item.label}
          aria-label={item.label}
          style={{
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: activeView === item.id ? "rgba(47, 129, 247, 0.15)" : "transparent",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s",
            position: "relative",
          }}
          onMouseEnter={(e) => {
            if (activeView !== item.id) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }}
          onMouseLeave={(e) => {
            if (activeView !== item.id) e.currentTarget.style.background = "transparent";
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={activeView === item.id ? "var(--accent-blue)" : "var(--text-secondary)"}
          >
            <path d={item.icon} />
          </svg>
          {activeView === item.id && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                width: "3px",
                height: "24px",
                background: "var(--accent-blue)",
                borderRadius: "0 2px 2px 0",
              }}
            />
          )}
        </button>
      ))}
    </nav>
  );
}
