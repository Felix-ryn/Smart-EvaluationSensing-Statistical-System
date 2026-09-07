import { ViolationForm } from "./ViolationForm";

export function ReportViolation() {
  return (
    <div>
      <div className="page-header">Laporkan Pelanggaran Parkir</div>
      <div className="card" style={{ maxWidth: 480 }}>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>
          Ambil atau unggah foto/video area parkir. Sistem akan menganalisis pelanggaran secara otomatis.
        </p>
        <ViolationForm />
      </div>
    </div>
  );
}
