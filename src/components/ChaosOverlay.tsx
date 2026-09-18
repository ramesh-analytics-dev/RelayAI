import { useState } from "react";

interface ChaosOverlayProps {
  active: boolean;
  data: { hubName: string; affectedCount: number } | null;
  onTrigger: (hubId?: string) => void;
}

export function ChaosOverlay({ active, data, onTrigger }: ChaosOverlayProps) {
  const [showWarning, setShowWarning] = useState(false);

  const handleTrigger = () => {
    setShowWarning(true);
    setTimeout(() => {
      setShowWarning(false);
      onTrigger();
    }, 200);
  };

  return (
    <>
      {/* Chaos button */}
      <button
        onClick={handleTrigger}
        style={{
          position: "absolute",
          bottom: "140px",
          right: "400px",
          zIndex: 1000,
          padding: "10px 20px",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.05em",
          border: "1px solid rgba(210, 153, 34, 0.4)",
          background: "rgba(210, 153, 34, 0.15)",
          color: "var(--color-amber)",
          borderRadius: "var(--radius)",
          cursor: "pointer",
          transition: "all 0.2s",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backdropFilter: "blur(8px)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(210, 153, 34, 0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(210, 153, 34, 0.15)";
        }}
      >
        <span>{"⚠"}</span>
        SIMULATE A CITY CLOSING
      </button>

      {/* Red flash overlay */}
      {showWarning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--color-red)",
            zIndex: 9999,
            pointerEvents: "none",
            animation: "chaos-flash 0.2s ease",
          }}
        />
      )}

      {/* Warning banner */}
      {active && data && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10001,
            padding: "32px 48px",
            background: "rgba(10, 14, 20, 0.95)",
            border: "1px solid var(--color-red)",
            borderRadius: "var(--radius-lg)",
            textAlign: "center",
            boxShadow: "0 0 40px rgba(248, 81, 73, 0.3)",
            animation: "scale-up 0.3s ease",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>{"⚠"}</div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-red)", letterSpacing: "0.1em", marginBottom: "8px" }}>
            CITY CLOSURE
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "8px" }}>
            {data.hubName.toUpperCase()} JUST CLOSED
          </div>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-amber)" }}>
            {data.affectedCount} PACKAGES NEED NEW PLANS
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "12px" }}>
            RE-PLANNING...
          </div>
        </div>
      )}

      {/* Active chaos banner */}
      {data && !active && (
        <div
          style={{
            position: "fixed",
            top: "56px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 999,
            padding: "6px 20px",
            background: "rgba(210, 153, 34, 0.15)",
            border: "1px solid rgba(210, 153, 34, 0.3)",
            borderRadius: "0 0 var(--radius) var(--radius)",
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-amber)",
            letterSpacing: "0.05em",
          }}
        >
          {data.hubName.toUpperCase()} CLOSED
        </div>
      )}
    </>
  );
}
