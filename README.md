# 🏫 PantauSekolah - Sistem Pengawasan & Pelaporan Sekolah

**PantauSekolah** adalah platform berbasis web modern yang dirancang untuk mempermudah koordinasi, pemantauan, verifikasi laporan, dan manajemen arsip digital antara **Pengawas Pembina**, **Kepala Sekolah**, dan **Guru** secara terintegrasi dengan Google Drive dan Google Sheets.

---

## ✨ Fitur Utama

### 1. 🛡️ Role-Based Access Control (RBAC) & Isolasi Sekolah
* **Pengawas (*Super Admin*)**:
  * Akses penuh ke seluruh sekolah binaan.
  * Pemantauan laporan Kepala Sekolah & Guru per sekolah.
  * Modul *Folder Dokumen Sekolah* dengan *switcher* antar-sekolah binaan.
  * Manajemen Pengguna (*User Manager*) dan Manajemen Google Drive (*Drive Manager*).
  * Pemantauan riwayat sistem menyeluruh melalui **Audit Log Aktivitas**.
* **Kepala Sekolah**:
  * Akses eksklusif dan terisolasi untuk sekolah binaannya sendiri (tidak dapat melihat sekolah lain).
  * Pengawasan laporan pembelajaran guru.
  * Pendaftaran akun guru dan pembuatan folder Google Drive otomatis (*Guru Manager*).
  * Unggah laporan manajerial, kewirausahaan, dan supervisi.
* **Guru**:
  * Akses langsung ke folder pembelajaran sekolahnya sendiri.
  * **Privasi Dokumen (*Owner-Only*)**: Guru hanya dapat melihat dan mengelola berkas yang diunggah oleh dirinya sendiri.
  * Unggah berkas dokumen pembelajaran.

### 2. ⚡ Real-Time Live Sync & Cache-First
* Sinkronisasi data latar belakang otomatis setiap 12 detik (*LiveSync*) tanpa perlu *reload* halaman.
* *Optimistic UI Updates* (0ms rendering untuk penambahan, verifikasi, dan penghapusan).
* Indikator status sinkronisasi *real-time* di pojok bawah.

### 3. 🔄 Session Persistence & Anti-Flicker
* **Preservasi Modul saat Refresh (F5)**: Halaman mempertahankan modul/tab yang sedang dibuka tanpa mereset ke Dashboard.
* **Auto-Login saat Tab Ditutup/Dihapus**: Pengguna tetap otomatis masuk saat tab browser dibuka kembali menggunakan arsitektur *dual-storage (localStorage + 30-Day Cookie)*.
* **Anti-Flicker Screen**: Inisialisasi awal di `<head>` mencegah kedipan form login pada saat memuat ulang halaman.

### 4. 📁 Dukungan Berkas Multi-Format
* Mendukung berkas dokumen perkantoran: **Word (`.doc`, `.docx`)**, **Excel (`.xls`, `.xlsx`, `.csv`)**, **PDF (`.pdf`)**, dan gambar **(`.jpg`, `.jpeg`, `.png`)**.
* Penanganan MIME type otomatis untuk integrasi Google Drive.

### 5. 📱 Desain Responsif & Mobile Drawer
* Tata letak responsif penuh (*Warm Beige Edition*) menggunakan Tailwind CSS.
* *Drawer Sidebar Navigation* khusus layar sentuh/ponsel pintar (viewport mobile).
* Dialog konfirmasi interaktif pengganti fungsi bawaan browser (`confirm()`).

---

## 🧪 Jaminan Kualitas & Pengujian (Quality Assurance)

Aplikasi telah melalui pengujian otomatis menyeluruh (*End-to-End Automated Testing*) menggunakan Chrome Headless & Puppeteer dengan hasil:
* **Tingkat Kelulusan**: **100% (22 dari 22 Test Cases LULUS)**
* **Cacat Kritis (*Critical Bugs*)**: **0 (Nol)**
* **Laporan Lengkap**: Tersedia di dokumen PDF [`Laporan_Testing_PantauSekolah.pdf`](./Laporan_Testing_PantauSekolah.pdf) dan pratinjau interaktif [`report_preview.html`](./report_preview.html).

---

## 🛠️ Arsitektur & Teknologi

* **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript (ES6+), Font Awesome 6, Chart.js
* **Backend**: Google Apps Script (GAS) Web App
* **Penyimpanan Database**: Google Sheets (Multi-Sheet Schema: `Pengguna`, `Laporan_Kepsek`, `Laporan_Guru`, `Sekolah`, `Folder_Drive`, `Audit_Log`)
* **Penyimpanan Berkas**: Google Drive API Cloud Storage
* **Automation & Testing**: Node.js, Puppeteer-Core, Google Chrome CDP

---

## 🚀 Panduan Menjalankan Proyek

1. **Jalankan melalui Local Web Server (XAMPP / Apache / Python / Node)**:
   ```bash
   # Menggunakan Python
   python -m http.server 8080

   # Atau jalankan via Apache XAMPP
   # Letakkan folder di c:\xampp\htdocs\Project Pengawas
   # Buka http://localhost/Project%20Pengawas/
   ```
2. **Kredensial Akun Bawaan**:
   * **Pengawas**: `admin` / `admin123`
   * **Kepala Sekolah**: `azzikra` / `azzikra123` (SD Karya Bangsa) atau `ucok` / `ucok123` (SDN 1 Pinoh)
   * **Guru**: `sukardi` / `guru123` (SD Karya Bangsa) atau `ahmadfauzi` / `ahmadfauzi123` (SDN 1 Pinoh)

---

## 📄 Lisensi
Hak Cipta © 2026 PantauSekolah. Dikembangkan untuk efisiensi pengawasan pendidikan.
