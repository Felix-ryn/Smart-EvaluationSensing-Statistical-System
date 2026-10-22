import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { ViolationForm } from "../ViolationForm";
import { api } from "../../api/client";

interface Violation {
  id: string;
  photoPath: string;
  violationType: string;
  confidence: number | null;
  source: string;
  status: "PENDING" | "VALID" | "REJECTED";
  createdAt: string;
  area?: { name: string } | null;
}

export function JukirViolations() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(false);

  const loadViolations = () => {
    setLoading(true);
    api.get("/violations/mine")
      .then(({ data }) => {
        const ilegalOnly = (data.data || [])
          .filter((v: Violation) => v.violationType === "parking_violation")
          .sort((a: Violation, b: Violation) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        setViolations(ilegalOnly);
      })
      .catch((err) => console.error("Load violations error:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadViolations();
  }, []);

  async function handleValidate(violationId: string, status: "VALID" | "REJECTED") {
    try {
      await api.patch(`/violations/${violationId}/status`, { status });
      loadViolations();
    } catch (err: any) {
      alert(err.response?.data?.message || "Gagal update status");
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          <AlertTriangle className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Upload & Deteksi Pelanggaran
        </h1>
        <p>Unggah foto atau gunakan kamera live; AI menganalisis dan hasil langsung tersimpan ke tabel laporan.</p>
      </header>

      <div className="grid grid-2">
        <div className="card">
          <h2>Lapor Pelanggaran</h2>
          <ViolationForm defaultSource="JUKIR" onDone={loadViolations} />
        </div>

        <div className="card">
          <h2>
            <ClipboardList className="title-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> Instruksi Pengumpulan
          </h2>
          <div className="instruction-list">
            <div className="instruction-item">
              <div className="step-number">1</div>
              <div className="step-content">
                <strong>Pastikan kondisi terang</strong>
                <p>Ambil foto dengan pencahayaan yang cukup agar jelas terlihat.</p>
              </div>
            </div>
            <div className="instruction-item">
              <div className="step-number">2</div>
              <div className="step-content">
                <strong>Capture plat nomor (jika ada)</strong>
                <p>Sertakan gambar yang menunjukkan posisi kendaraan dan lingkungan sekitar.</p>
              </div>
            </div>
            <div className="instruction-item">
              <div className="step-number">3</div>
              <div className="step-content">
                <strong>Upload atau deteksi langsung</strong>
                <p>Hasil pelanggaran langsung masuk ke tabel laporan di bawah.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Laporan Saya - Violations Table */}
      {loading ? (
        <div className="card"><div className="loading">Memuat laporan...</div></div>
      ) : violations.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: "center", color: "#6b7280", padding: "20px 0" }}>
            Belum ada laporan pelanggaran.
          </div>
        </div>
      ) : (
        <div className="card table-wrap">
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Laporan Saya</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Area</th>
                  <th>Sumber</th>
                  <th>Status</th>
                  <th>Waktu</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <a href={v.photoPath} target="_blank" rel="noreferrer">
                        <img src={v.photoPath} alt="violation" style={{ width: 60, height: 45, borderRadius: 4, objectFit: "cover" }} />
                      </a>
                    </td>
                    <td>{v.area?.name || "—"}</td>
                    <td><span className="badge badge-secondary">{v.source}</span></td>
                    <td>
                      <span className={`badge ${
                        v.status === "PENDING" ? "badge-warning" : 
                        v.status === "VALID" ? "badge-danger" : 
                        "badge-success"
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td style={{ fontSize: "12px", color: "#6b7280" }}>
                      {new Date(v.createdAt).toLocaleString("id-ID")}
                    </td>
                    <td>
                      {v.status === "PENDING" ? (
                        <div style={{ display: "flex", gap: "6px", flexDirection: "column" }}>
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleValidate(v.id, "VALID")}
                            style={{ fontSize: "11px", padding: "4px 8px" }}
                          >
                            Valid
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleValidate(v.id, "REJECTED")}
                            style={{ fontSize: "11px", padding: "4px 8px" }}
                          >
                            Tolak
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>Selesai</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
