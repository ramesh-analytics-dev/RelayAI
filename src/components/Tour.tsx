interface TourProps {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

const STEPS = [
  {
    icon: "📦",
    title: "Click a red package",
    description: "Red packages on the map are lost.\nClick one to see what happened.",
  },
  {
    icon: "🔍",
    title: "Compare rescue plans",
    description: "We'll find real rescue plans based on\navailable trucks, routes, and capacity.",
  },
  {
    icon: "🎉",
    title: "Choose a plan",
    description: "Pick the best plan and watch the package\nget rescued in real-time.",
  },
];

export function Tour({ step, onNext, onSkip }: TourProps) {
  const current = Math.min(step, STEPS.length - 1);
  const isLast = current >= STEPS.length - 1;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "140px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10001,
        padding: "24px 32px",
        background: "rgba(17, 24, 39, 0.95)",
        border: "1px solid var(--border-medium)",
        borderRadius: "var(--radius-lg)",
        textAlign: "center",
        boxShadow: "var(--shadow-soft)",
        backdropFilter: "blur(8px)",
        animation: "slide-up 0.4s ease",
        maxWidth: "400px",
      }}
    >
      <div style={{ fontSize: "32px", marginBottom: "8px" }}>{STEPS[current].icon}</div>
      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--accent-blue)", letterSpacing: "0.1em", marginBottom: "8px" }}>
        STEP {current + 1} OF {STEPS.length}
      </div>
      <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
        {STEPS[current].title}
      </h3>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
        {STEPS[current].description}
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "16px" }}>
        <button
          onClick={onSkip}
          style={{
            padding: "6px 16px",
            fontSize: "12px",
            fontWeight: 600,
            border: "1px solid var(--border-thin)",
            background: "transparent",
            color: "var(--text-muted)",
            borderRadius: "var(--radius)",
            cursor: "pointer",
          }}
        >
          Skip
        </button>
        <button
          onClick={onNext}
          style={{
            padding: "6px 16px",
            fontSize: "12px",
            fontWeight: 600,
            border: "none",
            background: "var(--accent-blue)",
            color: "white",
            borderRadius: "var(--radius)",
            cursor: "pointer",
          }}
        >
          {isLast ? "Got it" : "Next"}
        </button>
      </div>
    </div>
  );
}
