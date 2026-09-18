import { useEffect, useRef, useState } from "react";
import type { Metrics } from "../types";

interface ScoreboardProps {
  metrics?: Metrics;
}

const ITEMS = [
  { key: "money_saved_usd", icon: "💰", label: "MONEY SAVED", format: (v: number) => `$${v.toFixed(0)}`, color: "var(--color-green)" },
  { key: "time_saved_hours", icon: "⏱", label: "TIME SAVED", format: (v: number) => `${v.toFixed(1)}h`, color: "var(--accent-blue)" },
  { key: "space_used_pct", icon: "📦", label: "SPACE USED", format: (v: number) => `${v.toFixed(0)}%`, color: "var(--accent-blue)" },
  { key: "co2_saved_kg", icon: "🌱", label: "LESS POLLUTION", format: (v: number) => `${v.toFixed(1)} kg`, color: "var(--color-green)" },
  { key: "packages_rescued", icon: "✓", label: "PACKAGES RESCUED", format: (v: number) => `${v}`, color: "var(--color-green)" },
];

export function Scoreboard({ metrics }: ScoreboardProps) {
  const prevValues = useRef<Record<string, number>>({});
  const [animating, setAnimating] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!metrics) return;
    const newAnimating: Record<string, boolean> = {};
    for (const item of ITEMS) {
      const key = item.key as keyof Metrics;
      const prev = prevValues.current[key] || 0;
      const curr = (metrics[key] as number) || 0;
      if (curr > prev) {
        newAnimating[key] = true;
      }
      prevValues.current[key] = curr;
    }
    setAnimating(newAnimating);
    const timer = setTimeout(() => setAnimating({}), 600);
    return () => clearTimeout(timer);
  }, [metrics]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0",
        padding: "0 24px",
        height: "56px",
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--border-thin)",
        flexShrink: 0,
      }}
    >
      {ITEMS.map((item, idx) => {
        const key = item.key as keyof Metrics;
        const value = metrics ? (metrics[key] as number) || 0 : 0;
        const isAnimating = animating[key];
        return (
          <div
            key={item.key}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderRight: idx < ITEMS.length - 1 ? "1px solid var(--border-thin)" : "none",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: "16px" }}>{item.icon}</span>
            <div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: item.color,
                  transform: isAnimating ? "scale(1.15)" : "scale(1)",
                  transition: "transform 0.3s ease",
                  textShadow: isAnimating ? `0 0 12px ${item.color}55` : "none",
                }}
              >
                {item.format(value)}
              </div>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                {item.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
