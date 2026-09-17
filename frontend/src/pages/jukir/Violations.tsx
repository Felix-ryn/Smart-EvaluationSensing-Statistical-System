import { useState } from "react";
import { apiClient } from "../../api/client";

export function JukirViolations() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    areaId: "",
    violationType: "illegal-parking",
    description: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState(false);

  const areas = [
    { id: "area-a", name: "Area A" },
    { id: "area-b", name: "Area B" },
    { id: "area-c", name: "Area C" },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      alert("Silakan upload foto pelanggaran");
      return;
    }

    if (!formData.areaId) {
      alert("Pilih area terlebih dahulu");
      return;
    }

    setLoading(true);
    try {
      const submitData = new FormData();
      submitData.append("areaId", formData.areaId);
      submitData.append("violationType", formData.violationType);
      if (formData.description) {
        submitData.append("description", formData.description);
      }
      submitData.append("photo", file);

      // TODO: Implement API call
      // const response = await apiClient.post("/violations", submitData, {
      //   headers: { "Content-Type": "multipart/form-data" }
      // });

      // For now, simulate success
      setTimeout(() => {
        setUploaded(true);
        alert("Pelanggaran berhasil dilaporkan!");
        setFormData({ areaId: "", violationType: "illegal-parking", description: "" });
        setFile(null);
        
        setTimeout(() => setUploaded(false), 3000);
      }, 1500);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Gagal upload pelanggaran");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>⚠️ Upload Pelanggaran</h1>
        <p>Laporkan pelanggaran parkir dengan foto bukti</p>
      </header>

      <div className="grid grid-2">
        {/* Left Column - Form */}
        <div className="card">
          <h2>Lapor Pelanggaran</h2>
          
          {uploaded && (
            <div className="alert alert-success mb-4">
              ✓ Pelaporan berhasil dikirim!
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Pilih Area *</label>
              <select
                className="input"
                value={formData.areaId}
                onChange={(e) => setFormData({ ...formData, areaId: e.target.value })}
                required
              >
                <option value="">-- Pilih Area --</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group mt-4">
              <label>Tipe Pelanggaran</label>
              <select
                className="input"
                value={formData.violationType}
                onChange={(e) => setFormData({ ...formData, violationType: e.target.value })}
              >
                <option value="illegal-parking">Parkir Tidak Sesuai Tempat</option>
                <option value="over-capacity">Melebihi Kapasitas</option>
                <option value="blocking-entrance">Memblokir Keluar Masuk</option>
                <option value="no-payment">Tidak Bayar Parkir</option>
                <option value="other">Lainnya</option>
              </select>
            </div>

            <div className="form-group mt-4">
              <label>Keterangan (Opsional)</label>
              <textarea
                className="input input-textarea"
                rows={3}
                placeholder="Tambahkan keterangan jika diperlukan..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="form-group mt-4">
              <label>Foto Bukti *</label>
              <input
                type="file"
                className="input-file"
                accept="image/*"
                onChange={handleFileChange}
                required
              />
              <small className="text-muted">
                Format: JPG, PNG. Max size: 5MB
              </small>
              
              {file && (
                <div className="file-info mt-3">
                  📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            <div className="actions mt-6">
              <button
                type="submit"
                className="btn btn-primary w-100"
                disabled={loading || !file || !formData.areaId}
              >
                {loading ? "Mengupload..." : "📤 Submit Pelanggaran"}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column - Instructions & Recent */}
        <div className="card">
          <h2>📋 Instruksi Pengumpulan</h2>
          
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

          <div className="recent-violations mt-6">
            <h3>Recent Submissions</h3>
            <table className="table table-small">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>10:30 AM</td>
                  <td><span className="badge badge-warning">Pending Review</span></td>
                </tr>
                <tr>
                  <td>Yesterday 3:45 PM</td>
                  <td><span className="badge badge-success">Valid</span></td>
                </tr>
                <tr>
                  <td>Yesterday 2:15 PM</td>
                  <td><span className="badge badge-danger">Rejected</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
