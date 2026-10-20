import { ViolationForm } from "./ViolationForm";

export function ReportViolation() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Laporkan Pelanggaran Parkir</h1>
        <p>Ambil foto/video atau gunakan kamera live untuk melaporkan pelanggaran parkir.</p>
      </header>
      <div className="card">
        <ViolationForm />
      </div>
    </div>
  );
}
