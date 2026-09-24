import { AlertTriangle, ClipboardList } from "lucide-react";
import { ViolationForm } from "../ViolationForm";

// Jenis pelanggaran murni ditentukan model AI (illegal-parking / none),
// jukir hanya upload foto + area + keterangan opsional.
export function JukirViolations() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>
          <AlertTriangle className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Upload Pelanggaran
        </h1>
        <p>Unggah foto bukti; AI menganalisis apakah terjadi pelanggaran.</p>
      </header>

      <div className="grid grid-2">
        <div className="card">
          <h2>Lapor Pelanggaran</h2>
          <ViolationForm defaultSource="JUKIR" />
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
                <strong>Upload segera setelah kejadian</strong>
                <p>Dapatkan waktu terbaik untuk laporan yang akurat.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
