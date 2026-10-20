# PANDUAN DEPLOY BACKEND GOOGLE APPS SCRIPT (GAS)

Dokumen ini menjelaskan langkah-langkah menerapkan skrip [`Code.gs`](file:///c:/xampp/htdocs/Project%20Pengawas/backend_gas/Code.gs) ke Google Spreadsheet Anda.

---

### Langkah 1: Buka Google Spreadsheet & Apps Script
1. Buka [Google Sheets](https://sheets.new) di browser Anda.
2. Beri nama spreadsheet, contohnya: **Database PantauSekolah**.
3. Di menu atas, klik **Extensions** (Ekstensi) > **Apps Script**.

---

### Langkah 2: Masukkan Kode `Code.gs`
1. Di editor Apps Script, hapus semua kode bawaan yang ada di `Code.gs`.
2. Buka berkas [`backend_gas/Code.gs`](file:///c:/xampp/htdocs/Project%20Pengawas/backend_gas/Code.gs) pada project ini, lalu salin (**Copy**) seluruh kodenya.
3. Tempel (**Paste**) ke editor Apps Script.
4. Klik tombol **Save** (ikon disket) atau tekan `Ctrl + S`.

---

### Langkah 3: Deploy sebagai Web App
1. Di sudut kanan atas editor Apps Script, klik tombol biru **Deploy** > **New deployment**.
2. Klik ikon gerigi ⚙️ di sebelah *Select type*, lalu pilih **Web app**.
3. Isi kolom konfigurasi berikut:
   * **Description**: `PantauSekolah API v2 (User Manager & Drive Auto)`
   * **Execute as**: `Me (email-anda@gmail.com)`
   * **Who has access**: `Anyone` *(PENTING: Pilih 'Anyone' agar aplikasi web dapat berkomunikasi tanpa kendala CORS)*.
4. Klik tombol **Deploy**.
5. Google akan meminta izin otorisasi akses Google Drive dan Spreadsheet:
   * Klik **Authorize access**.
   * Pilih akun Google Anda.
   * Jika muncul peringatan *"Google hasn't verified this app"*, klik **Advanced** > lalu klik **Go to Untitled project (unsafe)**.
   * Klik **Allow**.

---

### Langkah 4: Salin URL Web App ke Konfigurasi Frontend
1. Setelah proses deploy selesai, Anda akan mendapatkan **Web App URL** (berakhiran `/exec`).
2. Salin URL tersebut.
3. Buka berkas [`js/config.js`](file:///c:/xampp/htdocs/Project%20Pengawas/js/config.js) di proyek ini, lalu ganti nilai variabel `API_URL` dengan URL baru Anda:
   ```javascript
   const CONFIG = {
       API_URL: "MASUKKAN_URL_WEB_APP_ANDA_DISINI/exec",
       // ...
   };
   ```

---

### Fitur Live Sync, Multi-Sekolah & Perlindungan Arsip (v2.5)
Backend [`Code.gs`](file:///c:/xampp/htdocs/Project%20Pengawas/backend_gas/Code.gs) telah dilengkapi dengan:
- **Auto-Discovery Multi-Sekolah (`getOrRegisterAllSchools`)**: Otomatis mendeteksi seluruh sekolah binaan dari tabel Pengguna dan Laporan (misal SD Karya Bangsa, SDN 1 Pinoh), membuat folder Drive sekolah secara mandiri, dan mendaftarkannya ke sheet `Sekolah` sehingga Pengawas langsung melihat seluruh sekolah binaan.
- **Perlindungan Arsip Kepala Sekolah**: Kepala Sekolah hanya berwenang menambah dan menghapus folder untuk gurunya (`02_Laporan_Guru`). Folder arsip Kepala Sekolah (`01_Laporan_Kepsek`) dilindungi di level server dan frontend agar tidak dapat dihapus oleh Kepala Sekolah.
- **Wewenang Penuh Pengawas**: Pengawas tetap berhak menambah dan menghapus seluruh folder di semua sekolah tanpa batasan.
- **Modul Baru "Folder Dokumen Sekolah"**: Tampilan khusus yang memisahkan bagian folder guru (dapat dikelola & dihapus) dan arsip kepala sekolah (terkunci dengan badge aman).
- **`sync_all` & `delete_default_folder`**: Mendukung sinkronisasi kilat 1 roundtrip dan penghapusan folder bawaan (Mingguan & Daring) secara instan.

Jika Anda memperbarui `Code.gs`:
1. Klik **Deploy** > **Manage deployments**.
2. Klik ikon pensil ✏️ (Edit) pada deployment aktif.
3. Di dropdown **Version**, pilih **New version**.
4. Klik **Deploy**.

---

### Fitur AI Laporan Pengawas ke Dinas Pendidikan (Model: GPT OSS 120B)
Backend [`Code.gs`](file:///c:/xampp/htdocs/Project%20Pengawas/backend_gas/Code.gs) telah terhubung langsung dengan model **GPT OSS 120B** (open-weight reasoning model) untuk menghasilkan draf evaluasi supervisi manajerial/akademik dan rekomendasi tindak lanjut ke Kepala Dinas Pendidikan.

**Cara Pengaturan Kunci API di Google Apps Script (Opsional tapi Direkomendasikan):**
1. Di editor Google Apps Script, klik menu ⚙️ **Project Settings** (ikon roda gigi di menu samping kiri).
2. Gulir ke bawah ke bagian **Script Properties**.
3. Klik **Add script property**.
4. Masukkan:
   - **Property**: `AI_API_KEY`
   - **Value**: Masukkan API Key Anda (misal dari [OpenRouter](https://openrouter.ai/keys) atau provider OpenAI-compatible).
5. Klik **Save script properties**.
*(Catatan: Pengawas juga dapat memasukkan API Key langsung melalui modal pengaturan AI di tampilan web aplikasi PantauSekolah).*

---

### Akun Awal Bawaan (Default Admin)
Saat backend pertama kali dijalankan, sistem otomatis membuat akun default Pengawas:
* **Username**: `admin`
* **Password**: `admin123`
* **Role**: `Pengawas`

Password tersebut otomatis tersimpan dalam bentuk **Hash SHA-256 + Salt acak** di Google Spreadsheet. Anda dapat mengganti password atau membuat user baru melalui menu **Manajemen Pengguna** di dalam aplikasi.
