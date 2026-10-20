/**
 * ==========================================================================
 * PantauSekolah - Dinas Education Report Manager
 * Modul Penyusunan & Ekspor Laporan Resmi Pengawas ke Dinas Pendidikan
 * Sesuai Regulasi Supervisi Manajerial & Akademik Satuan Pendidikan
 * ==========================================================================
 */

const DinasReportManager = {
    // State data laporan
    state: {
        nomorSurat: "421.7/082/DISDIK-PENGAWAS/" + new Date().getFullYear(),
        periode: "Semester Ganjil TA 2025/2026",
        tanggalSurat: new Date().toISOString().split('T')[0],
        namaPengawas: "Drs. H. Mulyadi, M.Pd.",
        nipPengawas: "19720415 199802 1 003",
        pangkatPengawas: "Pembina Utama Muda (IV/c)",
        jabatanPengawas: "Pengawas Sekolah Ahli Madya",
        wilayahBinaan: "Rayon I (Kecamatan Wilayah Binaan)",
        namaKadis: "H. Bambang Sutrisno, S.H., M.M.",
        nipKadis: "19681120 199403 1 002",
        jabatanKadis: "Kepala Dinas Pendidikan",
        instansiDinas: "PEMERINTAH KABUPATEN / KOTA\nDINAS PENDIDIKAN",
        alamatDinas: "Jl. Pendidikan No. 45, Kompleks Perkantoran Pemerintah Daerah",
        selectedSchool: "all",
        catatanTemuan: "",
        rekomendasiDinas: "",
        calculatedData: null
    },

    /**
     * Inisialisasi Modul Laporan Dinas
     */
    init() {
        this.loadSavedPreferences();
        this.populateSchoolFilter();
        this.calculateReportMetrics();
        this.syncFormInputs();
        this.renderPreview();
    },

    /**
     * Memuat preferensi data pengawas dari LocalStorage atau profil pengguna
     */
    loadSavedPreferences() {
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (currentUser && currentUser.role === "Pengawas") {
            if (currentUser.nama) this.state.namaPengawas = currentUser.nama;
        }

        try {
            const saved = localStorage.getItem("pantausekolah_dinas_report_pref");
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.assign(this.state, parsed);
            }
        } catch (e) {
            console.warn("Gagal membaca preferensi laporan dinas:", e);
        }
    },

    /**
     * Menyimpan preferensi isian pengawas ke LocalStorage
     */
    savePreferences() {
        try {
            const toSave = {
                nomorSurat: this.state.nomorSurat,
                periode: this.state.periode,
                namaPengawas: this.state.namaPengawas,
                nipPengawas: this.state.nipPengawas,
                pangkatPengawas: this.state.pangkatPengawas,
                jabatanPengawas: this.state.jabatanPengawas,
                wilayahBinaan: this.state.wilayahBinaan,
                namaKadis: this.state.namaKadis,
                nipKadis: this.state.nipKadis,
                jabatanKadis: this.state.jabatanKadis,
                instansiDinas: this.state.instansiDinas,
                alamatDinas: this.state.alamatDinas
            };
            localStorage.setItem("pantausekolah_dinas_report_pref", JSON.stringify(toSave));
        } catch (e) {
            console.warn("Gagal menyimpan preferensi laporan dinas:", e);
        }
    },

    /**
     * Mengisi dropdown filter sekolah binaan
     */
    populateSchoolFilter() {
        const select = document.getElementById("dinas-filter-sekolah");
        if (!select) return;

        let schools = [];
        if (typeof DashboardManager !== "undefined" && typeof DashboardManager.getAllSchoolsList === "function") {
            schools = DashboardManager.getAllSchoolsList();
        } else if (typeof LiveSync !== "undefined" && LiveSync.state && Array.isArray(LiveSync.state.schools)) {
            schools = LiveSync.state.schools.map(s => s.nama || "").filter(Boolean);
        }

        const currentVal = this.state.selectedSchool || "all";
        let html = `<option value="all">🏢 Seluruh Sekolah Binaan (${schools.length} Sekolah)</option>`;
        schools.forEach(sch => {
            html += `<option value="${sch}">${sch}</option>`;
        });
        select.innerHTML = html;
        select.value = currentVal;
    },

    /**
     * Sinkronkan state ke input formulir
     */
    syncFormInputs() {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val;
        };

        setVal("dinas-input-nomor", this.state.nomorSurat);
        setVal("dinas-input-periode", this.state.periode);
        setVal("dinas-input-tanggal", this.state.tanggalSurat);
        setVal("dinas-input-nama-pengawas", this.state.namaPengawas);
        setVal("dinas-input-nip-pengawas", this.state.nipPengawas);
        setVal("dinas-input-pangkat-pengawas", this.state.pangkatPengawas);
        setVal("dinas-input-jabatan-pengawas", this.state.jabatanPengawas);
        setVal("dinas-input-wilayah", this.state.wilayahBinaan);
        setVal("dinas-input-nama-kadis", this.state.namaKadis);
        setVal("dinas-input-nip-kadis", this.state.nipKadis);
        setVal("dinas-input-instansi", this.state.instansiDinas);
        setVal("dinas-input-alamat", this.state.alamatDinas);

        if (!this.state.catatanTemuan || !this.state.rekomendasiDinas) {
            this.generateAutoDraft(false);
        } else {
            setVal("dinas-input-temuan", this.state.catatanTemuan);
            setVal("dinas-input-rekomendasi", this.state.rekomendasiDinas);
        }
    },

    /**
     * Membaca perubahan dari input formulir ke state
     */
    readFormInputs() {
        const getVal = (id, fallback) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : fallback;
        };

        this.state.nomorSurat = getVal("dinas-input-nomor", this.state.nomorSurat);
        this.state.periode = getVal("dinas-input-periode", this.state.periode);
        this.state.tanggalSurat = getVal("dinas-input-tanggal", this.state.tanggalSurat);
        this.state.namaPengawas = getVal("dinas-input-nama-pengawas", this.state.namaPengawas);
        this.state.nipPengawas = getVal("dinas-input-nip-pengawas", this.state.nipPengawas);
        this.state.pangkatPengawas = getVal("dinas-input-pangkat-pengawas", this.state.pangkatPengawas);
        this.state.jabatanPengawas = getVal("dinas-input-jabatan-pengawas", this.state.jabatanPengawas);
        this.state.wilayahBinaan = getVal("dinas-input-wilayah", this.state.wilayahBinaan);
        this.state.namaKadis = getVal("dinas-input-nama-kadis", this.state.namaKadis);
        this.state.nipKadis = getVal("dinas-input-nip-kadis", this.state.nipKadis);
        this.state.instansiDinas = getVal("dinas-input-instansi", this.state.instansiDinas);
        this.state.alamatDinas = getVal("dinas-input-alamat", this.state.alamatDinas);
        this.state.catatanTemuan = getVal("dinas-input-temuan", this.state.catatanTemuan);
        this.state.rekomendasiDinas = getVal("dinas-input-rekomendasi", this.state.rekomendasiDinas);
        
        const schSelect = document.getElementById("dinas-filter-sekolah");
        if (schSelect) this.state.selectedSchool = schSelect.value;

        this.savePreferences();
    },

    /**
     * Menghitung seluruh metrik kepatuhan dan agregasi laporan sekolah
     */
    calculateReportMetrics() {
        let allSchools = [];
        if (typeof DashboardManager !== "undefined" && typeof DashboardManager.getAllSchoolsList === "function") {
            allSchools = DashboardManager.getAllSchoolsList();
        } else if (typeof LiveSync !== "undefined" && LiveSync.state && Array.isArray(LiveSync.state.schools)) {
            allSchools = LiveSync.state.schools.map(s => s.nama || "").filter(Boolean);
        }

        let allReports = [];
        if (typeof LiveSync !== "undefined" && LiveSync.state) {
            const repK = Array.isArray(LiveSync.state.reportsKepsek) ? LiveSync.state.reportsKepsek : [];
            const repG = Array.isArray(LiveSync.state.reportsGuru) ? LiveSync.state.reportsGuru : [];
            allReports = [...repK, ...repG];
        } else if (typeof DashboardManager !== "undefined" && DashboardManager.cachedData) {
            const repK = Array.isArray(DashboardManager.cachedData.reportsKepsek) ? DashboardManager.cachedData.reportsKepsek : [];
            const repG = Array.isArray(DashboardManager.cachedData.reportsGuru) ? DashboardManager.cachedData.reportsGuru : [];
            allReports = [...repK, ...repG];
        }

        let allFolders = [];
        if (typeof DashboardManager !== "undefined" && typeof DashboardManager.getAllAvailableFolders === "function") {
            allFolders = DashboardManager.getAllAvailableFolders();
        } else if (typeof LiveSync !== "undefined" && LiveSync.state && Array.isArray(LiveSync.state.folders)) {
            allFolders = LiveSync.state.folders.map(f => f.namaFolder || "").filter(Boolean);
        }

        // Ambil daftar kepala sekolah dari users cache jika ada
        const usersList = (typeof UserManager !== "undefined" && Array.isArray(UserManager.cachedUsers))
            ? UserManager.cachedUsers
            : (typeof LiveSync !== "undefined" && Array.isArray(LiveSync.state.users) ? LiveSync.state.users : []);

        const targetSchools = this.state.selectedSchool === "all"
            ? allSchools
            : allSchools.filter(s => s.toLowerCase() === (this.state.selectedSchool || "").toLowerCase());

        let totalBerkasAll = 0;
        let totalDisetujuiAll = 0;
        let totalPerbaikanAll = 0;
        let totalDitolakAll = 0;
        let totalMenungguAll = 0;

        const schoolRows = targetSchools.map((schName, idx) => {
            const sReports = allReports.filter(r => (r.asalSekolah || "").toLowerCase() === schName.toLowerCase());
            
            // Cari data Kepala Sekolah dari user manager
            const kepsekUser = usersList.find(u => 
                (u.asalSekolah || "").toLowerCase() === schName.toLowerCase() && 
                (u.role === "Kepala Sekolah" || u.role === "Kepsek")
            );
            const namaKepsek = kepsekUser ? kepsekUser.nama : "-";

            const countTotal = sReports.length;
            const countDisetujui = sReports.filter(r => r.status === "Disetujui").length;
            const countPerbaikan = sReports.filter(r => r.status === "Perlu Perbaikan").length;
            const countDitolak = sReports.filter(r => r.status === "Ditolak").length;
            const countMenunggu = sReports.filter(r => r.status === "Menunggu Verifikasi" || r.status === "Menunggu").length;

            totalBerkasAll += countTotal;
            totalDisetujuiAll += countDisetujui;
            totalPerbaikanAll += countPerbaikan;
            totalDitolakAll += countDitolak;
            totalMenungguAll += countMenunggu;

            // Hitung kepatuhan folder & berkas
            let percentCompliance = 0;
            if (allFolders.length > 0) {
                let completedFolders = 0;
                allFolders.forEach(folderName => {
                    const fLower = folderName.toLowerCase();
                    const hasF = sReports.some(r => {
                        const j = (r.jenisPelaporan || "").toLowerCase();
                        const k = (r.kategori || "").toLowerCase();
                        return j === fLower || k === fLower || j.includes(fLower) || fLower.includes(j);
                    });
                    if (hasF) completedFolders++;
                });
                percentCompliance = Math.round((completedFolders / allFolders.length) * 100);
            } else {
                percentCompliance = countTotal > 0 ? (countDisetujui > 0 ? 100 : 70) : 0;
            }

            // Kategori Predikat Kepatuhan
            let predikat = "Perlu Pembinaan";
            let predikatBadge = "bg-rose-100 text-rose-800 border-rose-200";
            if (percentCompliance >= 85) {
                predikat = "Sangat Baik";
                predikatBadge = "bg-emerald-100 text-emerald-800 border-emerald-200";
            } else if (percentCompliance >= 60) {
                predikat = "Baik";
                predikatBadge = "bg-blue-100 text-blue-800 border-blue-200";
            } else if (percentCompliance >= 40) {
                predikat = "Cukup";
                predikatBadge = "bg-amber-100 text-amber-800 border-amber-200";
            }

            return {
                no: idx + 1,
                namaSekolah: schName,
                namaKepsek: namaKepsek,
                totalBerkas: countTotal,
                disetujui: countDisetujui,
                perbaikan: countPerbaikan,
                ditolak: countDitolak,
                menunggu: countMenunggu,
                persentase: percentCompliance,
                predikat: predikat,
                predikatBadge: predikatBadge
            };
        });

        // Rata-rata kepatuhan seluruh binaan
        const avgCompliance = schoolRows.length > 0 
            ? Math.round(schoolRows.reduce((acc, curr) => acc + curr.persentase, 0) / schoolRows.length)
            : 0;

        const sangatBaikSchools = schoolRows.filter(s => s.persentase >= 85);
        const perluPembinaanSchools = schoolRows.filter(s => s.persentase < 60);

        this.state.calculatedData = {
            totalSekolah: targetSchools.length,
            totalBerkas: totalBerkasAll,
            totalDisetujui: totalDisetujuiAll,
            totalPerbaikan: totalPerbaikanAll,
            totalDitolak: totalDitolakAll,
            totalMenunggu: totalMenungguAll,
            rataKepatuhan: avgCompliance,
            schoolRows: schoolRows,
            sangatBaikSchools: sangatBaikSchools,
            perluPembinaanSchools: perluPembinaanSchools,
            totalFoldersTarget: allFolders.length
        };

        return this.state.calculatedData;
    },

    /**
     * Generator Cerdas Draf Temuan & Rekomendasi Pengawas ke Dinas Pendidikan
     */
    generateAutoDraft(showAlert = true) {
        this.calculateReportMetrics();
        const data = this.state.calculatedData;
        if (!data) return;

        // Susun Draf Temuan Lapangan
        let temuanText = `1. Evaluasi Pelaporan Manajerial & Akademik:\n`;
        temuanText += `   - Sebanyak ${data.totalDisetujui} dari total ${data.totalBerkas} berkas laporan telah ditelaah dan dinyatakan Memenuhi Standar (Disetujui).\n`;
        if (data.totalPerbaikan > 0 || data.totalDitolak > 0) {
            temuanText += `   - Masih terdapat ${data.totalPerbaikan} berkas memerlukan revisi/perbaikan administratif dan ${data.totalDitolak} berkas belum sesuai regulasi petunjuk teknis.\n`;
        }

        temuanText += `\n2. Kepatuhan Satuan Pendidikan Binaan:\n`;
        temuanText += `   - Rata-rata tingkat pemenuhan dokumen pembinaan mencapai ${data.rataKepatuhan}%.\n`;

        if (data.sangatBaikSchools.length > 0) {
            const listBaik = data.sangatBaikSchools.slice(0, 3).map(s => s.namaSekolah).join(", ");
            const more = data.sangatBaikSchools.length > 3 ? ` dan ${data.sangatBaikSchools.length - 3} sekolah lainnya` : "";
            temuanText += `   - Satuan pendidikan dengan kinerja administrasi Sangat Baik meliputi: ${listBaik}${more}.\n`;
        }

        if (data.perluPembinaanSchools.length > 0) {
            const listKurang = data.perluPembinaanSchools.map(s => `${s.namaSekolah} (${s.persentase}%)`).join(", ");
            temuanText += `   - Terdapat ${data.perluPembinaanSchools.length} sekolah yang membutuhkan asistensi percepatan administrasi: ${listKurang}.\n`;
        } else {
            temuanText += `   - Seluruh sekolah binaan telah mencapai ambang batas kepatuhan minimal di atas 60%.\n`;
        }

        temuanText += `\n3. Kendala Lapangan yang Ditemukan:\n`;
        temuanText += `   - Keterbatasan pemahaman teknis dalam penyusunan instrumen evaluasi pembelajaran dan administrasi RKT/RKAS berbasis rapor pendidikan.\n`;
        temuanText += `   - Penyesuaian rotasi guru dan tenaga kependidikan pada awal semester yang memerlukan pendampingan berkelanjutan.`;

        // Susun Draf Rekomendasi untuk Kepala Dinas
        let rekomText = `Berdasarkan hasil supervisi manajerial dan akademik yang telah dilaksanakan, disampaikan rekomendasi tindak lanjut kepada Kepala Dinas Pendidikan sebagai berikut:\n\n`;
        rekomText += `1. Pembinaan Khusus & Pendampingan Intensif:\n`;
        if (data.perluPembinaanSchools.length > 0) {
            rekomText += `   - Memberikan surat atensi serta memfasilitasi pendampingan/klinik administrasi bagi sekolah dengan tingkat kepatuhan di bawah 60% (${data.perluPembinaanSchools.map(s => s.namaSekolah).join(", ")}).\n`;
        } else {
            rekomText += `   - Menjadwalkan penguatan kapasitas manajerial berkala untuk menjaga stabilitas mutu administrasi sekolah binaan.\n`;
        }

        rekomText += `\n2. Peningkatan Kompetensi Guru & Kepala Sekolah:\n`;
        rekomText += `   - Menyelenggarakan Workshop / Bimbingan Teknis (Bimtek) terpadu mengenai penyusunan Modul Ajar berdiferensiasi dan instrumen asesmen pembelajaran Kurikulum Merdeka.\n`;
        rekomText += `   - Memberikan pelatihan penguatan kepemimpinan instruksional bagi Kepala Sekolah binaan.\n`;

        rekomText += `\n3. Apresiasi & Motivasi Kinerja Satuan Pendidikan:\n`;
        rekomText += `   - Memberikan apresiasi atau penghargaan resmi Dinas Pendidikan kepada satuan pendidikan dengan tingkat kepatuhan dan mutu dokumen tertinggi sebagai percontohan (*benchmarking*) antar-sekolah.\n`;

        rekomText += `\n4. Dukungan Kebijakan & Infrastruktur Digital:\n`;
        rekomText += `   - Memperkuat integrasi pemantauan digital melalui portal PantauSekolah dan Google Drive dinas agar supervisi berkelanjutan dapat berjalan transparan dan *real-time*.`;

        this.state.catatanTemuan = temuanText;
        this.state.rekomendasiDinas = rekomText;

        const inputTemuan = document.getElementById("dinas-input-temuan");
        const inputRekom = document.getElementById("dinas-input-rekomendasi");
        if (inputTemuan) inputTemuan.value = temuanText;
        if (inputRekom) inputRekom.value = rekomText;

        this.renderPreview();

        if (showAlert && typeof App !== "undefined" && typeof App.showToast === "function") {
            App.showToast("Draf analisis dan rekomendasi otomatis berhasil disintesis dari data supervisi!", "success");
        }
    },

    /**
     * Format tanggal ke format formal Bahasa Indonesia (contoh: 20 Oktober 2026)
     */
    formatTanggalFormal(isoDateStr) {
        if (!isoDateStr) return "-";
        try {
            const months = [
                "Januari", "Februari", "Maret", "April", "Mei", "Juni",
                "Juli", "Agustus", "September", "Oktober", "November", "Desember"
            ];
            const d = new Date(isoDateStr);
            if (isNaN(d.getTime())) return isoDateStr;
            return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        } catch (e) {
            return isoDateStr;
        }
    },

    /**
     * Render Tampilan Dokumen Laporan Resmi (Paper Preview)
     */
    renderPreview() {
        this.readFormInputs();
        this.calculateReportMetrics();

        const data = this.state.calculatedData;
        const paper = document.getElementById("dinas-report-paper");
        if (!paper || !data) return;

        const tanggalFormal = this.formatTanggalFormal(this.state.tanggalSurat);
        const instansiLines = (this.state.instansiDinas || "").split("\n").filter(Boolean);
        const instansiHtml = instansiLines.map((line, idx) => {
            const sizeClass = idx === 0 ? "text-sm font-semibold tracking-wide" : "text-base sm:text-lg font-black tracking-wider";
            return `<div class="${sizeClass}">${line}</div>`;
        }).join("");

        // Render Baris Tabel Sekolah
        let rowsHtml = "";
        if (data.schoolRows.length === 0) {
            rowsHtml = `
                <tr>
                    <td colspan="7" class="p-4 text-center text-slate-400 italic">
                        Belum ada data sekolah binaan yang terdaftar.
                    </td>
                </tr>
            `;
        } else {
            data.schoolRows.forEach(row => {
                rowsHtml += `
                    <tr class="border-b border-slate-200">
                        <td class="p-2 text-center text-xs font-semibold text-slate-600">${row.no}</td>
                        <td class="p-2 text-xs font-bold text-slate-800">
                            <div>${row.namaSekolah}</div>
                            <div class="text-[10px] font-normal text-slate-500">Kepsek: ${row.namaKepsek}</div>
                        </td>
                        <td class="p-2 text-center text-xs font-semibold text-slate-700">${row.totalBerkas}</td>
                        <td class="p-2 text-center text-xs font-bold text-emerald-700">${row.disetujui}</td>
                        <td class="p-2 text-center text-xs font-medium text-amber-700">${row.perbaikan} / ${row.ditolak}</td>
                        <td class="p-2 text-center text-xs font-black ${row.persentase >= 80 ? 'text-emerald-700' : (row.persentase >= 60 ? 'text-blue-700' : 'text-rose-700')}">
                            ${row.persentase}%
                        </td>
                        <td class="p-2 text-center text-[10px] font-bold">
                            <span class="inline-block px-2 py-0.5 rounded border ${row.predikatBadge}">
                                ${row.predikat}
                            </span>
                        </td>
                    </tr>
                `;
            });
        }

        paper.innerHTML = `
            <!-- KOP SURAT RESMI -->
            <div class="border-b-4 border-double border-slate-900 pb-3 mb-5 text-center">
                <div class="flex items-center justify-between gap-4 mb-2">
                    <div class="w-16 h-16 flex-shrink-0 flex items-center justify-center">
                        <i class="fa-solid fa-graduation-cap text-3xl sm:text-4xl text-slate-800"></i>
                    </div>
                    <div class="flex-1 uppercase font-serif text-slate-900 leading-tight">
                        ${instansiHtml}
                        <div class="text-xs font-sans font-bold tracking-widest text-slate-700 mt-0.5">
                            KELOMPOK KERJA PENGAWAS SEKOLAH (KKPS)
                        </div>
                        <div class="text-[10px] font-sans font-normal text-slate-600 normal-case mt-1">
                            ${this.state.alamatDinas}
                        </div>
                    </div>
                    <div class="w-16 h-16 flex-shrink-0 flex items-center justify-center">
                        <i class="fa-solid fa-award text-3xl sm:text-4xl text-slate-800"></i>
                    </div>
                </div>
            </div>

            <!-- JUDUL DOKUMEN LAPORAN -->
            <div class="text-center mb-6 space-y-1">
                <h2 class="text-sm sm:text-base font-black font-serif uppercase tracking-wider text-slate-900">
                    LAPORAN HASIL PENGAWASAN MANAJERIAL & AKADEMIK
                </h2>
                <p class="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    SATUAN PENDIDIKAN BINAAN — ${this.state.periode.toUpperCase()}
                </p>
                <p class="text-[11px] font-mono font-medium text-slate-500">
                    Nomor: ${this.state.nomorSurat}
                </p>
            </div>

            <!-- BAGIAN I: IDENTITAS PENGAWAS PEMBINA -->
            <div class="mb-5 space-y-2 text-xs leading-relaxed text-slate-800">
                <div class="font-bold text-slate-900 uppercase tracking-wide border-b border-slate-300 pb-1">
                    I. IDENTITAS PENGAWAS PEMBINA
                </div>
                <table class="w-full text-xs">
                    <tbody>
                        <tr>
                            <td class="w-40 py-0.5 text-slate-600 font-medium">Nama Pengawas</td>
                            <td class="w-3 py-0.5">:</td>
                            <td class="py-0.5 font-bold text-slate-900">${this.state.namaPengawas}</td>
                        </tr>
                        <tr>
                            <td class="py-0.5 text-slate-600 font-medium">NIP</td>
                            <td class="py-0.5">:</td>
                            <td class="py-0.5 font-mono">${this.state.nipPengawas || "-"}</td>
                        </tr>
                        <tr>
                            <td class="py-0.5 text-slate-600 font-medium">Pangkat / Golongan</td>
                            <td class="py-0.5">:</td>
                            <td class="py-0.5">${this.state.pangkatPengawas || "-"}</td>
                        </tr>
                        <tr>
                            <td class="py-0.5 text-slate-600 font-medium">Jabatan Fungsional</td>
                            <td class="py-0.5">:</td>
                            <td class="py-0.5">${this.state.jabatanPengawas || "-"}</td>
                        </tr>
                        <tr>
                            <td class="py-0.5 text-slate-600 font-medium">Wilayah Binaan</td>
                            <td class="py-0.5">:</td>
                            <td class="py-0.5">${this.state.wilayahBinaan || "-"}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- BAGIAN II: REKAPITULASI DOKUMEN & KEPATUHAN SEKOLAH -->
            <div class="mb-5 space-y-3 text-xs text-slate-800">
                <div class="font-bold text-slate-900 uppercase tracking-wide border-b border-slate-300 pb-1 flex justify-between items-center">
                    <span>II. REKAPITULASI HASIL VERIFIKASI & KEPATUHAN SEKOLAH</span>
                    <span class="text-[11px] font-bold text-blue-700">Rata-rata: ${data.rataKepatuhan}% Kepatuhan</span>
                </div>

                <!-- KPI BOX MINI RESMI -->
                <div class="grid grid-cols-4 gap-2 text-center py-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <div>
                        <div class="text-[10px] text-slate-500 font-bold uppercase">Total Binaan</div>
                        <div class="text-sm font-black text-slate-800">${data.totalSekolah} Sekolah</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-slate-500 font-bold uppercase">Berkas Masuk</div>
                        <div class="text-sm font-black text-blue-800">${data.totalBerkas} Dokumen</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-slate-500 font-bold uppercase">Tervalidasi (OK)</div>
                        <div class="text-sm font-black text-emerald-800">${data.totalDisetujui} Berkas</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-slate-500 font-bold uppercase">Perlu Revisi</div>
                        <div class="text-sm font-black text-amber-800">${data.totalPerbaikan + data.totalDitolak} Berkas</div>
                    </div>
                </div>

                <!-- TABEL FORMAL DOKUMEN DINAS -->
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse border border-slate-300">
                        <thead>
                            <tr class="bg-slate-100 text-slate-800 font-bold text-[10px] uppercase border-b border-slate-300">
                                <th class="p-2 border-r border-slate-300 text-center w-8">No</th>
                                <th class="p-2 border-r border-slate-300">Satuan Pendidikan</th>
                                <th class="p-2 border-r border-slate-300 text-center">Masuk</th>
                                <th class="p-2 border-r border-slate-300 text-center">Disetujui</th>
                                <th class="p-2 border-r border-slate-300 text-center">Revisi / Tolak</th>
                                <th class="p-2 border-r border-slate-300 text-center">Kepatuhan</th>
                                <th class="p-2 text-center">Predikat Mutu</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- BAGIAN III: EVALUASI & TEMUAN PENGAWASAN -->
            <div class="mb-5 space-y-2 text-xs leading-relaxed text-slate-800">
                <div class="font-bold text-slate-900 uppercase tracking-wide border-b border-slate-300 pb-1">
                    III. EVALUASI MANAJERIAL & AKADEMIK SERTA TEMUAN LAPANGAN
                </div>
                <div class="whitespace-pre-line bg-slate-50/50 p-3 rounded border border-slate-200 text-justify text-slate-800 font-sans">
                    ${this.state.catatanTemuan || "- Belum ada catatan evaluasi temuan -"}
                </div>
            </div>

            <!-- BAGIAN IV: REKOMENDASI TINDAK LANJUT KEPADA KEPALA DINAS PENDIDIKAN -->
            <div class="mb-6 space-y-2 text-xs leading-relaxed text-slate-800">
                <div class="font-bold text-slate-900 uppercase tracking-wide border-b border-slate-300 pb-1">
                    IV. REKOMENDASI TINDAK LANJUT KEPADA KEPALA DINAS PENDIDIKAN
                </div>
                <div class="whitespace-pre-line bg-slate-50/50 p-3 rounded border border-slate-200 text-justify text-slate-800 font-sans">
                    ${this.state.rekomendasiDinas || "- Belum ada rekomendasi tindak lanjut -"}
                </div>
            </div>

            <!-- BAGIAN V: PENGESAHAN DAN TANDA TANGAN (KIRI: KADIS, KANAN: PENGAWAS) -->
            <div class="pt-4 border-t border-slate-200 text-xs text-slate-900">
                <div class="grid grid-cols-2 gap-8 text-center">
                    <!-- KOLOM KIRI: MENGETAHUI KEPALA DINAS -->
                    <div class="flex flex-col justify-between h-40">
                        <div>
                            <p class="text-slate-600 font-medium">Mengetahui,</p>
                            <p class="font-bold uppercase">${this.state.jabatanKadis}</p>
                        </div>
                        <div class="space-y-0.5">
                            <p class="font-bold underline text-slate-900">${this.state.namaKadis}</p>
                            <p class="text-[11px] text-slate-600 font-mono">NIP. ${this.state.nipKadis}</p>
                        </div>
                    </div>

                    <!-- KOLOM KANAN: PENGAWAS PEMBINA -->
                    <div class="flex flex-col justify-between h-40">
                        <div>
                            <p class="text-slate-600 font-medium">Ditetapkan di Tempat,</p>
                            <p class="font-medium text-slate-700">${tanggalFormal}</p>
                            <p class="font-bold uppercase mt-0.5">Pengawas Pembina,</p>
                        </div>
                        <div class="space-y-0.5">
                            <p class="font-bold underline text-slate-900">${this.state.namaPengawas}</p>
                            <p class="text-[11px] text-slate-600 font-mono">NIP. ${this.state.nipPengawas}</p>
                            <p class="text-[10px] text-slate-500">${this.state.pangkatPengawas}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Cetak dokumen laporan via browser print dialog (A4 Siap Cetak/PDF)
     */
    printReport() {
        this.renderPreview();
        window.print();
    },

    /**
     * Salin Ringkasan Eksekutif Laporan untuk Pesan WA / Nota Dinas Cepat
     */
    copySummary() {
        this.calculateReportMetrics();
        const data = this.state.calculatedData;
        if (!data) return;

        const tanggalFormal = this.formatTanggalFormal(this.state.tanggalSurat);

        let text = `*LAPORAN PENGAWAS KE DINAS PENDIDIKAN*\n`;
        text += `Nomor: ${this.state.nomorSurat}\n`;
        text += `Periode: ${this.state.periode}\n`;
        text += `Pengawas: ${this.state.namaPengawas} (NIP. ${this.state.nipPengawas})\n`;
        text += `Tanggal: ${tanggalFormal}\n`;
        text += `------------------------------------\n`;
        text += `*RINGKASAN KEPATUHAN & SUPERVISI:*\n`;
        text += `• Total Sekolah Binaan: ${data.totalSekolah} Sekolah\n`;
        text += `• Total Berkas Masuk: ${data.totalBerkas} Dokumen\n`;
        text += `• Berkas Disetujui: ${data.totalDisetujui}\n`;
        text += `• Berkas Perlu Revisi/Tolak: ${data.totalPerbaikan + data.totalDitolak}\n`;
        text += `• Rata-rata Kepatuhan Binaan: ${data.rataKepatuhan}%\n\n`;

        if (data.sangatBaikSchools.length > 0) {
            text += `*Sekolah Kepatuhan Sangat Baik (>=85%):*\n`;
            data.sangatBaikSchools.forEach(s => {
                text += `✓ ${s.namaSekolah}: ${s.persentase}%\n`;
            });
            text += `\n`;
        }

        if (data.perluPembinaanSchools.length > 0) {
            text += `*Sekolah Perlu Pendampingan Khusus (<60%):*\n`;
            data.perluPembinaanSchools.forEach(s => {
                text += `⚠ ${s.namaSekolah}: ${s.persentase}%\n`;
            });
            text += `\n`;
        }

        text += `*REKOMENDASI KEPADA KEPALA DINAS:*\n`;
        text += `${this.state.rekomendasiDinas.slice(0, 400)}...\n\n`;
        text += `_Disusun melalui Sistem Digital PantauSekolah_`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                if (typeof App !== "undefined" && typeof App.showToast === "function") {
                    App.showToast("Ringkasan eksekutif laporan dinas berhasil disalin ke clipboard!", "success");
                }
            }).catch(() => {
                this.fallbackCopyText(text);
            });
        } else {
            this.fallbackCopyText(text);
        }
    },

    /**
     * Fallback copy jika clipboard API dibatasi
     */
    fallbackCopyText(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand("copy");
            if (typeof App !== "undefined" && typeof App.showToast === "function") {
                App.showToast("Ringkasan berhasil disalin!", "success");
            }
        } catch (err) {
            alert("Gagal menyalin ringkasan otomatis.");
        }
        document.body.removeChild(textArea);
    },

    /**
     * Ekspor Data Rekapitulasi Sekolah Binaan ke CSV / Excel
     */
    exportCSV() {
        this.calculateReportMetrics();
        const data = this.state.calculatedData;
        if (!data || !data.schoolRows.length) {
            if (typeof App !== "undefined" && typeof App.showToast === "function") {
                App.showToast("Tidak ada data untuk diekspor ke CSV.", "error");
            }
            return;
        }

        let csv = "No,Satuan Pendidikan,Kepala Sekolah,Berkas Masuk,Disetujui,Perbaikan,Ditolak,Persentase Kepatuhan,Predikat Mutu\n";
        data.schoolRows.forEach(r => {
            const rowStr = [
                r.no,
                `"${r.namaSekolah.replace(/"/g, '""')}"`,
                `"${r.namaKepsek.replace(/"/g, '""')}"`,
                r.totalBerkas,
                r.disetujui,
                r.perbaikan,
                r.ditolak,
                `"${r.persentase}%"`,
                `"${r.predikat}"`
            ].join(",");
            csv += rowStr + "\n";
        });

        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cleanName = (this.state.periode || "Laporan-Dinas").replace(/[^a-zA-Z0-9-_]/g, "_");
        a.download = `Rekapitulasi_Pengawas_Dinas_${cleanName}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (typeof App !== "undefined" && typeof App.showToast === "function") {
            App.showToast("File CSV Rekapitulasi berhasil diunduh!", "success");
        }
    }
};

window.DinasReportManager = DinasReportManager;
