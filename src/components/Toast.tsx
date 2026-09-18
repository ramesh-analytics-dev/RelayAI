interface ToastProps {
  toast: { message: string; details: string[] } | null;
}

export function Toast({ toast }: ToastProps) {
  if (!toast) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "200px",
        right: "400px",
        zIndex: 10001,
        padding: "16px 24px",
        background: "rgba(63, 185, 80, 0.15)",
        border: "1px solid var(--color-green)",
        borderRadius: "var(--radius)",
        boxShadow: "0 0 24px rgba(63, 185, 80, 0.2)",
        animation: "slide-in-right 0.3s ease",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <span style={{ fontSize: "16px" }}>{"✓"}</span>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-green)" }}>
          {toast.message}
        </span>
      </div>
      {toast.details.length > 0 && (
        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          {toast.details.join(" • ")}
        </div>
      )}
    </div>
  );
}
