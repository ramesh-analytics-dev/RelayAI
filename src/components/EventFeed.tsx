import { useEffect, useRef } from "react";
import type { EventLogEntry } from "../types";

interface EventFeedProps {
  events?: EventLogEntry[];
}

const EVENT_ICONS: Record<string, string> = {
  detection: "📦",
  search: "🔍",
  matching: "🔍",
  optimize: "✅",
  recovery: "🚛",
  chaos: "⚠",
};

export function EventFeed({ events }: EventFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLength = useRef(0);

  useEffect(() => {
    if (scrollRef.current && events && events.length > prevLength.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (events) prevLength.current = events.length;
  }, [events]);

  if (!events || events.length === 0) {
    return (
      <div
        style={{
          height: "120px",
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border-thin)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "13px",
        }}
      >
        Waiting for events...
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        height: "120px",
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--border-thin)",
        overflowY: "auto",
        padding: "8px 24px",
      }}
      aria-live="polite"
      aria-label="Live event feed"
    >
      {events.slice(-30).map((evt, idx) => (
        <div
          key={`${evt.tick}-${idx}`}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            padding: "4px 0",
            animation: "fade-in 0.3s ease",
          }}
        >
          <span style={{ fontSize: "12px", flexShrink: 0 }}>
            {EVENT_ICONS[evt.type] || "•"}
          </span>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", flexShrink: 0, fontFamily: "monospace" }}>
            {String(Math.floor(evt.sim_time)).padStart(3, "0")}h
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
            {evt.message}
          </span>
        </div>
      ))}
    </div>
  );
}
