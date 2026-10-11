import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Mou {
  id: string;
  name: string;
  taxPercent: number;
  operatorPercent: number;
  jukirSharePercent: number;
  // Motorcycle rates
  firstHour_motorcycle: number;
  nextHour_motorcycle: number;
  maximumDaily_motorcycle: number;
  // Car rates
  firstHour_car: number;
  nextHour_car: number;
  maximumDaily_car: number;
  validFrom: string;
  validTo: string | null;
}

export function Mou() {
  const [rules, setRules] = useState<Mou[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Form states for new rule
  const [name, setName] = useState("");
  const [taxPercent, setTaxPercent] = useState(10);
  const [jukirSharePercent, setJukirSharePercent] = useState(15);
  const [motorcycleFirstHour, setMotorcycleFirstHour] = useState(2000);
  const [motorcycleNextHour, setMotorcycleNextHour] = useState(1000);
  const [motorcycleMaxDaily, setMotorcycleMaxDaily] = useState(10000);
  const [carFirstHour, setCarFirstHour] = useState(3000);
  const [carNextHour, setCarNextHour] = useState(1500);
  const [carMaxDaily, setCarMaxDaily] = useState(15000);

  const load = () =>
    api
      .get("/mou")
      .then(({ data }) => setRules(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/mou", {
        name,
        taxPercent: Number(taxPercent),
        operatorPercent: 0,
        jukirSharePercent: Number(jukirSharePercent),
        // Motorcycle rates
        firstHour_motorcycle: Number(motorcycleFirstHour),
        nextHour_motorcycle: Number(motorcycleNextHour),
        maximumDaily_motorcycle: Number(motorcycleMaxDaily),
        // Car rates
        firstHour_car: Number(carFirstHour),
        nextHour_car: Number(carNextHour),
        maximumDaily_car: Number(carMaxDaily),
        validFrom: new Date().toISOString(),
      });
      setName("");
      setTaxPercent(10);
      setJukirSharePercent(15);
      setMotorcycleFirstHour(2000);
      setMotorcycleNextHour(1000);
      setMotorcycleMaxDaily(10000);
      setCarFirstHour(3000);
      setCarNextHour(1500);
      setCarMaxDaily(15000);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal menambah aturan");
    }
  }

  async function updateField(id: string, field: string, value: number) {
    try {
      await api.patch(`/mou/${id}`, { [field]: value });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal update");
    }
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">MOU / Aturan Pajak & Tarif Parkir</div>

      {/* Form Tambah Aturan Baru */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Tambah Aturan Baru</h2>
        <form onSubmit={add} style={{ display: "grid", gap: 12 }}>
          {/* Nama */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Nama Aturan</label>
            <input
              className="input"
              placeholder="mis. MOU 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Section 1: Tax & Share */}
          <fieldset style={{ border: "1px solid var(--lms-border)", borderRadius: 8, padding: 12, marginTop: 8 }}>
            <legend style={{ paddingLeft: 8, paddingRight: 8, fontWeight: 600, fontSize: 13 }}>Pajak & Bagi Hasil</legend>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Pajak Pengelola (%)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value))}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Bagian Juru Parkir (%)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={jukirSharePercent}
                  onChange={(e) => setJukirSharePercent(Number(e.target.value))}
                />
              </div>
            </div>
          </fieldset>

          {/* Section 2: Motorcycle Rates */}
          <fieldset style={{ border: "1px solid var(--lms-border)", borderRadius: 8, padding: 12, marginTop: 8 }}>
            <legend style={{ paddingLeft: 8, paddingRight: 8, fontWeight: 600, fontSize: 13 }}>Tarif Motor</legend>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Jam Pertama (Rp)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={motorcycleFirstHour}
                  onChange={(e) => setMotorcycleFirstHour(Number(e.target.value))}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Jam Berikutnya (Rp)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={motorcycleNextHour}
                  onChange={(e) => setMotorcycleNextHour(Number(e.target.value))}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Max Harian (Rp)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={motorcycleMaxDaily}
                  onChange={(e) => setMotorcycleMaxDaily(Number(e.target.value))}
                />
              </div>
            </div>
          </fieldset>

          {/* Section 3: Car Rates */}
          <fieldset style={{ border: "1px solid var(--lms-border)", borderRadius: 8, padding: 12, marginTop: 8 }}>
            <legend style={{ paddingLeft: 8, paddingRight: 8, fontWeight: 600, fontSize: 13 }}>Tarif Mobil</legend>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Jam Pertama (Rp)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={carFirstHour}
                  onChange={(e) => setCarFirstHour(Number(e.target.value))}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Jam Berikutnya (Rp)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={carNextHour}
                  onChange={(e) => setCarNextHour(Number(e.target.value))}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Max Harian (Rp)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={carMaxDaily}
                  onChange={(e) => setCarMaxDaily(Number(e.target.value))}
                />
              </div>
            </div>
          </fieldset>

          <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={!name}>
            Tambah Aturan
          </button>
        </form>
      </div>

      {/* Daftar Aturan Aktif */}
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Aturan Aktif</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: "var(--lms-bg-body)" }}>
                <th style={th}>Nama</th>
                <th style={th}>Pajak (%)</th>
                <th style={th}>Motor 1h</th>
                <th style={th}>Motor Berikutnya</th>
                <th style={th}>Mobil 1h</th>
                <th style={th}>Mobil Berikutnya</th>
                <th style={th}>Berlaku Sejak</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.name}</td>
                  <td style={td}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      defaultValue={r.taxPercent}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.taxPercent) updateField(r.id, "taxPercent", v);
                      }}
                      style={{ width: 60 }}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      defaultValue={r.firstHour_motorcycle}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.firstHour_motorcycle) updateField(r.id, "firstHour_motorcycle", v);
                      }}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      defaultValue={r.nextHour_motorcycle}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.nextHour_motorcycle) updateField(r.id, "nextHour_motorcycle", v);
                      }}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      defaultValue={r.firstHour_car}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.firstHour_car) updateField(r.id, "firstHour_car", v);
                      }}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      defaultValue={r.nextHour_car}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.nextHour_car) updateField(r.id, "nextHour_car", v);
                      }}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td style={td}>{new Date(r.validFrom).toLocaleDateString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid var(--lms-border)", fontSize: 12, fontWeight: 600, color: "var(--lms-text-secondary)" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--lms-border-light)" };
