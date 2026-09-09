export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <div className="page-header">{title}</div>
      <div className="card">
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Scaffold placeholder. Diimplementasikan pada <b>{phase}</b>.
        </p>
      </div>
    </div>
  );
}
