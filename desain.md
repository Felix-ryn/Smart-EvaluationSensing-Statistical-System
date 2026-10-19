# Smart Street Parking — Design Specification

> **Project:** Smart Street Parking  
> **UI type:** Web-based parking management dashboard  
> **Design style:** Modern, clean, professional, data-driven, rounded-card dashboard  
> **Primary language:** Indonesian  
> **Target role:** Admin / parking operator  
> **Reference:** `desain fix.jpeg`

---

## 1. Design Direction

Smart Street Parking menggunakan visual identity yang **modern, clean, professional, dan trustworthy**, dengan kombinasi:

- Deep teal/navy untuk navigasi dan identitas sistem.
- Emerald/teal sebagai warna aksi utama.
- Mint sebagai aksen dan background ringan.
- White sebagai surface utama.
- Abu-abu kebiruan untuk border, secondary text, dan background.
- Rounded corners yang konsisten.
- Shadow sangat ringan agar interface terasa layered tanpa terlihat berat.
- Dashboard menggunakan banyak **white cards** dengan data yang mudah dipindai.
- Layout desktop mengutamakan sidebar kiri + content area.
- Semua data penting menggunakan angka besar, label singkat, dan status badge.

### Visual keywords

`Modern` · `Clean` · `Professional` · `Smart City` · `Data Dashboard` · `Teal` · `Minimal` · `Rounded`

---

# 2. Color System

## 2.1 Brand Colors

| Token | Hex | RGB | Penggunaan |
|---|---|---|---|
| `--brand-900` | `#012B44` | 1, 43, 68 | Sidebar, heading gelap, primary dark |
| `--brand-800` | `#003B4D` | 0, 59, 77 | Sidebar secondary / dark surfaces |
| `--brand-700` | `#005C5A` | 0, 92, 90 | Dark teal |
| `--brand-600` | `#007C6F` | 0, 124, 111 | Primary teal |
| `--brand-500` | `#009B83` | 0, 155, 131 | Primary action |
| `--brand-400` | `#19B79A` | 25, 183, 154 | Accent |
| `--brand-300` | `#55CDB2` | 85, 205, 178 | Light accent |
| `--brand-100` | `#DDF5EF` | 221, 245, 239 | Pale teal |
| `--brand-50` | `#EFFAF7` | 239, 250, 247 | Very light teal |

### Recommended primary gradient

```css
linear-gradient(135deg, #007C6F 0%, #19B79A 100%);
```

Gunakan gradient hanya untuk primary button, active navigation, atau visual accent. Jangan menggunakan gradient pada seluruh background.

---

## 2.2 Neutral Colors

| Token | Hex | Penggunaan |
|---|---|---|
| `--white` | `#FFFFFF` | Card, input, main surface |
| `--surface` | `#F9FCFC` | Main content surface |
| `--background` | `#F1F7F9` | Page background |
| `--background-2` | `#EAF4F6` | Soft section background |
| `--border` | `#DCE9EC` | Card/input/table border |
| `--border-light` | `#E8F0F2` | Divider |
| `--text-900` | `#123747` | Main heading |
| `--text-800` | `#234A5A` | Strong body text |
| `--text-700` | `#416575` | Normal body text |
| `--text-500` | `#718994` | Secondary text |
| `--text-400` | `#9BAEB5` | Placeholder / disabled |
| `--black` | `#0B2029` | Very dark text |

---

## 2.3 Semantic Colors

### Success

```text
Success  : #009B83
Success BG: #E4F7F1
```

Digunakan untuk:
- Aktif
- Selesai
- Valid
- Terverifikasi
- Pembayaran berhasil
- Occupancy/status positif

### Warning

```text
Warning  : #E7A33E
Warning BG: #FFF4DF
```

Digunakan untuk:
- Pending
- Kapasitas tinggi
- Perlu perhatian

### Danger

```text
Danger   : #E65B63
Danger BG: #FDEBED
```

Digunakan untuk:
- Rejected
- Error
- Pelanggaran
- Data bermasalah

### Info

```text
Info   : #3187C7
Info BG: #EAF5FD
```

Digunakan untuk:
- Informasi
- Notifikasi
- Status netral

---

# 3. Typography

## 3.1 Primary Font

Gunakan **Poppins** sebagai font utama.

```css
font-family: 'Poppins', sans-serif;
```

Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Font hierarchy

| Elemen | Weight | Size | Line Height |
|---|---:|---:|---:|
| Page title | 700 | 24–28px | 1.25 |
| Section title | 600 | 18–20px | 1.35 |
| Card title | 600 | 14–16px | 1.4 |
| KPI number | 700 | 24–30px | 1.2 |
| Body | 400 | 13–14px | 1.5 |
| Label | 500 | 11–12px | 1.4 |
| Caption | 400 | 10–11px | 1.4 |
| Button | 600 | 12–13px | 1.2 |

### Typography rules

- Hindari font size terlalu kecil untuk data penting.
- KPI harus lebih besar daripada label.
- Heading menggunakan `--text-900`.
- Secondary information menggunakan `--text-500`.
- Angka uang menggunakan weight `600–700`.
- Gunakan `font-variant-numeric: tabular-nums` untuk tabel angka.

---

# 4. Layout System

## 4.1 Desktop

Target utama:

```text
1440px – 1536px viewport
```

Recommended structure:

```text
┌─────────────────────────────────────────────────────────────┐
│ Sidebar │ Header / Page Header                              │
│         ├───────────────────────────────────────────────────┤
│         │ Main Content                                      │
│         │                                                    │
│         │ Cards / Tables / Charts / Maps                    │
│         │                                                    │
└─────────┴───────────────────────────────────────────────────┘
```

### Dimensions

```text
Sidebar width        : 220–240px
Content padding      : 24–32px
Card gap             : 16–20px
Card radius          : 10–14px
Button radius        : 8–10px
Input height         : 40–44px
Table row height     : 42–52px
```

---

# 5. Sidebar

Sidebar adalah identitas visual utama aplikasi.

### Style

- Background: `#012B44`
- Width: `230px`
- Border radius kanan: `0` atau `12px`
- Logo di bagian atas.
- Menu menggunakan icon + label.
- Menu aktif menggunakan emerald/teal.
- Logout berada di bagian bawah.

### Struktur

```text
Smart Street Parking
────────────────────
▣ Dashboard
▣ Parkir
▣ Transaksi
▣ Pelanggan
▣ Area Parkir
▣ Kapasitas
▣ Laporan
▣ Pengaturan

        ...
▣ Keluar
```

### Active menu

```css
background: linear-gradient(135deg, #007C6F, #19B79A);
color: #FFFFFF;
```

---

# 6. Header

Header digunakan untuk:

- Breadcrumb / page title
- Greeting admin
- Date selector
- Time range
- Export/download
- User profile

### Style

```text
Background: transparent / white
Height: 48–64px
```

Judul halaman harus berada di kiri.

Action utama berada di kanan.

---

# 7. Cards

Semua dashboard card mengikuti sistem yang sama.

```text
Background : #FFFFFF
Radius     : 12px
Border     : 1px solid #E8F0F2
Shadow     : 0 4px 16px rgba(1,43,68,.05)
Padding    : 16–20px
```

### Hover

```css
transform: translateY(-1px);
box-shadow: 0 8px 24px rgba(1,43,68,.08);
```

Gunakan hover hanya pada card yang clickable.

---

# 8. KPI / Statistic Cards

KPI card menampilkan:

1. Icon
2. Label
3. Nilai utama
4. Trend / comparison

Contoh:

```text
┌─────────────────────────┐
│ ◉ Total Kendaraan       │
│                         │
│ 1.768                   │
│ ↑ 5% dari kemarin       │
└─────────────────────────┘
```

### Rules

- Value: 24–30px, weight 700.
- Label: 11–12px.
- Trend positif: success.
- Trend negatif: danger.
- Icon menggunakan soft semantic background.

---

# 9. Buttons

## Primary

```text
Background : #009B83
Color      : #FFFFFF
```

Hover:

```text
Background : #007C6F
```

## Secondary

```text
Background : #EFFAF7
Color      : #007C6F
Border     : #BFE9DE
```

## Outline

```text
Background : transparent
Border     : #DCE9EC
Color      : #416575
```

## Danger

```text
Background : #FDEBED
Color      : #E65B63
```

### Button dimensions

```text
Height       : 38–42px
Padding      : 0 14–18px
Border radius: 8px
Font size    : 12–13px
Font weight  : 600
```

---

# 10. Input & Form

Input:

```text
Height       : 42px
Background   : #FFFFFF
Border       : #DCE9EC
Radius       : 8px
Padding      : 0 12px
```

Focus:

```css
border-color: #009B83;
box-shadow: 0 0 0 3px rgba(0,155,131,.10);
```

Placeholder:

```text
#9BAEB5
```

---

# 11. Tables

Table adalah komponen utama pada:

- Area Parkir
- Transaksi Parkir
- Pelanggaran
- Rekonsiliasi
- Pajak & Setoran
- Laporan Per Area

### Header

```text
Background: #F5FAFA
Color     : #416575
Font      : 11–12px
Weight    : 600
```

### Body

```text
Background: #FFFFFF
Color     : #234A5A
Font      : 12–13px
```

### Row

```text
border-bottom: 1px solid #E8F0F2;
```

### Numeric columns

Align right atau center sesuai konteks.

### Important

Pada **Transaksi Parkir**, jangan gunakan kolom nomor plat jika desain final tidak membutuhkannya.

---

# 12. Status Badge

Badge harus compact.

### Aktif / Selesai

```text
Background: #E4F7F1
Color: #009B83
```

### Pending

```text
Background: #FFF4DF
Color: #E7A33E
```

### Rejected

```text
Background: #FDEBED
Color: #E65B63
```

### Style

```text
padding: 4px 8px
border-radius: 999px
font-size: 10–11px
font-weight: 600
```

---

# 13. Charts

Chart menggunakan visual yang minimal.

## Line Chart

Digunakan untuk:
- Tren kendaraan
- Tren transaksi

Primary line:

```text
#009B83
```

Grid:

```text
#E8F0F2
```

Background:

```text
transparent
```

## Bar Chart

Digunakan untuk:
- Pendapatan per hari
- Pendapatan per area

Bar:

```text
#19B79A
```

## Donut / Pie Chart

**Tidak digunakan pada desain final Page 7 dan Page 18.**

Jika suatu halaman membutuhkan komponen ringkasan kapasitas tanpa donut, gunakan:

- Progress bar
- Percentage badge
- KPI number
- Horizontal capacity indicator

---

# 14. Maps

Map digunakan pada:

- Dashboard
- Kapasitas Area
- Laporan (Peta)

### Map card

```text
Border radius: 10–12px
Overflow: hidden
```

Marker colors dapat digunakan untuk membedakan area:

```text
Area A → #009B83
Area B → #3187C7
Area C → #E7A33E
Area D → #E65B63
Area E → #7B61A8
```

---

# 15. Progress Bar

Progress bar cocok digunakan sebagai pengganti pie/donut chart.

```text
Track:
#E4F2EF

Progress:
#009B83
```

Height:

```text
8px
```

Radius:

```text
999px
```

---

# 16. Page Specifications

## Page 1 — Login / Splash Screen

### Layout

Split screen:

```text
Left  : 45% visual / parking illustration
Right : 55% login form
```

### Left

- Smart Street Parking logo
- Parking/street illustration
- Tagline:
  `Parkir Aman, Hidup Lebih Mudah`

### Right

- `Selamat Datang!`
- Email / Username
- Password
- Ingat saya
- Lupa password?
- Button `Masuk`

---

## Page 2 — Dashboard / Home

### KPI

- Total Kendaraan
- Total Transaksi
- Occupancy
- Pendapatan

### Main sections

1. Tren Kendaraan di Area Parkir — line chart
2. Peta Area Parkir — map
3. Jenis Kendaraan — distribution visualization

Dashboard harus dapat dipindai dalam waktu singkat.

---

## Page 3 — Area Parkir

### KPI

- Total Area
- Kapasitas Total
- Kendaraan Aktif
- Tersedia

### Table

Columns:

```text
Nama Area
Kapasitas
Terisi
Kosong
Status
```

---

## Page 4 — Transaksi Parkir

### Table

Columns final:

```text
ID Transaksi
Area
Masuk
Keluar
Durasi
Status
```

**Kolom Plat No. dihilangkan dari desain final.**

Action:

```text
+ Transaksi Baru
```

---

## Page 5 — Pembayaran

### Detail transaksi

- ID Transaksi
- Area
- Waktu Masuk
- Waktu Keluar
- Durasi

### Payment methods

- QRIS
- Cash

Primary action:

```text
Selesaikan Transaksi
```

---

## Page 6 — Laporan & Analytics

Tabs:

```text
Pendapatan
Transaksi
Pengunjung
```

Sections:

- Total Pendapatan
- Tingkat Occupancy
- Pendapatan per Hari
- Pendapatan per Area

Action:

```text
Export
```

---

## Page 7 — Kapasitas Area

Page ini fokus pada kapasitas area dan lokasi.

### Left

List:

```text
Area A
Kapasitas
Terisi
Persentase

Area B
Kapasitas
Terisi
Persentase

...
```

### Right

Map area parking.

### Final design rule

**Jangan gunakan pie chart/donut chart pada Page 7.**

Gunakan:
- Percentage text
- Progress bar
- Map

---

## Page 8 — Pendapatan

### KPI

- Total Pendapatan
- QRIS
- Cash

### Charts

- Pendapatan per Hari — bar chart
- Metode Pembayaran — horizontal progress bars

---

## Page 9 — Pajak & Setoran Jukir

### KPI

- Pajak Pengelola
- Setoran Jukir
- Total Pendapatan

### Content

- Rincian Setoran
- Aturan MOU

Action:

```text
Detail Pembayaran
```

---

## Page 10 — Rekonsiliasi

### KPI

- Total Transaksi
- Total QRIS
- Total Cash

### Table

```text
Tanggal
Transaksi
Setoran
Selisih
```

Selisih bermasalah menggunakan danger color.

---

## Page 11 — Pelanggaran

Table:

```text
Foto
Area
Waktu
Status
Aksi
```

Status:

- Pending
- Valid
- Rejected

Action:

```text
Detail
```

---

## Page 12 — Pengaturan

Sections:

### Area Parkir

Konfigurasi area.

### Tarif Parkir

Konfigurasi tarif.

### Metode Pembayaran

QRIS / Cash.

### Notifikasi

Pengaturan notifikasi.

### MOU & Aturan

Pengaturan pembagian/setoran.

### Profil Pengguna

- Ubah Profil
- Ubah Password

---

## Page 13 — Laporan Per Area

Table:

```text
Area
Transaksi
Kendaraan
Pendapatan
Occupancy
```

Summary:

```text
Total Kendaraan
Total Pendapatan
Total Transaksi
```

---

## Page 14 — Notifikasi

Notification list menggunakan icon semantic.

Categories:

- Transaksi baru
- Pelanggaran terdeteksi
- Transaksi selesai
- Laporan pelanggaran

Gunakan timestamp kecil dan secondary text.

---

## Page 15 — Laporan (Peta)

Main focus:

- Large map
- Area markers
- Legend
- Filter tanggal
- Export

Map menjadi visual utama halaman.

---

## Page 17 — Transaksi QRIS Detail

Layout split:

```text
Left  : QR code + transaction identity
Right : transaction details
```

Information:

- ID transaksi
- Area
- Waktu masuk
- Waktu keluar
- Durasi
- Total

Action:

```text
Selesai
```

---

## Page 18 — Laporan Per Area

### Header

- Date range
- Time range
- Download

### Table

Columns:

```text
Area
Terpakai
Kendaraan
Pendapatan
Capaian
```

### Total section

Tetap tampilkan summary total.

```text
Total Keseluruhan

Total Terpakai
Total Kendaraan
Total Pendapatan
Capaian Rata-rata
```

### Final design rule

**Pie/donut chart dihilangkan.**

Total tetap ditampilkan sebagai **summary card/grid**, bukan chart.

---

# 17. Spacing System

Gunakan kelipatan 4px.

```text
4px   — xs
8px   — sm
12px  — md-small
16px  — md
20px  — lg-small
24px  — lg
32px  — xl
40px  — 2xl
48px  — 3xl
```

### Recommended

```text
Page padding : 24px
Card padding : 16–20px
Card gap     : 16px
Section gap  : 24px
```

---

# 18. Border Radius

```text
--radius-sm : 6px
--radius-md : 8px
--radius-lg : 12px
--radius-xl : 16px
--radius-pill: 999px
```

Recommended:

- Input: 8px
- Button: 8px
- Card: 12px
- Large container: 14–16px
- Badge: 999px

---

# 19. Shadows

Gunakan shadow secara halus.

```css
--shadow-sm: 0 2px 8px rgba(1, 43, 68, 0.04);
--shadow-md: 0 4px 16px rgba(1, 43, 68, 0.06);
--shadow-lg: 0 8px 28px rgba(1, 43, 68, 0.08);
```

Jangan gunakan shadow hitam pekat.

---

# 20. Icons

Recommended icon style:

- Outline
- Rounded
- Stroke 1.7–2px
- Consistent icon size

Recommended library:

```text
Lucide Icons
```

Sizes:

```text
16px — table/action icon
18px — navigation
20px — card icon
24px — KPI
```

---

# 21. Responsive Behavior

## Desktop ≥ 1200px

```text
Sidebar : fixed
Content : full remaining width
Grid    : 4 KPI columns
```

## Tablet 768–1199px

```text
Sidebar : collapsible
KPI     : 2 columns
Charts  : 1–2 columns
```

## Mobile < 768px

```text
Sidebar : drawer
KPI     : 1 column
Tables  : horizontal scroll
Cards   : full width
```

---

# 22. Accessibility

Minimum requirements:

- Text contrast harus memenuhi WCAG AA.
- Jangan menjadikan warna satu-satunya indikator status.
- Semua icon action mempunyai tooltip/aria-label.
- Focus state harus terlihat.
- Input memiliki label.
- Button memiliki state hover/focus/disabled.
- Table header harus semantic.
- Jangan menggunakan font terlalu kecil untuk informasi penting.

---

# 23. CSS Architecture

Recommended structure:

```text
styles/
├── style.css
├── variables.css
├── components.css
├── layout.css
└── responsive.css
```

Jika hanya menggunakan satu CSS:

```text
style.css
├── Font & Reset
├── Variables
├── Global
├── Layout
├── Sidebar
├── Header
├── Cards
├── Buttons
├── Forms
├── Tables
├── Badges
├── Charts
├── Map
├── Notifications
├── Utilities
└── Responsive
```

---

# 24. Implementation Priority

Jika waktu pengerjaan terbatas, prioritaskan:

1. Sidebar
2. Global color system
3. Typography
4. Card system
5. KPI cards
6. Table
7. Button/input
8. Status badge
9. Dashboard grid
10. Charts
11. Map
12. Responsive

---

# 25. Final Visual Rules

### DO

- Gunakan white card di atas background yang sangat ringan.
- Gunakan teal sebagai primary action.
- Gunakan deep navy/teal untuk sidebar.
- Gunakan radius konsisten.
- Gunakan spacing 4px scale.
- Gunakan Poppins.
- Gunakan shadow ringan.
- Gunakan badge untuk status.
- Gunakan progress bar sebagai alternatif pie/donut.
- Pertahankan data hierarchy yang jelas.

### DON'T

- Jangan gunakan terlalu banyak warna.
- Jangan gunakan gradient pada setiap elemen.
- Jangan gunakan shadow berat.
- Jangan membuat sidebar terlalu lebar.
- Jangan membuat tabel terlalu padat.
- Jangan menggunakan pie/donut chart pada Page 7.
- Jangan menggunakan pie/donut chart pada Page 18.
- Jangan menambahkan kolom Plat No. pada Page 4 final.
- Jangan mengubah data hanya demi visual.
