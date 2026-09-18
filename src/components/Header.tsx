import type { EngineState } from "../engine/engine";

interface HeaderProps {
  engine: EngineState;
  onSimControl: (action: string, speedMultiplier?: number) => void;
}

export function Header({ engine, onSimControl }: HeaderProps) {
  const speeds = [1, 10, 60];
  const currentSpeed = engine.speed_multiplier;
  const running = engine.running;
  const simHours = engine.sim_time_hours;
  const days = Math.floor(simHours / 24);
  const hours = Math.floor(simHours % 24);
  const timeStr = `Day ${days + 1}, ${hours}:00`;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        height: "56px",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-thin)",
        flexShrink: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            RELAY<span style={{ color: "var(--accent-blue)" }}>AI</span>
          </span>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Intelligent Shipment Recovery
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div
            style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: "var(--color-green)",
              boxShadow: "0 0 8px var(--color-green-glow)",
            }}
          />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>LIVE</span>
        </div>

        <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "monospace" }}>{timeStr}</span>

        <div style={{ display: "flex", gap: "4px" }}>
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => onSimControl("speed", s)}
              style={{
                padding: "4px 10px", fontSize: "12px", fontWeight: 600,
                border: currentSpeed === s ? "1px solid var(--accent-blue)" : "1px solid var(--border-thin)",
                background: currentSpeed === s ? "rgba(47, 129, 247, 0.15)" : "transparent",
                color: currentSpeed === s ? "var(--accent-blue)" : "var(--text-secondary)",
                borderRadius: "4px", cursor: "pointer", transition: "all 0.2s",
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={() => onSimControl(running ? "pause" : "resume")}
            style={{
              padding: "4px 12px", fontSize: "12px", fontWeight: 600,
              border: "1px solid var(--border-thin)", background: "transparent",
              color: "var(--text-secondary)", borderRadius: "4px", cursor: "pointer", transition: "all 0.2s",
            }}
          >
            {running ? "PAUSE" : "RESUME"}
          </button>
          <button
            onClick={() => onSimControl("reset")}
            style={{
              padding: "4px 12px", fontSize: "12px", fontWeight: 600,
              border: "1px solid var(--border-thin)", background: "transparent",
              color: "var(--text-secondary)", borderRadius: "4px", cursor: "pointer", transition: "all 0.2s",
            }}
          >
            RESET
          </button>
        </div>
      </div>
    </header>
  );
}
