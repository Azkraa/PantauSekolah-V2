/**
 * ==========================================================================
 * PantauSekolah - Reports & Verification Module
 * ==========================================================================
 */

const ReportManager = {
    selectedSchoolState: "",
    selectedTypeState: "",
    activeSelectedId: "",
    activeTargetSheet: "",
    selectedReportIds: { kepsek: new Set(), guru: new Set(), 'folder-sekolah': new Set() },
    currentViewMode: { kepsek: "folder", guru: "folder" },
    summaryFilters: {
        kepsek: { status: "all", search: "", teacher: "all" },
        guru: { status: "all", search: "", teacher: "all" }
    },

    /**
     * Mengambil poin-poin penting / ringkasan dokumen.
     * Jika dokumen belum memiliki poin penting (misal data riwayat lama),
     * diturunkan otomatis secara cerdas dari kategori, jenis pelaporan, dan nama berkas.
     */
    getPoinPenting(item) {
        if (!item) return "-";
        if (item.poinPenting && typeof item.poinPenting === "string" && item.poinPenting.trim() && item.poinPenting.trim() !== "-") {
            return item.poinPenting.trim();
        }

        const str = ((item.kategori || "") + " " + (item.jenisPelaporan || "") + " " + (item.namaFile || item.filename || "")).toLowerCase();
        const points = [];

        if (str.includes("modul ajar") || str.includes("modul")) {
            points.push("Modul Ajar & Perangkat Pembelajaran Kurikulum Merdeka");
        } else if (str.includes("rpp") || str.includes("rencana pelaksanaan")) {
            points.push("Rencana Pelaksanaan Pembelajaran (RPP) Semester");
        }

        if (str.includes("asesmen") || str.includes("penilaian") || str.includes("evaluasi") || str.includes("ujian") || str.includes("soal")) {
            points.push("Instrumen & Rubrik Asesmen / Evaluasi Hasil Belajar");
        }

        if (str.includes("nilai") || str.includes("rekap") || str.includes("daftar nilai")) {
            points.push("Rekapitulasi Daftar Nilai & Ketuntasan Belajar Siswa");
        }

        if (str.includes("absen") || str.includes("presensi") || str.includes("daftar hadir")) {
            points.push("Presensi & Rekap Kehadiran Peserta Didik");
        }

        if (str.includes("jurnal") || str.includes("agenda")) {
            points.push("Jurnal Mengajar & Agenda KBM Harian");
        }

        if (str.includes("rkas") || str.includes("bosp") || str.includes("bos") || str.includes("anggaran") || str.includes("spj")) {
            points.push("Laporan Rencana Kegiatan & Anggaran Sekolah (RKAS / SPJ BOSP)");
        }

        if (str.includes("supervisi") || str.includes("kbm")) {
            points.push("Instrumen & Hasil Pelaksanaan Supervisi Guru/Tendik");
        }

        if (str.includes("manajerial") || str.includes("program kerja") || str.includes("rkt")) {
            points.push("Laporan Kinerja Manajerial & Rencana Kerja Tahunan (RKT)");
        }

        if (str.includes("kewirausahaan") || str.includes("kemitraan")) {
            points.push("Program Kewirausahaan & Laporan Kemitraan Sekolah");
        }

        if (points.length === 0) {
            const cat = item.kategori || item.jenisPelaporan || "Administrasi Sekolah";
            const fname = item.namaFile || item.filename || "Berkas Laporan";
            points.push(`Dokumen kelengkapan administrasi: ${cat}`);
            points.push(`Berkas terunggah: ${fname}`);
        }

        return points.map(p => `• ${p}`).join("\n");
    },

    /**
     * Beralih mode tampilan antara "Folder" dan "Poin Penting"
     */
    switchViewMode(type, mode) {
        if (!this.currentViewMode) this.currentViewMode = { kepsek: "folder", guru: "folder" };
        this.currentViewMode[type] = mode;

        const btnFolder = document.getElementById(`btn-view-mode-folder-${type}`);
        const btnSummary = document.getElementById(`btn-view-mode-summary-${type}`);
        const gridFolder = document.getElementById(`grid-subcards-${type}`);
        const containerSummary = document.getElementById(`summary-container-${type}`);

        if (mode === "summary") {
            if (btnFolder) {
                btnFolder.className = "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-slate-600 hover:text-slate-800 flex items-center gap-1.5 cursor-pointer";
            }
            if (btnSummary) {
                btnSummary.className = "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-slate-800 shadow-xs border border-[#E8E2D5] flex items-center gap-1.5 cursor-pointer";
            }
            if (gridFolder) gridFolder.classList.add("hidden");
            if (containerSummary) {
                containerSummary.classList.remove("hidden");
                this.renderSummaryPoinPenting(type);
            }
        } else {
            if (btnFolder) {
                btnFolder.className = "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-slate-800 shadow-xs border border-[#E8E2D5] flex items-center gap-1.5 cursor-pointer";
            }
            if (btnSummary) {
                btnSummary.className = "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-slate-600 hover:text-slate-800 flex items-center gap-1.5 cursor-pointer";
            }
            if (gridFolder) gridFolder.classList.remove("hidden");
            if (containerSummary) containerSummary.classList.add("hidden");
        }
        this.updateBadgeCounts();
    },

    /**
     * Handler perubahan filter pada tampilan Poin Penting
     */
    onSummaryFilterChange(type, key, value) {
        if (!this.summaryFilters) this.summaryFilters = {};
        if (!this.summaryFilters[type]) {
            this.summaryFilters[type] = { status: "all", search: "", teacher: "all" };
        }
        this.summaryFilters[type][key] = value;
        this.renderSummaryPoinPenting(type);
    },

    /**
     * Perbarui jumlah badge menunggu verifikasi pada tombol mode tampilan
     */
    updateBadgeCounts() {
        const targetSchool = (this.selectedSchoolState || "").toLowerCase();
        if (!targetSchool) return;

        // Kepsek pending
        const rawKepsek = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsKepsek) ? DashboardManager.cachedData.reportsKepsek : [];
        const pendingKepsek = rawKepsek.filter(x => (x.asalSekolah || "").toLowerCase() === targetSchool && x.status !== "Disetujui" && x.status !== "Perlu Perbaikan" && x.status !== "Ditolak").length;
        const badgeKepsek = document.getElementById("badge-pending-count-kepsek");
        if (badgeKepsek) {
            if (pendingKepsek > 0) {
                badgeKepsek.innerText = pendingKepsek;
                badgeKepsek.classList.remove("hidden");
            } else {
                badgeKepsek.classList.add("hidden");
            }
        }

        // Guru pending
        const rawGuru = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsGuru) ? DashboardManager.cachedData.reportsGuru : [];
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isGuru = currentUser && currentUser.role === "Guru";
        const pendingGuru = rawGuru.filter(x => {
            if ((x.asalSekolah || "").toLowerCase() !== targetSchool) return false;
            if (isGuru && (x.nama || "").toLowerCase() !== (currentUser.nama || "").toLowerCase()) return false;
            return x.status !== "Disetujui" && x.status !== "Perlu Perbaikan" && x.status !== "Ditolak";
        }).length;
        const badgeGuru = document.getElementById("badge-pending-count-guru");
        if (badgeGuru) {
            if (pendingGuru > 0) {
                badgeGuru.innerText = pendingGuru;
                badgeGuru.classList.remove("hidden");
            } else {
                badgeGuru.classList.add("hidden");
            }
        }
    },

    /**
     * Render Tampilan Rekapitulasi & Poin Penting Dokumen (Executive Summary Checklist)
     */
    renderSummaryPoinPenting(type) {
        const container = document.getElementById(`summary-container-${type}`);
        if (!container) return;

        const schoolName = this.selectedSchoolState || "";
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const currentRole = currentUser ? currentUser.role : "";
        const isPengawas = currentRole === "Pengawas";
        const isKepsek = currentRole === "Kepala Sekolah" || currentRole === "Kepsek";
        const isGuru = currentRole === "Guru";

        const rawData = (type === "kepsek") 
            ? ((typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsKepsek) ? DashboardManager.cachedData.reportsKepsek : [])
            : ((typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsGuru) ? DashboardManager.cachedData.reportsGuru : []);

        const targetSheet = (type === "kepsek") ? "Laporan_Kepsek" : "Laporan_Guru";

        // Filter dokumen berdasarkan sekolah
        let schoolReports = rawData.filter(x => (x.asalSekolah || "").toLowerCase() === schoolName.toLowerCase());

        // Jika Guru membuka tab guru, hanya tampilkan laporannya sendiri
        if (type === "guru" && isGuru) {
            schoolReports = schoolReports.filter(x => (x.nama || "").trim().toLowerCase() === (currentUser.nama || "").trim().toLowerCase());
        }

        // Metrik kuantitatif dokumen
        const totalCount = schoolReports.length;
        const pendingCount = schoolReports.filter(x => x.status !== "Disetujui" && x.status !== "Perlu Perbaikan" && x.status !== "Ditolak").length;
        const approvedCount = schoolReports.filter(x => x.status === "Disetujui").length;
        const revisionCount = schoolReports.filter(x => x.status === "Perlu Perbaikan" || x.status === "Ditolak").length;

        // Ambil filter yang aktif
        if (!this.summaryFilters) this.summaryFilters = {};
        if (!this.summaryFilters[type]) {
            this.summaryFilters[type] = { status: "all", search: "", teacher: "all" };
        }
        const filter = this.summaryFilters[type];

        // Daftar guru unik untuk dropdown filter (khusus tampilan guru)
        const uniqueTeachers = Array.from(new Set(schoolReports.map(x => (x.nama || "").trim()).filter(Boolean))).sort();

        // Terapkan filter
        const displayList = schoolReports.filter(item => {
            // Status
            if (filter.status === "menunggu") {
                if (item.status === "Disetujui" || item.status === "Perlu Perbaikan" || item.status === "Ditolak") return false;
            } else if (filter.status === "disetujui") {
                if (item.status !== "Disetujui") return false;
            } else if (filter.status === "revisi") {
                if (item.status !== "Perlu Perbaikan" && item.status !== "Ditolak") return false;
            }

            // Guru
            if (type === "guru" && filter.teacher && filter.teacher !== "all") {
                if ((item.nama || "").trim().toLowerCase() !== filter.teacher.trim().toLowerCase()) return false;
            }

            // Kata kunci pencarian
            if (filter.search && filter.search.trim()) {
                const q = filter.search.toLowerCase().trim();
                const poin = this.getPoinPenting(item).toLowerCase();
                const matched = (item.nama || "").toLowerCase().includes(q) ||
                                (item.kategori || "").toLowerCase().includes(q) ||
                                (item.jenisPelaporan || "").toLowerCase().includes(q) ||
                                (item.namaFile || item.filename || "").toLowerCase().includes(q) ||
                                (item.catatan || "").toLowerCase().includes(q) ||
                                (item.id || "").toLowerCase().includes(q) ||
                                poin.includes(q);
                if (!matched) return false;
            }

            return true;
        });

        let html = `
            <!-- Kartu KPI Ringkasan Status Dokumen -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
                <div class="bg-white p-3 sm:p-4 rounded-xl border border-[#E8E2D5] shadow-2xs">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Berkas</p>
                    <h4 class="text-lg sm:text-xl font-black text-slate-800 font-mono mt-0.5">${totalCount}</h4>
                </div>
                <div class="bg-amber-50/70 p-3 sm:p-4 rounded-xl border border-amber-200/80 shadow-2xs">
                    <p class="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Menunggu</p>
                    <h4 class="text-lg sm:text-xl font-black text-amber-800 font-mono mt-0.5">${pendingCount}</h4>
                </div>
                <div class="bg-emerald-50/70 p-3 sm:p-4 rounded-xl border border-emerald-200/80 shadow-2xs">
                    <p class="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Disetujui</p>
                    <h4 class="text-lg sm:text-xl font-black text-emerald-800 font-mono mt-0.5">${approvedCount}</h4>
                </div>
                <div class="bg-rose-50/70 p-3 sm:p-4 rounded-xl border border-rose-200/80 shadow-2xs">
                    <p class="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Perlu Revisi</p>
                    <h4 class="text-lg sm:text-xl font-black text-rose-800 font-mono mt-0.5">${revisionCount}</h4>
                </div>
            </div>

            <!-- Toolbar Pencarian & Filter Cepat -->
            <div class="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#E8E2D5] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div class="flex items-center gap-2 flex-1 flex-wrap sm:flex-nowrap">
                    <!-- Search Input -->
                    <div class="relative flex-1 min-w-[180px]">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
                        <input type="text"
                            placeholder="Cari poin penting, berkas, atau pengirim..."
                            value="${filter.search || ''}"
                            oninput="ReportManager.onSummaryFilterChange('${type}', 'search', this.value)"
                            class="w-full pl-8 pr-3 py-2 bg-[#FAF8F5] border border-[#DCD5C7] rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500">
                    </div>

                    <!-- Dropdown Filter Status -->
                    <select onchange="ReportManager.onSummaryFilterChange('${type}', 'status', this.value)"
                        class="px-3 py-2 bg-[#FAF8F5] border border-[#DCD5C7] rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500">
                        <option value="all" ${filter.status === 'all' ? 'selected' : ''}>Semua Status</option>
                        <option value="menunggu" ${filter.status === 'menunggu' ? 'selected' : ''}>⏳ Menunggu (${pendingCount})</option>
                        <option value="disetujui" ${filter.status === 'disetujui' ? 'selected' : ''}>✅ Disetujui (${approvedCount})</option>
                        <option value="revisi" ${filter.status === 'revisi' ? 'selected' : ''}>⚠️ Perlu Revisi (${revisionCount})</option>
                    </select>

                    <!-- Dropdown Filter Guru (Khusus tab guru untuk Pengawas & Kepsek) -->
                    ${(type === "guru" && !isGuru && uniqueTeachers.length > 0) ? `
                        <select onchange="ReportManager.onSummaryFilterChange('${type}', 'teacher', this.value)"
                            class="px-3 py-2 bg-[#FAF8F5] border border-[#DCD5C7] rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 max-w-[160px] truncate">
                            <option value="all" ${filter.teacher === 'all' ? 'selected' : ''}>Semua Guru (${uniqueTeachers.length})</option>
                            ${uniqueTeachers.map(t => `<option value="${t}" ${filter.teacher === t ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    ` : ''}
                </div>

                <!-- Tombol Batch Approve (Persetujuan Massal 1-Klik) -->
                ${(isPengawas || isKepsek) ? `
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button onclick="ReportManager.batchApproveAll('${type}')"
                            ${pendingCount === 0 ? 'disabled' : ''}
                            class="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${pendingCount > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 cursor-pointer' : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'}">
                            <i class="fa-solid fa-check-double text-xs"></i>
                            <span>Setujui Semua Menunggu (${pendingCount})</span>
                        </button>
                    </div>
                ` : ''}
            </div>

            <!-- Daftar Kartu Poin Penting Dokumen -->
            <div class="space-y-3.5">
        `;

        if (displayList.length === 0) {
            html += `
                <div class="bg-white p-8 sm:p-12 rounded-2xl border border-[#E8E2D5] text-center space-y-3">
                    <div class="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto text-xl">
                        <i class="fa-solid fa-list-check"></i>
                    </div>
                    <p class="font-bold text-sm text-slate-700">Tidak ada berkas yang sesuai kriteria</p>
                    <p class="text-xs text-slate-400 max-w-sm mx-auto">Coba ubah kata kunci pencarian atau sesuaikan opsi filter status di atas.</p>
                </div>
            `;
        } else {
            displayList.forEach(item => {
                const poin = this.getPoinPenting(item);
                const isWaiting = item.status !== "Disetujui" && item.status !== "Perlu Perbaikan" && item.status !== "Ditolak";
                const isOwner = currentUser && (item.nama || "").trim().toLowerCase() === (currentUser.nama || "").trim().toLowerCase();
                const canVerify = isPengawas || isKepsek;
                const canDelete = isPengawas || isOwner || (isKepsek && (item.asalSekolah || "").toLowerCase() === (currentUser.asal_sekolah || "").toLowerCase());
                const fileIcon = this.getFileIcon(item.fileUrl, item.namaFile || item.filename, item.kategori);
                const fname = item.namaFile || item.filename || item.kategori || "Berkas Laporan";
                const safeName = (item.nama || "").replace(/'/g, "\\'");

                html += `
                    <div class="bg-white p-4 sm:p-5 rounded-2xl border border-[#E8E2D5] shadow-xs space-y-3 hover:border-blue-300 transition-all">
                        <!-- Baris Atas: Pengunggah, Kategori, Status & Tanggal -->
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F0EBE1] pb-2.5">
                            <div class="flex items-center gap-2.5 flex-wrap">
                                <span class="font-bold text-slate-800 text-xs sm:text-sm">${item.nama}</span>
                                <span class="text-[10px] text-slate-400 font-mono">• ${item.tanggal}</span>
                                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                    <i class="fa-solid fa-folder text-[9px] mr-1"></i>${item.jenisPelaporan || item.kategori}
                                </span>
                            </div>
                            <div class="flex items-center gap-2 self-start sm:self-auto">
                                ${DashboardManager.getStatusBadge(item.status)}
                            </div>
                        </div>

                        <!-- Kotak Sorotan Poin-Poin Penting Dokumen -->
                        <div class="bg-amber-50/60 border border-amber-200/90 rounded-xl p-3 sm:p-3.5 space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="font-bold text-amber-950 text-xs flex items-center gap-1.5 uppercase tracking-wide">
                                    <i class="fa-solid fa-list-check text-amber-600"></i> Poin-Poin Penting Dokumen:
                                </span>
                                ${isPengawas ? `
                                    <a href="${item.fileUrl}" target="_blank"
                                        class="text-blue-600 hover:text-blue-800 font-bold hover:underline text-xs flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs transition-colors">
                                        ${fileIcon} <span>Buka File Drive</span> <i class="fa-solid fa-arrow-up-right-from-square text-[9px] ml-0.5"></i>
                                    </a>
                                ` : `
                                    <button onclick="ReportManager.openModalVerifikasi('${item.id}', '${safeName}', '${item.status}', '${(item.catatan || '').replace(/'/g, "\\'")}', '${targetSheet}')"
                                        class="text-slate-700 hover:text-blue-700 font-bold text-xs flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-[#DCD5C7] hover:border-blue-300 shadow-2xs transition-colors cursor-pointer">
                                        ${fileIcon} <span>Pratinjau Berkas</span> <i class="fa-solid fa-eye text-[10px] ml-0.5 text-blue-600"></i>
                                    </button>
                                `}
                            </div>

                            <div class="text-slate-800 text-xs font-medium leading-relaxed whitespace-pre-line pl-1">
                                ${poin}
                            </div>

                            <div class="pt-2 border-t border-amber-200/50 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                                <span class="truncate max-w-[260px] sm:max-w-md"><i class="fa-solid fa-paperclip text-slate-400 mr-1"></i>${fname}</span>
                                <span class="font-mono text-slate-400">ID: ${item.id}</span>
                            </div>
                        </div>

                        <!-- Catatan Pembinaan / Evaluasi Jika Ada -->
                        ${(item.catatan && item.catatan !== "-" && item.catatan !== "Belum ada catatan") ? `
                            <div class="p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-start gap-2">
                                <i class="fa-solid fa-comment-dots text-slate-400 text-xs mt-0.5"></i>
                                <div class="min-w-0 flex-1">
                                    <span class="font-bold text-slate-600 text-[11px]">Catatan Evaluasi / Pembinaan:</span>
                                    <p class="italic text-slate-700 font-medium mt-0.5">"${item.catatan}"</p>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Baris Aksi Cepat Bawah -->
                        <div class="flex items-center justify-between gap-2 pt-1 flex-wrap">
                            <div class="text-[11px] text-slate-400">
                                ${isWaiting ? '<span class="text-amber-600 font-semibold"><i class="fa-regular fa-clock mr-1"></i>Menunggu evaluasi & persetujuan</span>' : '<span class="text-emerald-700 font-semibold"><i class="fa-solid fa-circle-check mr-1"></i>Telah dievaluasi</span>'}
                            </div>

                            <div class="flex items-center gap-1.5">
                                ${canVerify ? (
                                    isWaiting ? `
                                        <button onclick="ReportManager.quickApproveReport('${item.id}', '${safeName}', '${targetSheet}')"
                                            class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-2xs flex items-center gap-1 cursor-pointer">
                                            <i class="fa-solid fa-check"></i> Setujui Cepat
                                        </button>
                                        <button onclick="ReportManager.openModalVerifikasi('${item.id}', '${safeName}', '${item.status}', '${(item.catatan || '').replace(/'/g, "\\'")}', '${targetSheet}')"
                                            class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-2xs flex items-center gap-1 cursor-pointer">
                                            <i class="fa-solid fa-file-circle-check"></i> Beri Catatan
                                        </button>
                                    ` : `
                                        <button onclick="ReportManager.openModalVerifikasi('${item.id}', '${safeName}', '${item.status}', '${(item.catatan || '').replace(/'/g, "\\'")}', '${targetSheet}')"
                                            class="bg-[#F0EBE1] hover:bg-[#E5DFD3] text-slate-700 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors border border-[#E0D7C5] flex items-center gap-1 cursor-pointer">
                                            <i class="fa-solid fa-pen-to-square"></i> Ubah Status
                                        </button>
                                    `
                                ) : ''}

                                ${canDelete ? `
                                    <button onclick="ReportManager.confirmDeleteReport('${item.id}', '${safeName}', '${targetSheet}')"
                                        title="Hapus Laporan"
                                        class="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2.5 py-1.5 rounded-xl border border-rose-200 text-xs transition-colors cursor-pointer">
                                        <i class="fa-solid fa-trash-can"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        container.innerHTML = html;
    },

    /**
     * Persetujuan Cepat 1-Klik untuk satu dokumen
     */
    quickApproveReport(idLaporan, namaPengirim, targetSheet) {
        if (typeof LiveSync !== "undefined") {
            LiveSync.optimisticVerifyReport(idLaporan, "Disetujui", "Disetujui melalui verifikasi cepat poin penting", targetSheet);
            const type = (targetSheet === "Laporan_Kepsek") ? "kepsek" : "guru";
            this.renderSummaryPoinPenting(type);
            this.updateBadgeCounts();
        }
    },

    /**
     * Persetujuan Massal (Batch Approve All) untuk semua dokumen yang menunggu di sekolah ini
     */
    async batchApproveAll(type) {
        const rawData = (type === "kepsek") 
            ? ((typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsKepsek) ? DashboardManager.cachedData.reportsKepsek : [])
            : ((typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsGuru) ? DashboardManager.cachedData.reportsGuru : []);

        const targetSheet = (type === "kepsek") ? "Laporan_Kepsek" : "Laporan_Guru";
        const schoolReports = rawData.filter(x => (x.asalSekolah || "").toLowerCase() === (this.selectedSchoolState || "").toLowerCase());
        const pendingList = schoolReports.filter(x => x.status !== "Disetujui" && x.status !== "Perlu Perbaikan" && x.status !== "Ditolak");

        if (pendingList.length === 0) {
            App.showToast("Semua dokumen di sekolah ini sudah diverifikasi!", "info");
            return;
        }

        const confirmed = await App.confirmModal({
            title: `Setujui Semua Berkas (${pendingList.length} Berkas)`,
            message: `Apakah Anda yakin ingin menyetujui sekaligus <strong>${pendingList.length} berkas</strong> yang sedang menunggu verifikasi di <strong>${this.selectedSchoolState}</strong>?`,
            subMessage: "Status seluruh berkas akan diubah menjadi 'Disetujui' secara otomatis tanpa perlu membuka berkas satu per satu.",
            confirmText: "Ya, Setujui Semua",
            confirmType: "primary",
            icon: "fa-solid fa-check-double"
        });

        if (confirmed) {
            pendingList.forEach(item => {
                if (typeof LiveSync !== "undefined") {
                    LiveSync.optimisticVerifyReport(item.id, "Disetujui", "Disetujui sekaligus melalui verifikasi cepat poin penting", targetSheet);
                }
            });
            App.showToast(`Berhasil menyetujui ${pendingList.length} berkas secara instan!`, "success");
            this.renderSummaryPoinPenting(type);
            this.updateBadgeCounts();
        }
    },

    /**
     * Render rekomendasi / chip saran cepat untuk poin penting pada form upload
     */
    renderPoinPentingSuggestions() {
        const container = document.getElementById("poin-penting-suggestions");
        if (!container) return;

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isKepsek = currentUser && (currentUser.role === "Kepala Sekolah" || currentUser.role === "Kepsek");

        const suggestionsKepsek = [
            "Laporan Manajerial & Supervisi KBM Lengkap",
            "SPJ & Realisasi BOSP Tahap 1 Sesuai Juknis",
            "Evaluasi Diri Sekolah (EDS) & RKT Terlampir",
            "Program Kerja Tahunan & Kalender Pendidikan",
            "Laporan Kewirausahaan & Kemitraan DU/DI"
        ];

        const suggestionsGuru = [
            "Modul Ajar Bab 1-3 Lengkap Kurikulum Merdeka",
            "Instrumen & Rubrik Asesmen Formatif / Sumatif",
            "Daftar Nilai & Rekap Ketuntasan Belajar Siswa",
            "Jurnal Harian Mengajar & Presensi Kehadiran",
            "Laporan Remedial & Pengayaan Peserta Didik"
        ];

        const list = isKepsek ? suggestionsKepsek : suggestionsGuru;

        container.innerHTML = list.map(item => {
            const safeText = item.replace(/'/g, "\\'");
            return `
                <button type="button" onclick="ReportManager.insertPoinSuggestion('${safeText}')"
                    class="px-2.5 py-1 bg-[#FAF8F5] hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-[#DCD5C7] hover:border-blue-300 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer">
                    <i class="fa-solid fa-plus text-[9px] text-blue-500"></i> ${item}
                </button>
            `;
        }).join("");
    },

    /**
     * Masukkan chip saran ke dalam textarea poin penting laporan
     */
    insertPoinSuggestion(text) {
        const textarea = document.getElementById("poin-penting-laporan");
        if (!textarea) return;
        const current = textarea.value.trim();
        if (current) {
            textarea.value = current + ", " + text;
        } else {
            textarea.value = text;
        }
        textarea.focus();
    },

    /**
     * Memeriksa apakah folder sesuai untuk sekolah target (mencegah folder sekolah lain ikut muncul)
     */
    isFolderForSchool(f, targetSchool) {
        if (!targetSchool || !f) return false;
        const fSchool = (f.namaSekolah || "").trim().toLowerCase();
        const tSchool = targetSchool.trim().toLowerCase();

        // Folder tanpa asal sekolah TIDAK BOLEH bocor ke sekolah manapun
        if (!fSchool) return false;

        // Folder serentak / all schools hanya jika secara eksplisit bertarget 'all' atau 'semua'
        if (fSchool === "semua" || fSchool === "semua sekolah" || fSchool === "all" || f.targetType === "all") {
            return true;
        }

        return fSchool === tSchool;
    },

    /**
     * Render kartu folder sekolah (Langkah 1)
     */
    renderSchoolFolderCards(type) {
        this.selectedTypeState = "";
        const grid = document.getElementById(`grid-cards-${type}`);
        if (!grid) return;

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isPengawas = currentUser && currentUser.role === "Pengawas";
        const userSchool = currentUser ? (currentUser.asal_sekolah || "").trim() : "";

        let data = (type === 'kepsek') ? DashboardManager.cachedData.reportsKepsek : DashboardManager.cachedData.reportsGuru;
        let schoolsMeta = DashboardManager.cachedData.schools || [];

        // HAK AKSES SEKOLAH: Kepala Sekolah & Guru HANYA melihat sekolahnya sendiri!
        if (!isPengawas && userSchool) {
            schoolsMeta = schoolsMeta.filter(s => s.nama.toLowerCase() === userSchool.toLowerCase());
            if (schoolsMeta.length === 0) {
                schoolsMeta = [{
                    id: "SCH-MY",
                    nama: userSchool,
                    driveFolderUrl: currentUser.drive_url || "",
                    driveUrl: currentUser.drive_url || ""
                }];
            }
            data = data.filter(d => (d.asalSekolah || "").toLowerCase() === userSchool.toLowerCase());
        }

        if (data.length === 0 && schoolsMeta.length === 0) {
            grid.innerHTML = `<div class="col-span-full bg-white p-8 rounded-2xl text-center border text-slate-400 text-xs font-medium">Belum ada laporan atau sekolah terdaftar.</div>`;
            return;
        }

        // Kelompokkan data per sekolah
        let grouped = {};
        schoolsMeta.forEach(s => {
            if (!grouped[s.nama]) grouped[s.nama] = { list: [], driveUrl: s.driveUrl || s.driveFolderUrl || "" };
        });

        data.forEach(item => {
            const school = (item.asalSekolah || userSchool || "").trim();
            if (!school) return;
            if (!isPengawas && userSchool && school.toLowerCase() !== userSchool.toLowerCase()) {
                return; // Lewati sekolah lain
            }
            if (!grouped[school]) grouped[school] = { list: [], driveUrl: "" };
            grouped[school].list.push(item);
        });

        grid.innerHTML = "";
        Object.keys(grouped).forEach(schoolName => {
            const entry = grouped[schoolName];
            const list = entry.list;
            const total = list.length;
            const driveUrl = entry.driveUrl;

            // Evaluasi status yang akurat berdasarkan isi laporan
            let statusBadge = "";
            if (total === 0) {
                statusBadge = `<span class="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-md text-[10px] border border-slate-200">Belum Ada Laporan</span>`;
            } else {
                const menunggu = list.filter(x => x.status !== "Disetujui" && x.status !== "Perlu Perbaikan" && x.status !== "Ditolak").length;
                const revisi = list.filter(x => x.status === "Perlu Perbaikan" || x.status === "Ditolak").length;

                if (menunggu > 0) {
                    statusBadge = `<span class="bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-md text-[10px] border border-amber-200">${menunggu} Menunggu</span>`;
                } else if (revisi > 0) {
                    statusBadge = `<span class="bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-md text-[10px] border border-rose-200">${revisi} Perlu Revisi</span>`;
                } else {
                    statusBadge = `<span class="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-md text-[10px] border border-emerald-200">Semua Disetujui</span>`;
                }
            }

            grid.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border border-[#E8E2D5] shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between card-hover">
                    <div class="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full -mr-8 -mt-8 pointer-events-none"></div>

                    <div onclick="ReportManager.openSchoolFolder('${type}', '${schoolName}')">
                        <div class="flex items-center gap-3.5 mb-3.5">
                            <div class="w-11 h-11 bg-blue-50 border border-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold group-hover:bg-blue-600 group-hover:text-white transition-all flex-shrink-0">
                                <i class="fa-solid fa-folder-closed"></i>
                            </div>
                            <div class="min-w-0">
                                <h4 class="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors truncate">${schoolName}</h4>
                                <p class="text-[11px] text-slate-400 font-medium">${total} Berkas Laporan</p>
                            </div>
                        </div>

                        <div class="pt-2.5 border-t border-[#F0EBE1] flex items-center justify-between text-xs">
                            <span class="text-slate-500 text-[11px] font-medium">Status</span>
                            ${statusBadge}
                        </div>
                    </div>

                    ${driveUrl ? `
                        <div class="mt-3 pt-2.5 border-t border-[#F0EBE1] flex items-center justify-between">
                            <span class="text-[10px] text-slate-400 font-medium">Google Drive:</span>
                            <a href="${driveUrl}" target="_blank" onclick="event.stopPropagation()" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1">
                                <i class="fa-brands fa-google-drive"></i> Buka Folder
                            </a>
                        </div>
                    ` : ''}
                </div>
            `;
        });
    },

    /**
     * Buka Langkah 2: Pilihan Subfolder Mingguan / Daring / Custom
     */
    openSchoolFolder(type, schoolName) {
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isPengawas = currentUser && currentUser.role === "Pengawas";
        const isGuru = currentUser && currentUser.role === "Guru";

        const schoolsMeta = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.schools) 
            ? DashboardManager.cachedData.schools 
            : [];

        if (isPengawas) {
            if (!schoolsMeta || schoolsMeta.length === 0) {
                try {
                    localStorage.removeItem("pantausekolah_selected_school");
                } catch (e) {}
                if (type === 'kepsek') this.backToFolderKepsek();
                else this.backToFolderGuru();
                return;
            }
            const exists = schoolsMeta.some(s => (s.nama || "").toLowerCase() === (schoolName || "").toLowerCase());
            if (!exists) {
                try {
                    localStorage.removeItem("pantausekolah_selected_school");
                } catch (e) {}
                if (type === 'kepsek') this.backToFolderKepsek();
                else this.backToFolderGuru();
                return;
            }
        }

        this.selectedSchoolState = schoolName;
        this.selectedTypeState = ""; // Reset pilihan subfolder/tabel agar kembali ke tampilan kartu folder

        document.getElementById(`cards-container-${type}`).classList.add("hidden");
        document.getElementById(`subcards-container-${type}`).classList.remove("hidden");
        document.getElementById(`table-container-${type}`).classList.add("hidden");

        document.getElementById(`selected-school-title-${type}`).innerText = schoolName;

        if (isPengawas) {
            try {
                localStorage.setItem("pantausekolah_selected_school", schoolName);
            } catch (e) {}
        }

        const btnBack = document.getElementById(`btn-back-folder-${type}`);
        if (btnBack) {
            if (!isPengawas) {
                btnBack.classList.add("hidden");
            } else {
                btnBack.classList.remove("hidden");
            }
        }

        const btnAddFolder = document.getElementById(`btn-add-folder-${type}`);
        if (btnAddFolder) {
            if (isGuru) {
                btnAddFolder.classList.add("hidden");
            } else {
                btnAddFolder.classList.remove("hidden");
            }
        }

        const rawData = (type === 'kepsek') ? DashboardManager.cachedData.reportsKepsek : DashboardManager.cachedData.reportsGuru;
        const schoolReports = rawData.filter(x => (x.asalSekolah || "").toLowerCase() === schoolName.toLowerCase());

        if (type === 'guru') {
            this.renderSubCardsGuru(schoolName);
        } else {
            this.renderSubCardsKepsek(schoolName);
        }
        this.updateBadgeCounts();
        this.switchViewMode(type, (this.currentViewMode && this.currentViewMode[type]) ? this.currentViewMode[type] : 'folder');
    },

    /**
     * Render Subcards Kepala Sekolah Secara Dinamis (1 Folder Utama + Custom Folders)
     */
    renderSubCardsKepsek(schoolName) {
        const grid = document.getElementById("grid-subcards-kepsek");
        if (!grid) return;

        const targetSchool = (schoolName || this.selectedSchoolState || "").trim();
        const safeTargetSchool = targetSchool.replace(/'/g, "\\'");
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isPengawas = currentUser && currentUser.role === "Pengawas";

        const schoolsMeta = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.schools) ? DashboardManager.cachedData.schools : [];
        const schoolObj = schoolsMeta.find(s => (s.nama || "").toLowerCase() === targetSchool.toLowerCase());
        const schoolDriveUrl = schoolObj ? (schoolObj.driveUrl || schoolObj.driveFolderUrl || "") : (currentUser && (currentUser.asal_sekolah || "").toLowerCase() === targetSchool.toLowerCase() ? (currentUser.drive_url || "") : "");

        const rawData = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsKepsek) ? DashboardManager.cachedData.reportsKepsek : [];
        const schoolReports = rawData.filter(x => (x.asalSekolah || "").toLowerCase() === targetSchool.toLowerCase());

        const allFolders = (typeof LiveSync !== "undefined" && LiveSync.state.folders) 
            ? LiveSync.state.folders 
            : (typeof DriveManager !== "undefined" && DriveManager.cachedFolders ? DriveManager.cachedFolders : []);

        const hiddenList = (typeof LiveSync !== "undefined" && LiveSync.state.hiddenDefaultFolders) 
            ? LiveSync.state.hiddenDefaultFolders 
            : [];
        let localHidden = [];
        try {
            localHidden = JSON.parse(localStorage.getItem("pantausekolah_hidden_default_folders") || "[]");
        } catch (e) {}

        const isDeletedInFolders = (type) => {
            const lowerType = type.toLowerCase();
            return allFolders.some(f => {
                if (!f.namaFolder) return false;
                const fn = f.namaFolder.toLowerCase();
                if (!fn.includes(`__deleted__:${lowerType}`)) return false;
                const fSchool = (f.namaSekolah || "").trim().toLowerCase();
                const tSchool = targetSchool.trim().toLowerCase();
                return f.targetType === "all" || !fSchool || fSchool === tSchool;
            });
        };

        const customFolders = allFolders.filter(f => {
            if (!f.namaFolder || f.namaFolder.startsWith("__DELETED__:") || (f.id && f.id.toString().startsWith("DEL-"))) return false;
            return ReportManager.isFolderForSchool(f, targetSchool) && f.subCategory === "kepsek";
        });

        // Deduplikasi folder berdasarkan nama folder agar tidak muncul ganda
        const seenNames = new Set();
        const uniqueCustomFolders = [];
        for (const f of customFolders) {
            const key = (f.namaFolder || "").trim().toLowerCase();
            if (!seenNames.has(key)) {
                seenNames.add(key);
                uniqueCustomFolders.push(f);
            }
        }

        let html = "";

        // Folder Kepala Sekolah yang Dibuat Pengawas (Tidak ada folder hardcoded default)
        uniqueCustomFolders.forEach(f => {
            const countCustom = schoolReports.filter(x => {
                const repType = (x.jenisPelaporan || x.kategori || '').toLowerCase();
                return repType.includes(f.namaFolder.toLowerCase());
            }).length;

            const safeFolderName = f.namaFolder.replace(/'/g, "\\'");

            html += `
                <div onclick="ReportManager.openSubFolderTable('kepsek', '${safeFolderName}')"
                    class="bg-white p-5 sm:p-6 rounded-2xl border border-[#E8E2D5] shadow-xs hover:shadow-md hover:border-amber-500 transition-all cursor-pointer group flex flex-col justify-between card-hover overflow-hidden">
                    <div class="flex items-start justify-between gap-3 mb-2.5 min-w-0 w-full">
                        <div class="flex items-start gap-3.5 min-w-0 flex-1">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-bold group-hover:bg-amber-600 group-hover:text-white transition-all flex-shrink-0">
                                <i class="fa-solid fa-folder-open"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <h4 class="font-bold text-slate-800 text-sm sm:text-base group-hover:text-amber-600 transition-colors leading-snug break-words line-clamp-2" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;" title="${f.namaFolder}">${f.namaFolder}</h4>
                                <p class="text-[11px] sm:text-xs text-slate-400 mt-0.5">Folder Dokumen Kepala Sekolah</p>
                                <span class="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md border border-amber-200">${countCustom} Laporan</span>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-amber-600 text-xs sm:text-sm flex-shrink-0 mt-1"></i>
                    </div>
                    <div class="pt-2.5 border-t border-[#F0EBE1] flex items-center justify-between text-xs mt-1" onclick="event.stopPropagation()">
                        ${(isPengawas && f.driveFolderUrl) ? `
                            <a href="${f.driveFolderUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                <i class="fa-brands fa-google-drive"></i> Buka Drive
                            </a>
                        ` : '<span class="text-[10px] text-slate-400 font-medium flex items-center gap-1"><i class="fa-solid fa-folder-closed text-slate-300"></i> Folder Aplikasi</span>'}
                        ${isPengawas ? `
                            <button onclick="ReportManager.confirmDeleteGuruFolder('${f.id}', '${safeFolderName}', '${safeTargetSchool}')" title="Hapus Folder" class="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-200 transition-colors">
                                <i class="fa-solid fa-trash-can text-[11px]"></i> Hapus
                            </button>
                        ` : `
                            <span class="text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1.5">
                                <i class="fa-solid fa-lock text-amber-600 text-[10px]"></i> Terkunci • Arsip
                            </span>
                        `}
                    </div>
                </div>
            `;
        });

        if (!html.trim()) {
            html = `
                <div class="col-span-full bg-white p-7 rounded-2xl border border-[#E8E2D5] text-center text-slate-400 space-y-2">
                    <i class="fa-solid fa-folder-closed text-2xl text-amber-300"></i>
                    <p class="font-bold text-xs text-slate-600">Belum Ada Folder Laporan Kepala Sekolah</p>
                    ${isPengawas ? '<p class="text-[11px] text-slate-400">Klik tombol \'+ Tambah Folder Kepala Sekolah\' di atas untuk membuat folder baru.</p>' : '<p class="text-[11px] text-slate-400">Folder dikelola oleh Pengawas Sekolah.</p>'}
                </div>
            `;
        }

        grid.innerHTML = html;
        this.updateBadgeCounts();
    },

    /**
     * Render Subcards Guru Secara Dinamis (Mingguan, Daring + Custom Folders)
     */
    renderSubCardsGuru(schoolName) {
        const grid = document.getElementById("grid-subcards-guru");
        if (!grid) return;

        const targetSchool = (schoolName || this.selectedSchoolState || "").trim();
        const safeTargetSchool = targetSchool.replace(/'/g, "\\'");
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isPengawas = currentUser && currentUser.role === "Pengawas";
        const isKepsek = currentUser && (currentUser.role === "Kepala Sekolah" || currentUser.role === "Kepsek");
        const isGuru = currentUser && currentUser.role === "Guru";

        const schoolsMeta = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.schools) ? DashboardManager.cachedData.schools : [];
        const schoolObj = schoolsMeta.find(s => (s.nama || "").toLowerCase() === targetSchool.toLowerCase());
        const schoolDriveUrl = schoolObj ? (schoolObj.driveUrl || schoolObj.driveFolderUrl || "") : (currentUser && (currentUser.asal_sekolah || "").toLowerCase() === targetSchool.toLowerCase() ? (currentUser.drive_url || "") : "");

        const rawData = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsGuru) ? DashboardManager.cachedData.reportsGuru : [];
        const schoolReports = rawData.filter(x => {
            const matchSchool = (x.asalSekolah || "").toLowerCase() === targetSchool.toLowerCase();
            if (!matchSchool) return false;
            if (isGuru) {
                return (x.nama || "").trim().toLowerCase() === (currentUser.nama || "").trim().toLowerCase();
            }
            return true;
        });

        // Ambil custom folders dari LiveSync atau DriveManager
        const allFolders = (typeof LiveSync !== "undefined" && LiveSync.state.folders) 
            ? LiveSync.state.folders 
            : (typeof DriveManager !== "undefined" && DriveManager.cachedFolders ? DriveManager.cachedFolders : []);

        const customFolders = allFolders.filter(f => {
            if (!f.namaFolder || f.namaFolder.startsWith("__DELETED__:") || (f.id && f.id.toString().startsWith("DEL-"))) return false;
            const isGuruSub = !f.subCategory || f.subCategory === "guru" || f.subCategory === "root";
            return ReportManager.isFolderForSchool(f, targetSchool) && isGuruSub;
        });

        // Deduplikasi folder berdasarkan nama folder agar tidak muncul ganda
        const seenNames = new Set();
        const uniqueCustomFolders = [];
        for (const f of customFolders) {
            const key = (f.namaFolder || "").trim().toLowerCase();
            if (!seenNames.has(key)) {
                seenNames.add(key);
                uniqueCustomFolders.push(f);
            }
        }

        let html = "";

        // Render Folder Guru yang ada di Database Folder_Drive
        uniqueCustomFolders.forEach(f => {
            const countCustom = schoolReports.filter(x => {
                const repType = (x.jenisPelaporan || x.kategori || '').toLowerCase();
                return repType.includes(f.namaFolder.toLowerCase());
            }).length;

            const safeFolderName = f.namaFolder.replace(/'/g, "\\'");

            html += `
                <div onclick="ReportManager.openSubFolderTable('guru', '${safeFolderName}')"
                    class="bg-white p-5 sm:p-6 rounded-2xl border border-[#E8E2D5] shadow-xs hover:shadow-md hover:border-emerald-500 transition-all cursor-pointer group flex flex-col justify-between card-hover overflow-hidden">
                    <div class="flex items-start justify-between gap-3 mb-2.5 min-w-0 w-full">
                        <div class="flex items-start gap-3.5 min-w-0 flex-1">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-bold group-hover:bg-emerald-600 group-hover:text-white transition-all flex-shrink-0">
                                <i class="fa-solid fa-folder-open"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <h4 class="font-bold text-slate-800 text-sm sm:text-base group-hover:text-emerald-600 transition-colors leading-snug break-words line-clamp-2" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;" title="${f.namaFolder}">${f.namaFolder}</h4>
                                <p class="text-[11px] sm:text-xs text-slate-400 mt-0.5">${isGuru ? 'Berkas Laporan Saya' : 'Folder Dokumen Guru'}</p>
                                <span class="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">${countCustom} Laporan</span>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-emerald-600 text-xs sm:text-sm flex-shrink-0 mt-1"></i>
                    </div>
                    <div class="pt-2.5 border-t border-[#F0EBE1] flex items-center justify-between text-xs mt-1" onclick="event.stopPropagation()">
                        ${(isPengawas && f.driveFolderUrl) ? `
                            <a href="${f.driveFolderUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                <i class="fa-brands fa-google-drive"></i> Buka Drive
                            </a>
                        ` : '<span class="text-[10px] text-slate-400 font-medium flex items-center gap-1"><i class="fa-solid fa-folder-closed text-slate-300"></i> Folder Aplikasi</span>'}
                        ${(isPengawas || isKepsek) ? `
                            <button onclick="ReportManager.confirmDeleteGuruFolder('${f.id}', '${safeFolderName}', '${safeTargetSchool}')" title="Hapus Folder" class="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-200 transition-colors">
                                <i class="fa-solid fa-trash-can text-[11px]"></i> Hapus
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        if (!html.trim()) {
            html = `
                <div class="col-span-full bg-white p-8 sm:p-10 rounded-2xl text-center border border-[#E8E2D5] text-slate-400 text-xs font-medium space-y-3">
                    <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto text-xl">
                        <i class="fa-solid fa-folder-open"></i>
                    </div>
                    <p class="text-slate-700 font-bold text-sm">Belum Ada Folder Dokumen</p>
                    <p class="text-slate-400 text-xs max-w-sm mx-auto">${isGuru 
                        ? 'Belum ada folder laporan guru yang ditambahkan oleh Kepala Sekolah atau Pengawas.' 
                        : 'Belum ada folder laporan guru yang dibuat untuk sekolah ini. Klik tombol di bawah untuk menambahkan folder baru.'}</p>
                    ${!isGuru ? `
                        <div>
                            <button onclick="ReportManager.openAddGuruFolderModal()" class="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition-all">
                                <i class="fa-solid fa-plus"></i> Tambah Folder Guru
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        grid.innerHTML = html;
        this.updateBadgeCounts();
    },

    /**
     * Buka Langkah 3: Tabel Daftar Laporan
     */
    openSubFolderTable(type, subType) {
        this.selectedTypeState = subType;

        document.getElementById(`subcards-container-${type}`).classList.add("hidden");
        document.getElementById(`table-container-${type}`).classList.remove("hidden");

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isGuru = currentUser && currentUser.role === "Guru";

        const titleEl = document.getElementById(`table-title-${type}`);
        if (titleEl) {
            titleEl.innerText = (isGuru && type === 'guru') 
                ? `Berkas Laporan Saya - ${subType}` 
                : `${this.selectedSchoolState} - Laporan ${subType}`;
        }

        const tbody = document.getElementById(`table-body-${type}`);
        const rawData = (type === 'kepsek') ? DashboardManager.cachedData.reportsKepsek : DashboardManager.cachedData.reportsGuru;
        const targetSheet = (type === 'kepsek') ? "Laporan_Kepsek" : "Laporan_Guru";

        const filteredData = rawData.filter(x => {
            const matchSchool = (x.asalSekolah || "").toLowerCase() === this.selectedSchoolState.toLowerCase();
            if (!matchSchool) return false;

            // Jika Guru: HANYA tampilkan berkas milik guru itu sendiri (Owner Only)
            if (isGuru && type === 'guru') {
                const myName = (currentUser.nama || "").trim().toLowerCase();
                const uploaderName = (x.nama || "").trim().toLowerCase();
                if (uploaderName !== myName) return false;
            }

            const reportType = (x.jenisPelaporan || x.kategori || '').toLowerCase();
            const targetSubType = subType.toLowerCase();

            if (targetSubType === "daring") {
                return reportType.includes("daring");
            } else if (targetSubType === "mingguan") {
                return reportType.includes("mingguan") || (!reportType.includes("daring") && !reportType.includes("kepala sekolah"));
            } else if (targetSubType === "laporan kepala sekolah") {
                return reportType.includes("laporan kepala sekolah") || reportType.includes("manajerial") || reportType.includes("kewirausahaan") || reportType.includes("supervisi") || !x.jenisPelaporan;
            } else {
                return reportType.includes(targetSubType);
            }
        });

        if (filteredData.length === 0) {
            const allFolders = (typeof LiveSync !== "undefined" && LiveSync.state.folders) ? LiveSync.state.folders : ((typeof DriveManager !== "undefined" && DriveManager.cachedFolders) ? DriveManager.cachedFolders : []);
            const matchedFolder = allFolders.find(f => {
                const matchName = (f.namaFolder || "").toLowerCase() === subType.toLowerCase();
                if (!matchName) return false;
                return ReportManager.isFolderForSchool(f, this.selectedSchoolState);
            });
            const driveUrl = matchedFolder ? matchedFolder.driveFolderUrl : "";

            const emptyMsg = (isGuru && type === 'guru')
                ? `Anda belum mengunggah berkas untuk <strong>Laporan ${subType}</strong>.`
                : `Belum ada berkas untuk <strong>Laporan ${subType}</strong> di sekolah ini.`;

            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="p-8 text-center text-slate-400 font-medium">
                        <div class="max-w-md mx-auto space-y-2">
                            <i class="fa-regular fa-folder-open text-3xl text-slate-300"></i>
                            <p class="text-xs">${emptyMsg}</p>
                            ${(driveUrl && isPengawas) ? `
                                <div class="pt-2">
                                    <a href="${driveUrl}" target="_blank" class="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-bold bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl text-xs transition-colors">
                                        <i class="fa-brands fa-google-drive"></i> Buka Folder di Google Drive
                                    </a>
                                </div>
                            ` : ''}
                        </div>
                    </td>
                </tr>`;
            this.clearSelection(type);
            return;
        }

        const currentRole = currentUser ? currentUser.role : "";
        const currentName = currentUser ? (currentUser.nama || "").trim().toLowerCase() : "";
        const currentSchool = currentUser ? (currentUser.asal_sekolah || "").trim().toLowerCase() : "";
        const isPengawas = currentRole === "Pengawas";
        const canVerify = isPengawas || currentRole === "Kepala Sekolah" || currentRole === "Kepsek";

        tbody.innerHTML = "";
        filteredData.forEach(item => {
            const itemUploader = (item.nama || "").trim().toLowerCase();
            const itemSchool = (item.asalSekolah || "").trim().toLowerCase();
            const isOwner = currentName && itemUploader === currentName;
            const isSchoolKepsek = (currentRole === "Kepala Sekolah" || currentRole === "Kepsek") && currentSchool && itemSchool === currentSchool;
            const canManage = isPengawas || isOwner || isSchoolKepsek;
            const canDelete = canManage;
            const canEdit = canManage;
            const isChecked = this.selectedReportIds[type] && this.selectedReportIds[type].has(item.id);

            tbody.innerHTML += `
                <tr class="hover:bg-[#FAF7F0] transition-colors border-b border-[#F0EBE1] ${isChecked ? 'bg-blue-50/40' : ''}">
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <input type="checkbox" class="report-row-cb-${type} w-4 h-4 rounded text-blue-600 border-[#D5CEBF] focus:ring-blue-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            value="${item.id}"
                            ${!canDelete ? 'disabled title="Anda tidak memiliki izin menghapus berkas ini"' : ''}
                            ${isChecked ? 'checked' : ''}
                            onchange="ReportManager.onRowCheckboxChange('${type}', this, '${item.id}')">
                    </td>
                    <td class="p-3.5 whitespace-nowrap">
                        <p class="font-bold text-slate-800 font-mono text-xs">${item.id}</p>
                        <p class="text-[10px] text-slate-400 font-medium">${item.tanggal}</p>
                    </td>
                    <td class="p-3.5 font-bold text-slate-800 whitespace-nowrap">${item.nama}</td>
                    <td class="p-3.5 text-slate-700 min-w-[200px] max-w-[340px]">
                        <div class="font-bold text-slate-800 text-xs">${item.kategori}</div>
                        <div class="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed bg-amber-50/70 p-1.5 rounded-lg border border-amber-200/80" title="${ReportManager.getPoinPenting(item).replace(/"/g, '&quot;')}">
                            <span class="font-semibold text-amber-800"><i class="fa-solid fa-list-check text-amber-600 text-[10px] mr-1"></i>Poin:</span> ${ReportManager.getPoinPenting(item).replace(/\n/g, ' ')}
                        </div>
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        ${isPengawas ? `
                            <a href="${item.fileUrl}" target="_blank" class="inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-700 font-bold bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 px-2.5 py-1 rounded-lg text-xs transition-colors shadow-2xs">
                                ${ReportManager.getFileIcon(item.fileUrl, item.namaFile || item.filename, item.kategori)} <span>Buka Berkas</span>
                            </a>
                        ` : `
                            <button onclick="ReportManager.openModalVerifikasi('${item.id}', '${item.nama.replace(/'/g, "\\'")}', '${item.status}', '${(item.catatan || '').replace(/'/g, "\\'")}', '${targetSheet}')" class="inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-700 font-bold bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 px-2.5 py-1 rounded-lg text-xs transition-colors shadow-2xs cursor-pointer">
                                ${ReportManager.getFileIcon(item.fileUrl, item.namaFile || item.filename, item.kategori)} <span>Pratinjau</span>
                            </button>
                        `}
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">${DashboardManager.getStatusBadge(item.status)}</td>
                    <td class="p-3.5 text-slate-600 text-xs max-w-[200px] truncate" title="${item.catatan && item.catatan !== '-' ? item.catatan : ''}">
                        ${item.catatan && item.catatan !== '-' && item.catatan !== 'Belum ada catatan' ? `<span class="italic text-slate-700 font-medium">"${item.catatan}"</span>` : '<span class="text-slate-400">-</span>'}
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <div class="inline-flex items-center justify-center gap-1.5">
                            ${canVerify ? `
                                <button onclick="ReportManager.openModalVerifikasi('${item.id}', '${item.nama}', '${item.status}', '${item.catatan}', '${targetSheet}')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-sm text-xs transition-colors flex items-center gap-1">
                                    <i class="fa-solid fa-file-circle-check"></i> <span class="hidden md:inline">Verifikasi</span>
                                </button>
                            ` : ''}
                            ${canEdit ? `
                                <button onclick="ReportManager.openEditReportModal('${item.id}', '${targetSheet}')" title="Edit & Perbarui Laporan" class="bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-2.5 py-1.5 rounded-xl border border-amber-200 text-xs transition-colors flex items-center gap-1">
                                    <i class="fa-solid fa-pen-to-square"></i> <span class="hidden md:inline">Edit</span>
                                </button>
                            ` : ''}
                            ${canDelete ? `
                                <button onclick="ReportManager.confirmDeleteReport('${item.id}', '${item.nama}', '${targetSheet}')" title="${isOwner ? 'Hapus Berkas Saya' : 'Hapus Laporan'}" class="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2.5 py-1.5 rounded-xl border border-rose-200 text-xs transition-colors">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            ` : ''}
                            ${!canVerify && !canDelete && !canEdit ? `<span class="text-slate-400 text-xs">-</span>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        this.updateBulkBar(type);
    },

    toggleSelectAll(type, masterCb) {
        if (!this.selectedReportIds[type]) this.selectedReportIds[type] = new Set();
        const checked = masterCb.checked;
        const cbs = document.querySelectorAll(`.report-row-cb-${type}:not(:disabled)`);
        cbs.forEach(cb => {
            cb.checked = checked;
            if (checked) {
                this.selectedReportIds[type].add(cb.value);
            } else {
                this.selectedReportIds[type].delete(cb.value);
            }
        });
        this.updateBulkBar(type);
    },

    onRowCheckboxChange(type, cb, reportId) {
        if (!this.selectedReportIds[type]) this.selectedReportIds[type] = new Set();
        if (cb.checked) {
            this.selectedReportIds[type].add(reportId);
        } else {
            this.selectedReportIds[type].delete(reportId);
        }

        const total = document.querySelectorAll(`.report-row-cb-${type}:not(:disabled)`).length;
        const checked = document.querySelectorAll(`.report-row-cb-${type}:checked`).length;
        const master = document.getElementById(`check-all-${type}`);
        if (master) {
            master.checked = (total > 0 && checked === total);
            master.indeterminate = (checked > 0 && checked < total);
        }
        this.updateBulkBar(type);
    },

    clearSelection(type) {
        if (this.selectedReportIds[type]) this.selectedReportIds[type].clear();
        document.querySelectorAll(`.report-row-cb-${type}`).forEach(cb => cb.checked = false);
        const master = document.getElementById(`check-all-${type}`);
        if (master) {
            master.checked = false;
            master.indeterminate = false;
        }
        this.updateBulkBar(type);
    },

    updateBulkBar(type) {
        const count = this.selectedReportIds[type] ? this.selectedReportIds[type].size : 0;
        const bar = document.getElementById(`bulk-bar-${type}`);
        if (bar) {
            if (count > 0) {
                bar.classList.remove("hidden");
                const badge = bar.querySelector(".bulk-count-badge");
                if (badge) badge.innerText = count;
            } else {
                bar.classList.add("hidden");
            }
        }
    },

    async bulkDeleteReports(type) {
        const ids = Array.from(this.selectedReportIds[type] || []);
        if (ids.length === 0) {
            App.showToast("Tidak ada berkas laporan yang dipilih.", "warning");
            return;
        }

        const count = ids.length;
        const targetSheet = (type === 'kepsek' || (type === 'folder-sekolah' && this.activeFolderSekolahType === 'kepsek')) 
            ? "Laporan_Kepsek" 
            : "Laporan_Guru";

        const confirmed = await App.confirmModal({
            title: "Hapus Berkas Laporan Terpilih",
            message: `Apakah Anda yakin ingin menghapus <strong>${count} berkas laporan</strong> terpilih?`,
            subMessage: "Berkas dokumen terkait di Google Drive juga akan dipindahkan ke Sampah.",
            confirmText: `Ya, Hapus ${count} Berkas`,
            confirmType: "danger",
            icon: "fa-solid fa-trash-can"
        });

        if (confirmed) {
            this.clearSelection(type);
            if (typeof LiveSync !== "undefined") {
                LiveSync.optimisticDeleteReport(ids, targetSheet);
                if (this.activeFolderSekolahName && document.getElementById("wrapper-folder-sekolah-table") && !document.getElementById("wrapper-folder-sekolah-table").classList.contains("hidden")) {
                    this.openFolderSekolahTable(this.activeFolderSekolahType, this.activeFolderSekolahName, this.activeFolderSekolahSchool);
                } else if (this.selectedTypeState) {
                    this.openSubFolderTable(type, this.selectedTypeState);
                }
                this.renderSummaryPoinPenting(type);
                this.updateBadgeCounts();
            }
        }
    },

    async confirmDeleteReport(idLaporan, namaPengirim, targetSheet) {
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isOwner = currentUser && (currentUser.nama || "").trim().toLowerCase() === (namaPengirim || "").trim().toLowerCase();

        const title = isOwner ? "Hapus Berkas Laporan Saya" : "Hapus Berkas Laporan";
        const message = isOwner 
            ? `Apakah Anda yakin ingin menghapus berkas laporan Anda <strong>"${idLaporan}"</strong>?`
            : `Apakah Anda yakin ingin menghapus berkas laporan <strong>"${idLaporan}"</strong> (${namaPengirim})?`;

        const confirmed = await App.confirmModal({
            title: title,
            message: message,
            subMessage: "Berkas dokumen terkait di Google Drive juga akan dipindahkan ke Sampah.",
            confirmText: "Ya, Hapus Berkas",
            confirmType: "danger",
            icon: "fa-solid fa-trash-can"
        });

        if (confirmed) {
            this.deleteReport(idLaporan, targetSheet);
        }
    },

    deleteReport(idLaporan, targetSheet) {
        if (typeof LiveSync !== "undefined") {
            LiveSync.optimisticDeleteReport(idLaporan, targetSheet);
            if (this.activeFolderSekolahName && document.getElementById("wrapper-folder-sekolah-table") && !document.getElementById("wrapper-folder-sekolah-table").classList.contains("hidden")) {
                this.openFolderSekolahTable(this.activeFolderSekolahType, this.activeFolderSekolahName, this.activeFolderSekolahSchool);
            } else if (this.selectedTypeState) {
                this.openSubFolderTable(targetSheet === "Laporan_Kepsek" ? "kepsek" : "guru", this.selectedTypeState);
            }
            const type = (targetSheet === "Laporan_Kepsek") ? "kepsek" : "guru";
            this.renderSummaryPoinPenting(type);
            this.updateBadgeCounts();
        }
    },

    backToFolderKepsek() {
        this.selectedTypeState = "";
        try {
            localStorage.removeItem("pantausekolah_selected_school");
        } catch (e) {}
        document.getElementById("subcards-container-kepsek").classList.add("hidden");
        document.getElementById("table-container-kepsek").classList.add("hidden");
        document.getElementById("cards-container-kepsek").classList.remove("hidden");
        this.renderSchoolFolderCards('kepsek');
    },

    backToSubFolderKepsek() {
        this.selectedTypeState = "";
        document.getElementById("table-container-kepsek").classList.add("hidden");
        document.getElementById("subcards-container-kepsek").classList.remove("hidden");
        if (this.selectedSchoolState) {
            this.renderSubCardsKepsek(this.selectedSchoolState);
        }
    },

    backToFolderGuru() {
        this.selectedTypeState = "";
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isKepsek = currentUser && (currentUser.role === "Kepala Sekolah" || currentUser.role === "Kepsek");
        const isGuru = currentUser && currentUser.role === "Guru";
        if ((isKepsek || isGuru) && currentUser.asal_sekolah) {
            this.openSchoolFolder('guru', currentUser.asal_sekolah);
            return;
        }

        try {
            localStorage.removeItem("pantausekolah_selected_school");
        } catch (e) {}
        document.getElementById("subcards-container-guru").classList.add("hidden");
        document.getElementById("table-container-guru").classList.add("hidden");
        document.getElementById("cards-container-guru").classList.remove("hidden");
        this.renderSchoolFolderCards('guru');
    },

    backToSubFolderGuru() {
        this.selectedTypeState = "";
        document.getElementById("table-container-guru").classList.add("hidden");
        document.getElementById("subcards-container-guru").classList.remove("hidden");
        if (this.selectedSchoolState) {
            this.renderSubCardsGuru(this.selectedSchoolState);
        }
    },

    /**
     * Alias method untuk live sync backward compatibility
     */
    renderSubFolderTable(type, subType) {
        return this.openSubFolderTable(type, subType);
    },

    /**
     * Modal Tambah Folder Guru
     */
    openAddGuruFolderModal() {
        const modal = document.getElementById("modal-add-guru-folder");
        if (!modal) return;

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isPengawas = currentUser && currentUser.role === "Pengawas";
        const schoolName = isPengawas
            ? (this.selectedSchoolState || this.selectedSchoolFolderSekolah || "")
            : (currentUser ? (currentUser.asal_sekolah || "") : "");

        const labelSchool = document.getElementById("label-add-guru-folder-school");
        if (labelSchool) labelSchool.innerText = schoolName || "Sekolah";

        const input = document.getElementById("input-guru-folder-name");
        if (input) input.value = "";

        modal.classList.remove("hidden");

        setTimeout(() => {
            if (input) input.focus();
        }, 50);

        if (this._escGuruFolderHandler) window.removeEventListener("keydown", this._escGuruFolderHandler);
        this._escGuruFolderHandler = (e) => {
            if (e.key === "Escape") {
                this.closeAddGuruFolderModal();
            }
        };
        window.addEventListener("keydown", this._escGuruFolderHandler);
    },

    closeAddGuruFolderModal() {
        if (this._escGuruFolderHandler) {
            window.removeEventListener("keydown", this._escGuruFolderHandler);
            this._escGuruFolderHandler = null;
        }
        const modal = document.getElementById("modal-add-guru-folder");
        if (modal) modal.classList.add("hidden");
    },

    async submitCreateGuruFolder() {
        const input = document.getElementById("input-guru-folder-name");
        const folderName = input ? input.value.trim() : "";
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isPengawas = currentUser && currentUser.role === "Pengawas";
        const schoolName = isPengawas
            ? (this.selectedSchoolState || this.selectedSchoolFolderSekolah || "")
            : (currentUser ? (currentUser.asal_sekolah || "") : "");

        if (!folderName) {
            App.showToast("Nama folder wajib diisi!", "error");
            return;
        }

        if (!schoolName) {
            App.showToast("Asal sekolah tidak valid atau belum dipilih!", "error");
            return;
        }

        this.closeAddGuruFolderModal();

        App.showToast(`Sedang membuat folder "${folderName}" di Google Drive...`, "info");

        // Optimistic UI lokal
        const tempId = "FLD-TEMP-" + Date.now();
        const optimisticFolder = {
            id: tempId,
            namaFolder: folderName,
            namaSekolah: schoolName,
            targetType: "single",
            driveFolderUrl: "",
            subCategory: "guru",
            createdAt: "Baru saja"
        };

        this.selectedTypeState = "";

        if (typeof LiveSync !== "undefined" && LiveSync.state.folders) {
            LiveSync.state.folders.unshift(optimisticFolder);
            LiveSync.saveToLocalStorage();
            this.refreshFolderViews(schoolName);
        } else if (typeof DriveManager !== "undefined" && DriveManager.cachedFolders) {
            DriveManager.cachedFolders.unshift(optimisticFolder);
            this.refreshFolderViews(schoolName);
        }

        try {
            const res = await ApiService.post({
                action: "create_drive_folder",
                currentUserRole: currentUser ? currentUser.role : "Kepala Sekolah",
                currentUserSchool: schoolName,
                folderName: folderName,
                targetType: "single",
                targetSchool: schoolName,
                subCategory: "guru"
            });

            if (res.status === "success") {
                const lower = folderName.toLowerCase();
                if (lower.includes("mingguan")) {
                    this.restoreDefaultFolder("Mingguan", schoolName);
                }
                if (lower.includes("daring")) {
                    this.restoreDefaultFolder("Daring", schoolName);
                }
                App.showToast(res.message || `Folder "${folderName}" berhasil dibuat di Google Drive!`, "success");
                if (typeof LiveSync !== "undefined") {
                    await LiveSync.sync({ silent: true });
                    this.refreshFolderViews(schoolName);
                } else if (typeof DriveManager !== "undefined") {
                    await DriveManager.loadDriveData();
                    this.refreshFolderViews(schoolName);
                }
            } else {
                // Rollback jika gagal
                if (typeof LiveSync !== "undefined" && LiveSync.state.folders) {
                    LiveSync.state.folders = LiveSync.state.folders.filter(f => f.id !== tempId);
                    LiveSync.saveToLocalStorage();
                    this.refreshFolderViews(schoolName);
                }
                App.showToast(res.message || "Gagal membuat folder Google Drive.", "error");
            }
        } catch (err) {
            if (typeof LiveSync !== "undefined" && LiveSync.state.folders) {
                LiveSync.state.folders = LiveSync.state.folders.filter(f => f.id !== tempId);
                LiveSync.saveToLocalStorage();
                this.refreshFolderViews(schoolName);
            }
            App.showToast("Terjadi kesalahan koneksi saat membuat folder.", "error");
        }
    },

    /**
     * Modal Tambah Folder Kepala Sekolah (Hanya untuk Pengawas)
     */
    openAddKepsekFolderModal(schoolName) {
        const modal = document.getElementById("modal-add-kepsek-folder");
        if (!modal) return;

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const targetSchool = (schoolName || this.selectedSchoolState || this.selectedSchoolFolderSekolah || (currentUser ? currentUser.asal_sekolah : "")).trim();
        if (targetSchool) {
            this.selectedSchoolState = targetSchool;
            this.selectedSchoolFolderSekolah = targetSchool;
        }

        const labelSchool = document.getElementById("label-add-kepsek-folder-school") || document.getElementById("add-kepsek-folder-school-label");
        if (labelSchool) {
            labelSchool.textContent = targetSchool || "Sekolah";
        }

        const input = document.getElementById("input-kepsek-folder-name") || document.getElementById("add-kepsek-folder-name");
        if (input) input.value = "";

        modal.classList.remove("hidden");

        setTimeout(() => {
            if (input) input.focus();
        }, 50);

        if (this._escKepsekFolderHandler) window.removeEventListener("keydown", this._escKepsekFolderHandler);
        this._escKepsekFolderHandler = (e) => {
            if (e.key === "Escape") {
                this.closeAddKepsekFolderModal();
            }
        };
        window.addEventListener("keydown", this._escKepsekFolderHandler);
    },

    closeAddKepsekFolderModal() {
        if (this._escKepsekFolderHandler) {
            window.removeEventListener("keydown", this._escKepsekFolderHandler);
            this._escKepsekFolderHandler = null;
        }
        const modal = document.getElementById("modal-add-kepsek-folder");
        if (modal) modal.classList.add("hidden");
    },

    async submitCreateKepsekFolder() {
        const input = document.getElementById("input-kepsek-folder-name") || document.getElementById("add-kepsek-folder-name");
        const folderName = input ? input.value.trim() : "";
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const schoolName = (this.selectedSchoolState || this.selectedSchoolFolderSekolah || (currentUser ? currentUser.asal_sekolah : "")).trim();

        if (currentUser && currentUser.role !== "Pengawas") {
            App.showToast("Hanya Pengawas yang berwenang menambahkan folder Kepala Sekolah!", "error");
            return;
        }

        if (!folderName) {
            App.showToast("Nama folder wajib diisi!", "error");
            return;
        }

        if (!schoolName) {
            App.showToast("Sekolah tujuan belum ditentukan!", "error");
            return;
        }

        this.closeAddKepsekFolderModal();

        App.showToast(`Sedang membuat folder "${folderName}" di Google Drive...`, "info");

        // Optimistic UI lokal
        const tempId = "FLD-KEPSEK-TEMP-" + Date.now();
        const optimisticFolder = {
            id: tempId,
            namaFolder: folderName,
            namaSekolah: schoolName,
            targetType: "single",
            driveFolderUrl: "",
            subCategory: "kepsek",
            createdAt: "Baru saja"
        };

        this.selectedTypeState = "";

        if (typeof LiveSync !== "undefined" && LiveSync.state.folders) {
            LiveSync.state.folders.unshift(optimisticFolder);
            LiveSync.saveToLocalStorage();
            this.refreshFolderViews(schoolName);
        } else if (typeof DriveManager !== "undefined" && DriveManager.cachedFolders) {
            DriveManager.cachedFolders.unshift(optimisticFolder);
            this.refreshFolderViews(schoolName);
        }

        try {
            const res = await ApiService.post({
                action: "create_drive_folder",
                currentUserRole: currentUser ? currentUser.role : "Pengawas",
                currentUserSchool: schoolName,
                folderName: folderName,
                targetType: "single",
                targetSchool: schoolName,
                subCategory: "kepsek"
            });

            if (res.status === "success") {
                const lower = folderName.toLowerCase();
                if (lower.includes("kepala sekolah")) {
                    this.restoreDefaultFolder("Laporan Kepala Sekolah", schoolName);
                }
                App.showToast(res.message || `Folder "${folderName}" berhasil dibuat di Google Drive!`, "success");
                if (typeof LiveSync !== "undefined") {
                    await LiveSync.sync({ silent: true });
                    this.refreshFolderViews(schoolName);
                } else if (typeof DriveManager !== "undefined") {
                    await DriveManager.loadDriveData();
                    this.refreshFolderViews(schoolName);
                }
            } else {
                // Rollback jika gagal
                if (typeof LiveSync !== "undefined" && LiveSync.state.folders) {
                    LiveSync.state.folders = LiveSync.state.folders.filter(f => f.id !== tempId);
                    LiveSync.saveToLocalStorage();
                    this.refreshFolderViews(schoolName);
                }
                App.showToast(res.message || "Gagal membuat folder Google Drive.", "error");
            }
        } catch (err) {
            if (typeof LiveSync !== "undefined" && LiveSync.state.folders) {
                LiveSync.state.folders = LiveSync.state.folders.filter(f => f.id !== tempId);
                LiveSync.saveToLocalStorage();
                this.refreshFolderViews(schoolName);
            }
            App.showToast("Terjadi kesalahan koneksi saat membuat folder.", "error");
        }
    },

    /**
     * Helper menyegarkan tampilan folder di Langkah 2 Supervisi dan Modul Folder Dokumen Sekolah
     */
    refreshFolderViews(schoolName) {
        const target = schoolName || this.selectedSchoolState || this.selectedSchoolFolderSekolah;
        if (target) {
            this.renderSubCardsGuru(target);
            if (typeof this.renderSubCardsKepsek === "function") {
                this.renderSubCardsKepsek(target);
            }
            if (typeof this.renderFolderSekolahView === "function") {
                this.renderFolderSekolahView(target);
            }
            if (typeof this.populateUploadFolders === "function") {
                this.populateUploadFolders();
            }
        }
    },

    async confirmDeleteGuruFolder(folderId, folderName, schoolName) {
        const targetSchool = (schoolName || this.selectedSchoolState || "").trim();
        const confirmed = await App.confirmModal({
            title: "Hapus Folder Google Drive",
            message: `Apakah Anda yakin ingin menghapus folder <strong>"${folderName}"</strong>?`,
            subMessage: "Folder di Google Drive dan daftar laporan terkait akan dipindahkan ke Sampah.",
            confirmText: "Ya, Hapus Folder",
            confirmType: "danger",
            icon: "fa-solid fa-trash-can"
        });

        if (confirmed) {
            if (typeof LiveSync !== "undefined") {
                await LiveSync.optimisticDeleteFolder(folderId, targetSchool);
                this.refreshFolderViews(targetSchool);
            } else if (typeof DriveManager !== "undefined") {
                DriveManager.deleteFolder(folderId, targetSchool);
                this.refreshFolderViews(targetSchool);
            }
        }
    },

    /**
     * Konfirmasi hapus folder bawaan (Laporan Kepala Sekolah / Mingguan / Daring)
     */
    async confirmDeleteDefaultFolder(folderType, schoolName) {
        const targetSchool = (schoolName || this.selectedSchoolState || "").trim();
        const cleanTitle = folderType.startsWith("Laporan ") ? folderType : `Laporan ${folderType}`;
        const confirmed = await App.confirmModal({
            title: `Hapus Folder ${cleanTitle}`,
            message: `Apakah Anda yakin ingin menghapus folder <strong>"${cleanTitle}"</strong> untuk sekolah <strong>${targetSchool}</strong>?`,
            subMessage: "Folder ini akan dihapus dari daftar tampilan berkas sekolah.",
            confirmText: "Ya, Hapus Folder",
            confirmType: "danger",
            icon: "fa-solid fa-trash-can"
        });

        if (confirmed) {
            this.deleteDefaultFolder(folderType, targetSchool);
        }
    },

    /**
     * Eksekusi hapus folder bawaan secara instan (0ms) & simpan ke server
     */
    deleteDefaultFolder(folderType, schoolName) {
        const targetSchool = (schoolName || this.selectedSchoolState || "").trim();
        const cleanType = folderType.trim().toLowerCase();
        const key = `${targetSchool.toLowerCase()}:${cleanType}`;
        const isKepsekFolder = cleanType.includes("kepala sekolah");

        // 1. Simpan di LiveSync / localStorage secara lokal untuk perubahan instan 0ms
        if (typeof LiveSync !== "undefined") {
            if (!Array.isArray(LiveSync.state.hiddenDefaultFolders)) {
                LiveSync.state.hiddenDefaultFolders = [];
            }
            if (!LiveSync.state.hiddenDefaultFolders.includes(key)) {
                LiveSync.state.hiddenDefaultFolders.push(key);
            }
            LiveSync.saveHiddenDefaultFolders();
            this.refreshFolderViews(targetSchool);
        }

        try {
            let hidden = JSON.parse(localStorage.getItem("pantausekolah_hidden_default_folders") || "[]");
            if (!hidden.includes(key)) hidden.push(key);
            localStorage.setItem("pantausekolah_hidden_default_folders", JSON.stringify(hidden));
            this.refreshFolderViews(targetSchool);
        } catch (e) {}

        const cleanDisplayName = folderType.startsWith("Laporan ") ? folderType : `Laporan ${folderType}`;
        App.showToast(`Folder ${cleanDisplayName} berhasil dihapus.`, "success");

        // 2. Kirim ke backend di background
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (currentUser) {
            ApiService.post({
                action: "delete_default_folder",
                schoolName: targetSchool,
                folderType: folderType,
                subCategory: isKepsekFolder ? "kepsek" : "guru",
                currentUserRole: currentUser.role,
                currentUserSchool: currentUser.asal_sekolah || ""
            }).then(() => {
                if (typeof LiveSync !== "undefined") {
                    LiveSync.sync({ silent: true });
                }
            }).catch((err) => {
                console.error("Gagal menghapus folder default di backend:", err);
            });
        }
    },

    /**
     * Pulihkan kembali folder bawaan jika user membuat folder dengan nama serupa
     */
    restoreDefaultFolder(folderType, schoolName) {
        const targetSchool = (schoolName || this.selectedSchoolState || "").trim();
        const key = `${targetSchool.toLowerCase()}:${folderType.toLowerCase()}`;
        if (typeof LiveSync !== "undefined") {
            if (LiveSync.state.hiddenDefaultFolders) {
                LiveSync.state.hiddenDefaultFolders = LiveSync.state.hiddenDefaultFolders.filter(k => k !== key);
            }
            if (LiveSync.state.folders) {
                LiveSync.state.folders = LiveSync.state.folders.filter(f => {
                    const isMatch = f.namaFolder && f.namaFolder.toLowerCase().includes(`__deleted__:${folderType.toLowerCase()}`) &&
                        (f.targetType === "all" || !f.namaSekolah || (f.namaSekolah || "").toLowerCase() === targetSchool.toLowerCase());
                    return !isMatch;
                });
            }
            LiveSync.saveHiddenDefaultFolders();
        }
        try {
            let hidden = JSON.parse(localStorage.getItem("pantausekolah_hidden_default_folders") || "[]");
            hidden = hidden.filter(k => k !== key);
            localStorage.setItem("pantausekolah_hidden_default_folders", JSON.stringify(hidden));
        } catch (e) {}
        this.refreshFolderViews(targetSchool);
    },

    /**
     * Helper: Mendapatkan URL Embed Pratinjau Google Drive / Docs / Images
     */
    getEmbedPreviewUrl(url) {
        if (!url || typeof url !== "string") return "";
        const clean = url.trim();

        // Sudah merupakan format preview embed
        if (clean.includes("drive.google.com") && clean.includes("/preview")) {
            return clean;
        }

        // Format Google Drive /file/d/{id}/...
        const matchD = clean.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
        if (matchD && matchD[1]) {
            return `https://drive.google.com/file/d/${matchD[1]}/preview`;
        }

        // Format query parameter id={id}
        const matchId = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
        if (matchId && matchId[1]) {
            return `https://drive.google.com/file/d/${matchId[1]}/preview`;
        }

        // Dokumen Google Docs / Sheets
        if (clean.includes("docs.google.com/document/d/")) {
            return clean.replace(/\/edit.*$/, "/preview");
        }
        if (clean.includes("docs.google.com/spreadsheets/d/")) {
            return clean.replace(/\/edit.*$/, "/preview");
        }

        return clean;
    },

    /**
     * Helper: Mendapatkan metadata badge tipe file & ikon
     */
    getFileBadgeMeta(filename = "", fileUrl = "", kategori = "") {
        const text = ((filename || "") + " " + (fileUrl || "") + " " + (kategori || "")).toLowerCase();
        if (text.includes(".pdf")) {
            return { label: "PDF", bg: "bg-rose-100 text-rose-700 border-rose-200", icon: "fa-file-pdf", isImage: false };
        }
        if (text.includes(".docx") || text.includes(".doc") || text.includes("word") || text.includes("docs")) {
            return { label: "DOCX", bg: "bg-blue-100 text-blue-700 border-blue-200", icon: "fa-file-word", isImage: false };
        }
        if (text.includes(".xlsx") || text.includes(".xls") || text.includes(".csv") || text.includes("excel") || text.includes("spreadsheet")) {
            return { label: "EXCEL", bg: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "fa-file-excel", isImage: false };
        }
        if (text.includes(".jpg") || text.includes(".jpeg") || text.includes(".png") || text.includes(".webp") || text.includes(".gif") || text.includes("gambar") || text.includes("foto")) {
            return { label: "GAMBAR", bg: "bg-amber-100 text-amber-700 border-amber-200", icon: "fa-file-image", isImage: true };
        }
        return { label: "BERKAS", bg: "bg-slate-100 text-slate-700 border-slate-200", icon: "fa-file-lines", isImage: false };
    },

    /**
     * Sisipkan template catatan saran verifikasi cepat
     */
    insertVerifTemplate(templateText) {
        const catatanEl = document.getElementById("modal-catatan");
        if (!catatanEl) return;
        const currentVal = catatanEl.value.trim();
        if (!currentVal) {
            catatanEl.value = templateText;
        } else {
            catatanEl.value = currentVal + "\n" + templateText;
        }
        catatanEl.focus();
    },

    /**
     * Refresh ulang iframe pratinjau dokumen
     */
    reloadPreviewIframe() {
        const iframe = document.getElementById("modal-preview-iframe");
        const loading = document.getElementById("modal-preview-loading");
        if (!iframe) return;
        const curSrc = iframe.src;
        if (curSrc && curSrc !== "about:blank") {
            if (loading) loading.classList.remove("hidden");
            iframe.src = "about:blank";
            setTimeout(() => {
                iframe.src = curSrc;
            }, 120);
        }
    },

    /**
     * Modal Verifikasi Laporan dengan Pratinjau Dokumen Live & Intisari Poin Penting
     */
    openModalVerifikasi(id, nama, status, catatan, targetSheet) {
        this.activeSelectedId = id;
        this.activeTargetSheet = targetSheet;

        // Cari item laporan di seluruh sumber data cache
        let reportItem = null;
        const findInList = (list) => Array.isArray(list) ? list.find(x => x && x.id === id) : null;

        if (typeof DashboardManager !== "undefined" && DashboardManager.cachedData) {
            if (targetSheet === "Laporan_Kepsek") {
                reportItem = findInList(DashboardManager.cachedData.reportsKepsek);
            } else if (targetSheet === "Laporan_Guru") {
                reportItem = findInList(DashboardManager.cachedData.reportsGuru);
            }
            if (!reportItem) {
                reportItem = findInList(DashboardManager.cachedData.reportsKepsek) || findInList(DashboardManager.cachedData.reportsGuru);
            }
        }

        if (!reportItem && typeof LiveSync !== "undefined" && LiveSync.state) {
            if (targetSheet === "Laporan_Kepsek") {
                reportItem = findInList(LiveSync.state.reportsKepsek);
            } else if (targetSheet === "Laporan_Guru") {
                reportItem = findInList(LiveSync.state.reportsGuru);
            }
            if (!reportItem) {
                reportItem = findInList(LiveSync.state.reportsKepsek) || findInList(LiveSync.state.reportsGuru);
            }
        }

        // Tampilkan Identitas Dokumen
        const idEl = document.getElementById("modal-id-laporan");
        const userEl = document.getElementById("modal-user-name");
        if (idEl) idEl.innerText = "ID: " + id;
        if (userEl) userEl.innerText = nama || (reportItem ? reportItem.nama : "Pengirim Laporan");

        const schoolEl = document.getElementById("modal-school-text");
        if (schoolEl) {
            schoolEl.innerText = (reportItem && reportItem.asalSekolah) ? reportItem.asalSekolah : (this.selectedSchoolState || "-");
        }

        const dateEl = document.getElementById("modal-date-text");
        if (dateEl) {
            let tglFormatted = "-";
            if (reportItem && reportItem.tanggal) {
                try {
                    tglFormatted = new Date(reportItem.tanggal).toLocaleDateString("id-ID", {
                        day: "numeric", month: "short", year: "numeric"
                    });
                } catch(e) {
                    tglFormatted = String(reportItem.tanggal).split("T")[0];
                }
            }
            dateEl.innerText = tglFormatted;
        }

        const katBadge = document.getElementById("modal-meta-kategori");
        if (katBadge) {
            katBadge.innerText = (reportItem && (reportItem.kategori || reportItem.jenisPelaporan))
                ? (reportItem.kategori || reportItem.jenisPelaporan)
                : "Laporan";
        }

        // Tampilkan Status & Catatan
        const statusSelect = document.getElementById("modal-status");
        if (statusSelect) {
            statusSelect.value = (status !== "Menunggu Verifikasi" && status !== "Menunggu Pengawas" && status !== "Menunggu Kepsek") 
                ? status 
                : "Disetujui";
        }

        const catatanInput = document.getElementById("modal-catatan");
        if (catatanInput) {
            catatanInput.value = (catatan !== "Belum ada catatan" && catatan !== "-") ? catatan : "";
        }

        // Tampilkan Sorotan Poin-Poin Penting Laporan
        const poinBox = document.getElementById("modal-poin-penting-box");
        const poinText = document.getElementById("modal-poin-penting-text");
        if (poinBox && poinText) {
            const poin = reportItem ? this.getPoinPenting(reportItem) : "";
            poinText.innerText = poin || "• Dokumen administrasi terverifikasi\n• Silakan periksa pratinjau berkas secara lengkap di sebelah kiri";
        }

        // TAMPILAN PREVIEW BERKAS DOKUMEN TERPADU
        const fileUrl = reportItem ? (reportItem.fileUrl || "") : "";
        const rawFilename = reportItem ? (reportItem.namaFile || reportItem.filename || reportItem.kategori || "Berkas Laporan") : "Berkas Laporan";
        const badgeMeta = this.getFileBadgeMeta(rawFilename, fileUrl, reportItem ? reportItem.kategori : "");

        const previewBadge = document.getElementById("modal-preview-badge");
        if (previewBadge) {
            previewBadge.className = `px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${badgeMeta.bg}`;
            previewBadge.innerText = badgeMeta.label;
        }

        const previewFilename = document.getElementById("modal-preview-filename");
        if (previewFilename) {
            previewFilename.innerText = rawFilename;
            previewFilename.title = rawFilename;
        }

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isPengawas = currentUser && currentUser.role === "Pengawas";

        const extLink = document.getElementById("modal-file-link-ext");
        const fileLink = document.getElementById("modal-file-link");
        if (fileUrl && isPengawas) {
            if (extLink) {
                extLink.href = fileUrl;
                extLink.classList.remove("hidden");
            }
            if (fileLink) {
                fileLink.href = fileUrl;
                fileLink.classList.remove("hidden");
            }
        } else {
            if (extLink) extLink.classList.add("hidden");
            if (fileLink) fileLink.classList.add("hidden");
        }

        const fallbackDriveBtn = document.getElementById("modal-fallback-drive-btn");
        if (fallbackDriveBtn) {
            if (fileUrl && isPengawas) {
                fallbackDriveBtn.href = fileUrl;
                fallbackDriveBtn.classList.remove("hidden");
            } else {
                fallbackDriveBtn.classList.add("hidden");
            }
        }

        // Konfigurasi Frame & Pratinjau Dokumen
        const iframe = document.getElementById("modal-preview-iframe");
        const imgContainer = document.getElementById("modal-preview-image-container");
        const imgEl = document.getElementById("modal-preview-image");
        const loading = document.getElementById("modal-preview-loading");
        const fallback = document.getElementById("modal-preview-fallback");

        if (fallback) fallback.classList.add("hidden");

        const embedUrl = this.getEmbedPreviewUrl(fileUrl);

        if (badgeMeta.isImage && fileUrl && (fileUrl.startsWith("data:image") || fileUrl.includes("drive.google.com/thumbnail") || /\.(png|jpe?g|webp|gif)($|\?)/i.test(fileUrl))) {
            // Mode Gambar Langsung
            if (loading) loading.classList.add("hidden");
            if (iframe) {
                iframe.classList.add("hidden");
                iframe.src = "about:blank";
            }
            if (imgContainer && imgEl) {
                imgEl.src = fileUrl;
                imgContainer.classList.remove("hidden");
            }
        } else if (embedUrl) {
            // Mode Iframe Google Drive Preview
            if (imgContainer) imgContainer.classList.add("hidden");
            if (iframe) {
                iframe.classList.remove("hidden");
                if (loading) loading.classList.remove("hidden");

                let loaded = false;
                iframe.onload = () => {
                    loaded = true;
                    if (loading) loading.classList.add("hidden");
                };

                if (this._previewTimer) clearTimeout(this._previewTimer);
                this._previewTimer = setTimeout(() => {
                    if (!loaded && loading) {
                        loading.classList.add("hidden");
                    }
                }, 8000);

                iframe.src = embedUrl;
            }
        } else {
            // Berkas Tidak Memiliki URL yang Valid
            if (loading) loading.classList.add("hidden");
            if (iframe) {
                iframe.classList.add("hidden");
                iframe.src = "about:blank";
            }
            if (imgContainer) imgContainer.classList.add("hidden");
            if (fallback) fallback.classList.remove("hidden");
        }

        // Tampilkan Modal
        document.getElementById("modal-verifikasi").classList.remove("hidden");

        // Auto-focus pada pilihan status
        setTimeout(() => {
            if (statusSelect) statusSelect.focus();
        }, 50);

        // Shortcut keyboard enter untuk simpan
        if (catatanInput) {
            catatanInput.onkeydown = (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.simpanVerifikasi();
                }
            };
        }

        // Handler Escape untuk menutup modal
        if (this._escHandler) window.removeEventListener("keydown", this._escHandler);
        this._escHandler = (e) => {
            if (e.key === "Escape") {
                this.closeModalVerifikasi();
            }
        };
        window.addEventListener("keydown", this._escHandler);
    },

    closeModalVerifikasi() {
        if (this._escHandler) {
            window.removeEventListener("keydown", this._escHandler);
            this._escHandler = null;
        }
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
            this._previewTimer = null;
        }
        const iframe = document.getElementById("modal-preview-iframe");
        if (iframe) {
            iframe.src = "about:blank";
        }
        const imgEl = document.getElementById("modal-preview-image");
        if (imgEl) {
            imgEl.src = "";
        }
        document.getElementById("modal-verifikasi").classList.add("hidden");
        this.activeSelectedId = "";
        this.activeTargetSheet = "";
    },

    simpanVerifikasi() {
        const statusVerifikasi = document.getElementById("modal-status").value;
        const catatanVerifikasi = document.getElementById("modal-catatan").value.trim();
        const idLaporan = this.activeSelectedId;
        const targetSheet = this.activeTargetSheet;

        this.closeModalVerifikasi();

        if (typeof LiveSync !== "undefined") {
            LiveSync.optimisticVerifyReport(idLaporan, statusVerifikasi, catatanVerifikasi, targetSheet);
            if (this.activeFolderSekolahName && document.getElementById("wrapper-folder-sekolah-table") && !document.getElementById("wrapper-folder-sekolah-table").classList.contains("hidden")) {
                this.openFolderSekolahTable(this.activeFolderSekolahType, this.activeFolderSekolahName, this.activeFolderSekolahSchool);
            } else if (this.selectedTypeState) {
                this.openSubFolderTable(targetSheet === "Laporan_Kepsek" ? "kepsek" : "guru", this.selectedTypeState);
            }
            const type = (targetSheet === "Laporan_Kepsek") ? "kepsek" : "guru";
            this.renderSummaryPoinPenting(type);
            this.updateBadgeCounts();
        }
    },

    /**
     * Mendapatkan ikon representatif sesuai format file (Excel, Word, Docs, PDF, Gambar)
     */
    getFileIcon(fileUrl = "", namaFile = "", kategori = "") {
        const str = ((namaFile || "") + " " + (fileUrl || "") + " " + (kategori || "")).toLowerCase();
        if (str.includes(".xlsx") || str.includes(".xls") || str.includes(".csv") || str.includes("excel") || str.includes("spreadsheet")) {
            return `<i class="fa-solid fa-file-excel text-emerald-600"></i>`;
        }
        if (str.includes(".docx") || str.includes(".doc") || str.includes("word") || str.includes("docs")) {
            return `<i class="fa-solid fa-file-word text-blue-600"></i>`;
        }
        if (str.includes(".jpg") || str.includes(".jpeg") || str.includes(".png") || str.includes(".webp") || str.includes("gambar") || str.includes("foto")) {
            return `<i class="fa-solid fa-file-image text-amber-500"></i>`;
        }
        return `<i class="fa-solid fa-file-pdf text-rose-500"></i>`;
    },

    /**
     * Update Tampilan Nama File yang Dipilih (Mendukung Excel, Word, Docs, PDF, JPG, PNG)
     */
    updateFileName() {
        const input = document.getElementById('file-upload');
        const display = document.getElementById('file-name-display');
        const nameText = document.getElementById('file-name-text');
        const sizeText = document.getElementById('file-size-text');
        const iconDisplay = document.getElementById('file-icon-display');

        if (!input || !display) return;

        if (input.files && input.files.length > 0) {
            const file = input.files[0];

            // Validasi batas ukuran file (maksimal 25 MB)
            const maxBytes = 25 * 1024 * 1024;
            if (file.size > maxBytes) {
                if (typeof App !== "undefined" && App.showToast) {
                    App.showToast("Ukuran berkas melebihi batas maksimal 25 MB. Silakan pilih berkas yang lebih kecil.", "error");
                } else {
                    alert("Ukuran berkas melebihi batas maksimal 25 MB.");
                }
                input.value = "";
                display.classList.add('hidden');
                return;
            }

            // Hitung format ukuran file
            let sizeFormatted = "";
            if (file.size < 1024) {
                sizeFormatted = file.size + " B";
            } else if (file.size < 1024 * 1024) {
                sizeFormatted = (file.size / 1024).toFixed(1) + " KB";
            } else {
                sizeFormatted = (file.size / (1024 * 1024)).toFixed(2) + " MB";
            }

            // Dapatkan ekstensi & ikon representatif
            const ext = file.name.split('.').pop().toLowerCase();
            let iconHtml = `<i class="fa-solid fa-file-lines text-blue-500"></i>`;
            if (['xlsx', 'xls', 'csv'].includes(ext)) {
                iconHtml = `<i class="fa-solid fa-file-excel text-emerald-600"></i>`;
            } else if (['doc', 'docx'].includes(ext)) {
                iconHtml = `<i class="fa-solid fa-file-word text-blue-600"></i>`;
            } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
                iconHtml = `<i class="fa-solid fa-file-image text-amber-500"></i>`;
            } else if (ext === 'pdf') {
                iconHtml = `<i class="fa-solid fa-file-pdf text-rose-500"></i>`;
            }

            if (nameText) nameText.innerText = file.name;
            if (sizeText) sizeText.innerText = `Ukuran: ${sizeFormatted} • Format .${ext.toUpperCase()}`;
            if (iconDisplay) iconDisplay.innerHTML = iconHtml;

            display.classList.remove('hidden');
        } else {
            display.classList.add('hidden');
        }
    },

    /**
     * Mengisi dropdown "Jenis Pelaporan (Folder Tujuan)" secara dinamis sesuai folder yang aktif ada di sistem
     */
    populateUploadFolders() {
        const select = document.getElementById("jenis-pelaporan");
        const submitBtn = document.getElementById("btn-submit-laporan");
        if (!select) return;

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (!currentUser) return;

        const role = currentUser.role;
        const schoolName = (currentUser.asal_sekolah || "").trim();
        const isKepsek = role === "Kepala Sekolah" || role === "Kepsek";

        const allFolders = (typeof LiveSync !== "undefined" && LiveSync.state.folders) 
            ? LiveSync.state.folders 
            : (typeof DriveManager !== "undefined" && DriveManager.cachedFolders ? DriveManager.cachedFolders : []);

        const hiddenList = (typeof LiveSync !== "undefined" && LiveSync.state.hiddenDefaultFolders) 
            ? LiveSync.state.hiddenDefaultFolders 
            : [];
        let localHidden = [];
        try {
            localHidden = JSON.parse(localStorage.getItem("pantausekolah_hidden_default_folders") || "[]");
        } catch (e) {}

        const isDeletedInFolders = (type) => {
            const lowerType = type.toLowerCase();
            return allFolders.some(f => {
                if (!f.namaFolder) return false;
                const fn = f.namaFolder.toLowerCase();
                if (!fn.includes(`__deleted__:${lowerType}`)) return false;
                const fSchool = (f.namaSekolah || "").trim().toLowerCase();
                const tSchool = schoolName.toLowerCase();
                return f.targetType === "all" || !fSchool || fSchool === tSchool;
            });
        };

        const activeFolders = [];

        if (isKepsek) {
            // Folder Kepala Sekolah: HANYA folder kustom yang dibuat pengawas untuk sekolah ini (subCategory === 'kepsek')
            allFolders.forEach(f => {
                if (!f.namaFolder || f.namaFolder.startsWith("__DELETED__:") || (f.id && f.id.toString().startsWith("DEL-"))) return;
                if (ReportManager.isFolderForSchool(f, schoolName) && f.subCategory === "kepsek") {
                    if (!activeFolders.includes(f.namaFolder)) {
                        activeFolders.push(f.namaFolder);
                    }
                }
            });
        } else {
            // Guru: HANYA folder yang benar-benar ada di allFolders untuk sekolah ini
            allFolders.forEach(f => {
                if (!f.namaFolder || f.namaFolder.startsWith("__DELETED__:") || (f.id && f.id.toString().startsWith("DEL-"))) return;
                const isGuruFolder = !f.subCategory || f.subCategory === "guru" || f.subCategory === "root";
                if (ReportManager.isFolderForSchool(f, schoolName) && isGuruFolder) {
                    if (!activeFolders.includes(f.namaFolder)) {
                        activeFolders.push(f.namaFolder);
                    }
                }
            });
        }

        if (activeFolders.length === 0) {
            select.innerHTML = `<option value="" disabled selected>⚠️ Belum ada folder laporan aktif. Hubungi ${isKepsek ? 'Pengawas' : 'Kepala Sekolah / Pengawas'}.</option>`;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.classList.add("opacity-50", "cursor-not-allowed");
            }
        } else {
            const currentVal = select.value;
            select.innerHTML = activeFolders.map(name => {
                return `<option value="${name}">${name}</option>`;
            }).join("");

            if (currentVal && activeFolders.includes(currentVal)) {
                select.value = currentVal;
            } else {
                select.selectedIndex = 0;
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
            }
        }

        // Render rekomendasi poin penting sesuai role pengguna
        this.renderPoinPentingSuggestions();
    },

    /**
     * Mengunggah Berkas Laporan Baru ke Google Drive & Sheets
     */
    async submitUploadReport() {
        if (this._isSubmittingUpload) {
            console.warn("Upload sedang berlangsung, mencegah pengiriman ganda...");
            return;
        }

        const user = AuthService.getUser();
        const fileInput = document.getElementById('file-upload').files[0];
        const jenisPelaporanSelect = document.getElementById('jenis-pelaporan');
        const jenisPelaporan = jenisPelaporanSelect ? jenisPelaporanSelect.value : "";
        const kategoriSelect = document.getElementById('kategori-laporan');
        const kategoriVal = kategoriSelect ? kategoriSelect.value : "";
        const poinPentingInput = document.getElementById('poin-penting-laporan');
        const poinPenting = poinPentingInput ? poinPentingInput.value.trim() : "";

        if (!jenisPelaporan) {
            App.showToast("Harap pilih jenis pelaporan / folder tujuan terlebih dahulu!", "error");
            return;
        }

        if (!fileInput) {
            App.showToast("Harap pilih berkas laporan terlebih dahulu!", "error");
            return;
        }

        let kategori = jenisPelaporan;
        if (kategoriVal && kategoriVal !== "Umum" && kategoriVal !== jenisPelaporan) {
            kategori = `[${jenisPelaporan}] ${kategoriVal}`;
        }

        const btnSubmit = document.getElementById('btn-submit-laporan');
        const loadingIndicator = document.getElementById('loading-indicator-upload');

        this._isSubmittingUpload = true;
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.classList.add("hidden");
        }
        if (loadingIndicator) {
            loadingIndicator.classList.remove("hidden");
        }

        const reader = new FileReader();
        reader.readAsDataURL(fileInput);

        reader.onload = async () => {
            const fileBase64 = reader.result;

            // Pastikan MIME type terdefinisi dengan tepat (khususnya berkas Office pada Windows)
            let mimeType = (fileInput.type || "").trim();
            if (!mimeType || mimeType === "application/octet-stream") {
                const ext = fileInput.name.split('.').pop().toLowerCase();
                const mimeMap = {
                    'pdf': 'application/pdf',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'xls': 'application/vnd.ms-excel',
                    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'csv': 'text/csv',
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'png': 'image/png',
                    'webp': 'image/webp'
                };
                mimeType = mimeMap[ext] || 'application/octet-stream';
            }

            try {
                const uploadTimeout = (typeof CONFIG !== "undefined" && CONFIG.UPLOAD_TIMEOUT_MS) ? CONFIG.UPLOAD_TIMEOUT_MS : 120000;
                const res = await ApiService.post({
                    action: "upload",
                    nama: user.nama,
                    role: user.role,
                    asal_sekolah: user.asal_sekolah,
                    jenisPelaporan: jenisPelaporan,
                    kategori: kategori,
                    poinPenting: poinPenting,
                    filename: fileInput.name,
                    mimeType: mimeType,
                    filebase64: fileBase64
                }, uploadTimeout);

                if (res.status === "success") {
                    App.showToast("Dokumen berhasil diunggah ke Google Drive & Sheets!", "success");
                    document.getElementById("upload-form").reset();
                    if (poinPentingInput) poinPentingInput.value = "";
                    const nameDisplay = document.getElementById('file-name-display');
                    if (nameDisplay) nameDisplay.classList.add("hidden");
                    if (typeof LiveSync !== "undefined") {
                        LiveSync.sync({ silent: true });
                    }
                    App.switchTab('dashboard');
                } else {
                    App.showToast("Gagal mengunggah: " + res.message, "error");
                }
            } catch (err) {
                const errMsg = (err && err.message) ? err.message : "";
                const isTimeout = errMsg.toLowerCase().includes("timeout") || (err && err.name === "AbortError");

                if (isTimeout) {
                    App.showToast("Proses unggah memakan waktu lebih lama. Dokumen sedang disimpan ke Google Drive, silakan periksa dashboard.", "warning");
                    document.getElementById("upload-form").reset();
                    if (poinPentingInput) poinPentingInput.value = "";
                    const nameDisplay = document.getElementById('file-name-display');
                    if (nameDisplay) nameDisplay.classList.add("hidden");
                    setTimeout(() => {
                        if (typeof LiveSync !== "undefined") {
                            LiveSync.sync({ silent: true });
                        }
                        App.switchTab('dashboard');
                    }, 3500);
                } else {
                    App.showToast(errMsg || "Terjadi kesalahan saat mengunggah berkas.", "error");
                }
            } finally {
                this._isSubmittingUpload = false;
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.classList.remove("hidden");
                }
                if (loadingIndicator) {
                    loadingIndicator.classList.add("hidden");
                }
            }
        };

        reader.onerror = () => {
            this._isSubmittingUpload = false;
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.classList.remove("hidden");
            }
            if (loadingIndicator) {
                loadingIndicator.classList.add("hidden");
            }
            App.showToast("Gagal membaca berkas di perangkat Anda.", "error");
        };
    },

    /**
     * Tampilkan state kosong pada modul Folder Dokumen Sekolah
     */
    renderFolderSekolahEmptyState(message) {
        const emptyWrapper = document.getElementById("wrapper-folder-sekolah-empty");
        const contentWrapper = document.getElementById("wrapper-folder-sekolah-content");
        const msgEl = document.getElementById("label-folder-sekolah-empty-msg");

        if (contentWrapper) contentWrapper.classList.add("hidden");
        if (emptyWrapper) {
            emptyWrapper.classList.remove("hidden");
            if (msgEl && message) msgEl.innerText = message;
        }
    },

    /**
     * Memuat modul khusus: Folder Dokumen Sekolah (Dedicated untuk Kepala Sekolah & Pengawas)
     */
    loadFolderSekolahView() {
        const user = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (!user) return;

        const isKepsek = user.role === "Kepala Sekolah" || user.role === "Kepsek";
        const isPengawas = user.role === "Pengawas";

        const schools = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.schools) 
            ? DashboardManager.cachedData.schools 
            : [];

        let schoolName = "";
        if (isKepsek) {
            schoolName = (user.asal_sekolah || "").trim();
            if (!schoolName) {
                this.renderFolderSekolahEmptyState("Data sekolah untuk akun Kepala Sekolah Anda belum dikonfigurasikan.");
                return;
            }
        } else {
            // Pengawas: Periksa apakah ada sekolah binaan yang terdaftar
            if (!schools || schools.length === 0) {
                try {
                    localStorage.removeItem("pantausekolah_folder_sekolah_school");
                } catch (e) {}
                this.selectedSchoolFolderSekolah = null;
                this.renderFolderSekolahEmptyState("Belum ada laporan atau data sekolah binaan yang terdaftar pada sistem.");
                return;
            }

            // Validasi savedSchool di localStorage apakah masih ada di daftar schools
            let savedSchool = null;
            try {
                savedSchool = localStorage.getItem("pantausekolah_folder_sekolah_school");
            } catch (e) {}

            const savedSchoolExists = savedSchool && schools.some(s => (s.nama || "").toLowerCase() === savedSchool.toLowerCase());

            if (savedSchool && savedSchoolExists) {
                schoolName = savedSchool;
            } else if (this.selectedSchoolFolderSekolah && schools.some(s => (s.nama || "").toLowerCase() === this.selectedSchoolFolderSekolah.toLowerCase())) {
                schoolName = this.selectedSchoolFolderSekolah;
            } else {
                schoolName = schools[0] ? schools[0].nama : "";
            }

            if (!schoolName) {
                try {
                    localStorage.removeItem("pantausekolah_folder_sekolah_school");
                } catch (e) {}
                this.selectedSchoolFolderSekolah = null;
                this.renderFolderSekolahEmptyState("Belum ada data sekolah binaan yang terdaftar.");
                return;
            }
        }

        this.selectedSchoolFolderSekolah = schoolName;
        this.renderFolderSekolahView(schoolName);

        // Background live sync
        if (typeof LiveSync !== "undefined") {
            LiveSync.sync({ silent: true });
        }
    },

    /**
     * Render Tampilan Folder Dokumen Sekolah
     * Memisahkan secara tegas Folder Guru (Dapat Dikelola & Dihapus) dan Folder Kepala Sekolah (Terkunci & Dilindungi)
     */
    renderFolderSekolahView(schoolName) {
        const user = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (!user) return;

        const isPengawas = user.role === "Pengawas";
        const isKepsek = user.role === "Kepala Sekolah" || user.role === "Kepsek";

        const schoolsMeta = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.schools) 
            ? DashboardManager.cachedData.schools 
            : [];

        if (isPengawas) {
            if (!schoolsMeta || schoolsMeta.length === 0) {
                try {
                    localStorage.removeItem("pantausekolah_folder_sekolah_school");
                } catch (e) {}
                this.selectedSchoolFolderSekolah = null;
                this.renderFolderSekolahEmptyState("Belum ada laporan atau data sekolah binaan yang terdaftar pada sistem.");
                return;
            }
            const target = (schoolName || this.selectedSchoolFolderSekolah || "").trim();
            const exists = target && schoolsMeta.some(s => (s.nama || "").toLowerCase() === target.toLowerCase());
            if (!exists) {
                schoolName = schoolsMeta[0].nama;
            }
        }

        const targetSchool = (schoolName || this.selectedSchoolFolderSekolah || (user.asal_sekolah || "")).trim();
        if (!targetSchool) {
            this.renderFolderSekolahEmptyState("Belum ada data sekolah yang dipilih.");
            return;
        }

        // Tampilkan konten dan sembunyikan tampilan kosong
        const emptyWrapper = document.getElementById("wrapper-folder-sekolah-empty");
        const contentWrapper = document.getElementById("wrapper-folder-sekolah-content");
        if (emptyWrapper) emptyWrapper.classList.add("hidden");
        if (contentWrapper) contentWrapper.classList.remove("hidden");

        this.selectedSchoolFolderSekolah = targetSchool;
        this.selectedSchoolState = targetSchool;
        try {
            localStorage.setItem("pantausekolah_folder_sekolah_school", targetSchool);
        } catch (e) {}
        const safeTargetSchool = targetSchool.replace(/'/g, "\\'");

        // 1. Ambil URL Drive Utama Sekolah
        const schoolObj = schoolsMeta.find(s => (s.nama || "").toLowerCase() === targetSchool.toLowerCase());
        const schoolDriveUrl = schoolObj ? (schoolObj.driveUrl || schoolObj.driveFolderUrl || "") : (user.asal_sekolah && user.asal_sekolah.toLowerCase() === targetSchool.toLowerCase() ? (user.drive_url || "") : "");

        // 2. Update Header
        const titleEl = document.getElementById("folder-sekolah-title");
        const badgeEl = document.getElementById("folder-sekolah-badge");
        const rootDriveBtn = document.getElementById("folder-sekolah-root-drive-btn");
        const addFolderBtn = document.getElementById("folder-sekolah-add-btn");

        if (titleEl) titleEl.innerText = `Folder Dokumen: ${targetSchool}`;
        if (badgeEl) badgeEl.innerText = targetSchool;
        if (rootDriveBtn) {
            if (!isPengawas) {
                rootDriveBtn.classList.add("hidden");
                rootDriveBtn.style.display = "none";
            } else {
                rootDriveBtn.classList.remove("hidden");
                rootDriveBtn.style.display = "inline-flex";
                if (schoolDriveUrl && schoolDriveUrl !== "#" && schoolDriveUrl !== "undefined") {
                    rootDriveBtn.href = schoolDriveUrl;
                    rootDriveBtn.classList.remove("opacity-50", "pointer-events-none");
                } else {
                    rootDriveBtn.href = "#";
                    rootDriveBtn.classList.add("opacity-50", "pointer-events-none");
                }
            }
        }
        if (addFolderBtn) {
            addFolderBtn.style.display = (isPengawas || isKepsek) ? "inline-flex" : "none";
        }
        const addKepsekFolderBtn = document.getElementById("folder-sekolah-add-kepsek-btn");
        if (addKepsekFolderBtn) {
            addKepsekFolderBtn.style.display = (isPengawas || isKepsek) ? "inline-flex" : "none";
        }

        // 3. Switcher Sekolah (Hanya untuk Pengawas jika memiliki banyak sekolah binaan)
        const switcherWrapper = document.getElementById("wrapper-folder-sekolah-switcher");
        const pillsContainer = document.getElementById("pills-folder-sekolah-schools");
        if (switcherWrapper && pillsContainer) {
            // Pastikan daftar sekolah unik (tidak ada duplikasi)
            const uniqueSchools = [];
            const seenNames = new Set();
            schoolsMeta.forEach(s => {
                const sName = (s.nama || "").trim();
                if (sName && !seenNames.has(sName.toLowerCase())) {
                    seenNames.add(sName.toLowerCase());
                    uniqueSchools.push(s);
                }
            });

            if (isPengawas && uniqueSchools.length > 1) {
                switcherWrapper.classList.remove("hidden");
                pillsContainer.innerHTML = uniqueSchools.map(s => {
                    const isSelected = (s.nama || "").toLowerCase() === targetSchool.toLowerCase();
                    const activeClass = isSelected 
                        ? "bg-indigo-600 text-white font-bold shadow-xs" 
                        : "bg-[#FAF7F0] text-slate-600 hover:bg-[#F0EBE1] font-semibold border border-[#E8E2D5]";
                    const safeName = (s.nama || "").replace(/'/g, "\\'");
                    return `
                        <button onclick="ReportManager.renderFolderSekolahView('${safeName}')"
                            class="px-3 py-1.5 rounded-xl text-xs transition-all ${activeClass}">
                            ${s.nama}
                        </button>
                    `;
                }).join("");
            } else {
                switcherWrapper.classList.add("hidden");
            }
        }

        // =====================================================================
        // BAGIAN 1: RENDER FOLDER GURU (DAPAT DIKELOLA & DIHAPUS)
        // =====================================================================
        const gridGuru = document.getElementById("grid-folder-sekolah-guru");
        if (gridGuru) {
            const rawGuru = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsGuru) 
                ? DashboardManager.cachedData.reportsGuru 
                : [];
            const schoolReportsGuru = rawGuru.filter(x => (x.asalSekolah || "").toLowerCase() === targetSchool.toLowerCase());

            const countMingguan = schoolReportsGuru.filter(x => (x.jenisPelaporan || x.kategori || '').includes("Mingguan") || !(x.jenisPelaporan || x.kategori || '').includes("Daring")).length;
            const countDaring = schoolReportsGuru.filter(x => (x.jenisPelaporan || x.kategori || '').includes("Daring")).length;

            // Ambil custom folders dari LiveSync atau DriveManager
            const allFolders = (typeof LiveSync !== "undefined" && LiveSync.state.folders) 
                ? LiveSync.state.folders 
                : (typeof DriveManager !== "undefined" && DriveManager.cachedFolders ? DriveManager.cachedFolders : []);

            const customFoldersGuru = allFolders.filter(f => {
                if (!f.namaFolder || f.namaFolder.startsWith("__DELETED__:") || (f.id && f.id.toString().startsWith("DEL-"))) return false;
                const isGuru = !f.subCategory || f.subCategory === "guru" || f.subCategory === "root";
                return ReportManager.isFolderForSchool(f, targetSchool) && isGuru;
            });

            // Deduplikasi folder berdasarkan nama folder agar tidak muncul ganda
            const seenGuruNames = new Set();
            const uniqueFoldersGuru = [];
            for (const f of customFoldersGuru) {
                const key = (f.namaFolder || "").trim().toLowerCase();
                if (!seenGuruNames.has(key)) {
                    seenGuruNames.add(key);
                    uniqueFoldersGuru.push(f);
                }
            }

            let htmlGuru = "";

            // Folder Guru (Hanya merender folder yang ada di database)
            uniqueFoldersGuru.forEach(f => {
                const countCustom = schoolReportsGuru.filter(x => {
                    const repType = (x.jenisPelaporan || x.kategori || '').toLowerCase();
                    return repType.includes(f.namaFolder.toLowerCase());
                }).length;
                const safeFldName = f.namaFolder.replace(/'/g, "\\'");

                htmlGuru += `
                    <div onclick="ReportManager.openFolderSekolahTable('guru', '${safeFldName}', '${safeTargetSchool}')"
                        class="bg-white p-5 rounded-2xl border border-[#E8E2D5] shadow-xs hover:shadow-md hover:border-emerald-500 transition-all cursor-pointer group flex flex-col justify-between gap-3 overflow-hidden">
                        <div class="flex items-start justify-between gap-3 w-full min-w-0">
                            <div class="flex items-start gap-3.5 min-w-0 flex-1">
                                <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-all flex-shrink-0">
                                    <i class="fa-solid fa-folder-open"></i>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <h4 class="font-bold text-slate-800 text-sm group-hover:text-emerald-700 transition-colors leading-snug break-words line-clamp-2" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;" title="${f.namaFolder}">${f.namaFolder}</h4>
                                    <p class="text-[11px] text-slate-400 mt-0.5">Folder Dokumen Guru</p>
                                    <span class="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">${countCustom} Berkas</span>
                                </div>
                            </div>
                            <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-emerald-600 text-xs flex-shrink-0 mt-1"></i>
                        </div>
                        <div class="pt-3 border-t border-[#F0EBE1] flex items-center justify-between text-xs" onclick="event.stopPropagation()">
                            ${(isPengawas && f.driveFolderUrl) ? `
                                <a href="${f.driveFolderUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                    <i class="fa-brands fa-google-drive"></i> Buka Drive
                                </a>
                            ` : '<span class="text-[10px] text-slate-400 font-medium flex items-center gap-1"><i class="fa-solid fa-folder-closed text-slate-300"></i> Buka di Aplikasi</span>'}
                            ${(isPengawas || isKepsek) ? `
                                <button onclick="event.stopPropagation(); ReportManager.confirmDeleteGuruFolder('${f.id}', '${safeFldName}', '${safeTargetSchool}')" title="Hapus Folder" class="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-200 transition-colors">
                                    <i class="fa-solid fa-trash-can text-[11px]"></i> Hapus
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            });

            if (!htmlGuru.trim()) {
                htmlGuru = `
                    <div class="col-span-full bg-white p-7 rounded-2xl border border-[#E8E2D5] text-center text-slate-400 space-y-2">
                        <i class="fa-solid fa-folder-open text-2xl text-slate-300"></i>
                        <p class="font-bold text-xs text-slate-600">Belum Ada Folder Guru</p>
                        <p class="text-[11px] text-slate-400">Klik tombol '+ Tambah Folder Guru' di atas untuk membuat folder baru.</p>
                    </div>
                `;
            }

            gridGuru.innerHTML = htmlGuru;
        }

        // =====================================================================
        // BAGIAN 2: RENDER FOLDER KEPALA SEKOLAH (TERKUNCI & TIDAK BISA DIHAPUS OLEH KEPSEK)
        // =====================================================================
        const gridKepsek = document.getElementById("grid-folder-sekolah-kepsek");
        if (gridKepsek) {
            const rawKepsek = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsKepsek) 
                ? DashboardManager.cachedData.reportsKepsek 
                : [];
            const schoolReportsKepsek = rawKepsek.filter(x => (x.asalSekolah || "").toLowerCase() === targetSchool.toLowerCase());

            const countManajerial = schoolReportsKepsek.filter(x => (x.kategori || '').toLowerCase().includes("manajerial")).length;
            const countKewirausahaan = schoolReportsKepsek.filter(x => (x.kategori || '').toLowerCase().includes("kewirausahaan")).length;
            const countSupervisi = schoolReportsKepsek.filter(x => (x.kategori || '').toLowerCase().includes("supervisi")).length;

            const allFolders = (typeof LiveSync !== "undefined" && LiveSync.state.folders) 
                ? LiveSync.state.folders 
                : (typeof DriveManager !== "undefined" && DriveManager.cachedFolders ? DriveManager.cachedFolders : []);

            const customFoldersKepsek = allFolders.filter(f => {
                if (!f.namaFolder || f.namaFolder.startsWith("__DELETED__:") || (f.id && f.id.toString().startsWith("DEL-"))) return false;
                return ReportManager.isFolderForSchool(f, targetSchool) && f.subCategory === "kepsek";
            });

            // Deduplikasi folder berdasarkan nama folder agar tidak muncul ganda
            const seenKepsekNames = new Set();
            const uniqueFoldersKepsek = [];
            for (const f of customFoldersKepsek) {
                const key = (f.namaFolder || "").trim().toLowerCase();
                if (!seenKepsekNames.has(key)) {
                    seenKepsekNames.add(key);
                    uniqueFoldersKepsek.push(f);
                }
            }

            const hiddenList = (typeof LiveSync !== "undefined" && LiveSync.state.hiddenDefaultFolders) 
                ? LiveSync.state.hiddenDefaultFolders 
                : [];
            let localHidden = [];
            try {
                localHidden = JSON.parse(localStorage.getItem("pantausekolah_hidden_default_folders") || "[]");
            } catch (e) {}

            const isDeletedInFolders = (type) => {
                const lowerType = type.toLowerCase();
                return allFolders.some(f => {
                    if (!f.namaFolder) return false;
                    const fn = f.namaFolder.toLowerCase();
                    if (!fn.includes(`__deleted__:${lowerType}`)) return false;
                    const fSchool = (f.namaSekolah || "").trim().toLowerCase();
                    const tSchool = targetSchool.trim().toLowerCase();
                    return f.targetType === "all" || !fSchool || fSchool === tSchool;
                });
            };

            let htmlKepsek = "";

            // Folder Kepala Sekolah yang Dibuat Pengawas (Tidak ada folder hardcoded default)
            uniqueFoldersKepsek.forEach(f => {
                const countCustom = schoolReportsKepsek.filter(x => {
                    const repType = (x.jenisPelaporan || x.kategori || '').toLowerCase();
                    return repType.includes(f.namaFolder.toLowerCase());
                }).length;
                const safeFldName = f.namaFolder.replace(/'/g, "\\'");

                htmlKepsek += `
                    <div onclick="ReportManager.openFolderSekolahTable('kepsek', '${safeFldName}', '${safeTargetSchool}')"
                        class="bg-white p-5 rounded-2xl border border-[#E8E2D5] shadow-xs hover:shadow-md hover:border-amber-500 transition-all cursor-pointer group flex flex-col justify-between gap-3 overflow-hidden">
                        <div class="flex items-start justify-between gap-3 w-full min-w-0">
                            <div class="flex items-start gap-3.5 min-w-0 flex-1">
                                <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold border border-amber-100 group-hover:bg-amber-600 group-hover:text-white transition-all flex-shrink-0">
                                    <i class="fa-solid fa-folder-closed"></i>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <h4 class="font-bold text-slate-800 text-sm group-hover:text-amber-700 transition-colors leading-snug break-words line-clamp-2" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;" title="${f.namaFolder}">${f.namaFolder}</h4>
                                    <p class="text-[11px] text-slate-400 mt-0.5">Folder Khusus Kepala Sekolah</p>
                                    <span class="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md border border-amber-100">${countCustom} Berkas</span>
                                </div>
                            </div>
                            <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-amber-600 text-xs flex-shrink-0 mt-1"></i>
                        </div>
                        <div class="pt-3 border-t border-[#F0EBE1] flex items-center justify-between text-xs" onclick="event.stopPropagation()">
                            ${(isPengawas && f.driveFolderUrl) ? `
                                <a href="${f.driveFolderUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                    <i class="fa-brands fa-google-drive"></i> Buka Drive
                                </a>
                            ` : `
                                <button onclick="ReportManager.openFolderSekolahTable('kepsek', '${safeFldName}', '${safeTargetSchool}')" class="text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-amber-200 transition-colors">
                                    <i class="fa-solid fa-folder-open text-[11px]"></i> Kelola Berkas
                                </button>
                            `}
                            ${(isPengawas || isKepsek) ? `
                                <button onclick="event.stopPropagation(); ReportManager.confirmDeleteGuruFolder('${f.id}', '${safeFldName}', '${safeTargetSchool}')" title="Hapus Folder Khusus Kepala Sekolah" class="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-200 transition-colors">
                                    <i class="fa-solid fa-trash-can text-[11px]"></i> Hapus
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            });

            if (!htmlKepsek.trim()) {
                htmlKepsek = `
                    <div class="col-span-full bg-white p-7 rounded-2xl border border-[#E8E2D5] text-center text-slate-400 space-y-2">
                        <i class="fa-solid fa-folder-closed text-2xl text-amber-300"></i>
                        <p class="font-bold text-xs text-slate-600">Belum Ada Folder Laporan Kepala Sekolah</p>
                        ${isPengawas ? '<p class="text-[11px] text-slate-400">Klik tombol \'+ Tambah Folder Kepala Sekolah\' di atas untuk membuat folder baru.</p>' : '<p class="text-[11px] text-slate-400">Folder dikelola oleh Pengawas Sekolah.</p>'}
                    </div>
                `;
            }

            gridKepsek.innerHTML = htmlKepsek;
        }
    },

    /**
     * Membuka subfolder dokumen sekolah di dalam aplikasi (Khusus tampilan Folder Dokumen Sekolah)
     */
    openFolderSekolahTable(type, folderName, schoolName) {
        this.activeFolderSekolahType = type; // 'guru' | 'kepsek'
        this.activeFolderSekolahName = folderName;
        this.activeFolderSekolahSchool = schoolName || this.selectedSchoolFolderSekolah || this.selectedSchoolState || "";

        const contentWrapper = document.getElementById("wrapper-folder-sekolah-content");
        const tableWrapper = document.getElementById("wrapper-folder-sekolah-table");
        if (contentWrapper) contentWrapper.classList.add("hidden");
        if (tableWrapper) tableWrapper.classList.remove("hidden");

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const currentRole = currentUser ? currentUser.role : "";
        const currentName = currentUser ? (currentUser.nama || "").trim().toLowerCase() : "";
        const currentSchool = currentUser ? (currentUser.asal_sekolah || "").trim().toLowerCase() : "";
        const isPengawas = currentRole === "Pengawas";
        const isKepsek = currentRole === "Kepala Sekolah" || currentRole === "Kepsek";
        const isGuru = currentRole === "Guru";

        const titleEl = document.getElementById("table-folder-sekolah-title");
        const badgeEl = document.getElementById("table-folder-sekolah-badge");
        const subTitleEl = document.getElementById("table-folder-sekolah-subtitle");
        const driveBtn = document.getElementById("btn-folder-sekolah-table-drive");

        if (titleEl) {
            titleEl.innerText = `${folderName}`;
        }
        if (badgeEl) {
            badgeEl.innerText = type === "kepsek" ? "Berkas Kepala Sekolah" : "Berkas Guru";
            badgeEl.className = type === "kepsek" 
                ? "px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                : "px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100";
        }
        if (subTitleEl) {
            subTitleEl.innerText = `${this.activeFolderSekolahSchool} • Kelola berkas laporan`;
        }

        // HANYA Pengawas yang dapat melihat tombol Drive!
        const allFolders = (typeof LiveSync !== "undefined" && LiveSync.state.folders)
            ? LiveSync.state.folders
            : (typeof DriveManager !== "undefined" && DriveManager.cachedFolders ? DriveManager.cachedFolders : []);
        const matchedFolder = allFolders.find(f => {
            const mName = (f.namaFolder || "").trim().toLowerCase() === folderName.trim().toLowerCase();
            return mName && ReportManager.isFolderForSchool(f, this.activeFolderSekolahSchool);
        });

        if (driveBtn) {
            if (isPengawas && matchedFolder && matchedFolder.driveFolderUrl) {
                driveBtn.href = matchedFolder.driveFolderUrl;
                driveBtn.classList.remove("hidden");
            } else {
                driveBtn.classList.add("hidden");
            }
        }

        const tbody = document.getElementById("table-body-folder-sekolah");
        if (!tbody) return;

        const rawData = (type === "kepsek") 
            ? ((typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsKepsek) ? DashboardManager.cachedData.reportsKepsek : [])
            : ((typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsGuru) ? DashboardManager.cachedData.reportsGuru : []);

        const targetSheet = (type === "kepsek") ? "Laporan_Kepsek" : "Laporan_Guru";

        const filtered = rawData.filter(x => {
            const matchSchool = (x.asalSekolah || "").toLowerCase() === (this.activeFolderSekolahSchool || "").toLowerCase();
            if (!matchSchool) return false;

            // Jika Guru: HANYA tampilkan berkas miliknya sendiri
            if (isGuru && type === "guru") {
                const uploaderName = (x.nama || "").trim().toLowerCase();
                if (uploaderName !== currentName) return false;
            }

            const repType = (x.jenisPelaporan || x.kategori || '').toLowerCase();
            const targetName = folderName.toLowerCase();
            return repType.includes(targetName);
        });

        if (filtered.length === 0) {
            const emptyMsg = (isGuru && type === "guru")
                ? `Anda belum mengunggah berkas untuk folder <strong>"${folderName}"</strong>.`
                : `Belum ada berkas untuk folder <strong>"${folderName}"</strong> di sekolah ini.`;

            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="p-8 text-center text-slate-400 font-medium">
                        <div class="max-w-md mx-auto space-y-2">
                            <i class="fa-regular fa-folder-open text-3xl text-slate-300"></i>
                            <p class="text-xs">${emptyMsg}</p>
                            <p class="text-[11px] text-slate-400">Klik tombol '+ Unggah ke Folder Ini' di atas untuk menambahkan berkas baru.</p>
                        </div>
                    </td>
                </tr>`;
            this.clearSelection('folder-sekolah');
            return;
        }

        tbody.innerHTML = "";
        filtered.forEach(item => {
            const itemUploader = (item.nama || "").trim().toLowerCase();
            const itemSchool = (item.asalSekolah || "").trim().toLowerCase();
            const isOwner = currentName && itemUploader === currentName;
            const isSchoolKepsek = (currentRole === "Kepala Sekolah" || currentRole === "Kepsek") && currentSchool && itemSchool === currentSchool;
            const canManage = isPengawas || isOwner || isSchoolKepsek;
            const canDelete = canManage;
            const canEdit = canManage;
            const canVerify = isPengawas || currentRole === "Kepala Sekolah" || currentRole === "Kepsek";
            const isChecked = this.selectedReportIds['folder-sekolah'] && this.selectedReportIds['folder-sekolah'].has(item.id);

            tbody.innerHTML += `
                <tr class="hover:bg-[#FAF7F0] transition-colors border-b border-[#F0EBE1] ${isChecked ? 'bg-blue-50/40' : ''}">
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <input type="checkbox" class="report-row-cb-folder-sekolah w-4 h-4 rounded text-blue-600 border-[#D5CEBF] focus:ring-blue-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            value="${item.id}"
                            ${!canDelete ? 'disabled title="Anda tidak memiliki izin menghapus berkas ini"' : ''}
                            ${isChecked ? 'checked' : ''}
                            onchange="ReportManager.onRowCheckboxChange('folder-sekolah', this, '${item.id}')">
                    </td>
                    <td class="p-3.5 whitespace-nowrap">
                        <p class="font-bold text-slate-800 font-mono text-xs">${item.id}</p>
                        <p class="text-[10px] text-slate-400 font-medium">${item.tanggal}</p>
                    </td>
                    <td class="p-3.5 font-bold text-slate-800 whitespace-nowrap">${item.nama}</td>
                    <td class="p-3.5 text-slate-700 min-w-[200px] max-w-[340px]">
                        <div class="font-bold text-slate-800 text-xs">${item.kategori}</div>
                        <div class="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed bg-amber-50/70 p-1.5 rounded-lg border border-amber-200/80" title="${ReportManager.getPoinPenting(item).replace(/"/g, '&quot;')}">
                            <span class="font-semibold text-amber-800"><i class="fa-solid fa-list-check text-amber-600 text-[10px] mr-1"></i>Poin:</span> ${ReportManager.getPoinPenting(item).replace(/\n/g, ' ')}
                        </div>
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        ${isPengawas ? `
                            <a href="${item.fileUrl}" target="_blank" class="inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-700 font-bold bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 px-2.5 py-1 rounded-lg text-xs transition-colors shadow-2xs">
                                ${ReportManager.getFileIcon(item.fileUrl, item.namaFile || item.filename, item.kategori)} <span>Buka Berkas</span>
                            </a>
                        ` : `
                            <button onclick="ReportManager.openModalVerifikasi('${item.id}', '${item.nama.replace(/'/g, "\\'")}', '${item.status}', '${(item.catatan || '').replace(/'/g, "\\'")}', '${targetSheet}')" class="inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-700 font-bold bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 px-2.5 py-1 rounded-lg text-xs transition-colors shadow-2xs cursor-pointer">
                                ${ReportManager.getFileIcon(item.fileUrl, item.namaFile || item.filename, item.kategori)} <span>Pratinjau</span>
                            </button>
                        `}
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">${DashboardManager.getStatusBadge(item.status)}</td>
                    <td class="p-3.5 text-slate-600 text-xs max-w-[200px] truncate" title="${item.catatan && item.catatan !== '-' ? item.catatan : ''}">
                        ${item.catatan && item.catatan !== '-' && item.catatan !== 'Belum ada catatan' ? `<span class="italic text-slate-700 font-medium">"${item.catatan}"</span>` : '<span class="text-slate-400">-</span>'}
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <div class="inline-flex items-center justify-center gap-1.5">
                            ${canVerify ? `
                                <button onclick="ReportManager.openModalVerifikasi('${item.id}', '${item.nama}', '${item.status}', '${item.catatan}', '${targetSheet}')" title="Verifikasi Laporan" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1.5 rounded-xl shadow-sm text-xs transition-colors flex items-center gap-1">
                                    <i class="fa-solid fa-file-circle-check"></i> <span class="hidden md:inline">Verifikasi</span>
                                </button>
                            ` : ''}
                            ${canEdit ? `
                                <button onclick="ReportManager.openEditReportModal('${item.id}', '${targetSheet}')" title="Edit & Perbarui Laporan" class="bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-2.5 py-1.5 rounded-xl border border-amber-200 text-xs transition-colors flex items-center gap-1">
                                    <i class="fa-solid fa-pen-to-square"></i> <span class="hidden md:inline">Edit</span>
                                </button>
                            ` : ''}
                            ${canDelete ? `
                                <button onclick="ReportManager.confirmDeleteReport('${item.id}', '${item.nama}', '${targetSheet}')" title="Hapus Laporan" class="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2.5 py-1.5 rounded-xl border border-rose-200 text-xs transition-colors">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            ` : ''}
                            ${!canVerify && !canManage ? `<span class="text-slate-400 text-xs">-</span>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        this.updateBulkBar('folder-sekolah');
    },

    backToFolderSekolahGrid() {
        const contentWrapper = document.getElementById("wrapper-folder-sekolah-content");
        const tableWrapper = document.getElementById("wrapper-folder-sekolah-table");
        if (tableWrapper) tableWrapper.classList.add("hidden");
        if (contentWrapper) contentWrapper.classList.remove("hidden");
        this.renderFolderSekolahView(this.activeFolderSekolahSchool || this.selectedSchoolFolderSekolah);
    },

    uploadToCurrentFolderSekolah() {
        if (typeof App !== "undefined") {
            App.switchTab('upload');
            setTimeout(() => {
                const selFolder = document.getElementById("sub-folder-tujuan");
                if (selFolder && this.activeFolderSekolahName) {
                    selFolder.value = this.activeFolderSekolahName;
                }
            }, 100);
        }
    },

    openEditReportModal(reportId, targetSheet) {
        const modal = document.getElementById("modal-edit-report");
        if (!modal) return;

        const rawData = (targetSheet === "Laporan_Kepsek") 
            ? ((typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsKepsek) ? DashboardManager.cachedData.reportsKepsek : [])
            : ((typeof DashboardManager !== "undefined" && DashboardManager.cachedData.reportsGuru) ? DashboardManager.cachedData.reportsGuru : []);

        let item = rawData.find(x => x.id && x.id.toString().trim() === reportId.toString().trim());
        if (!item && typeof DashboardManager !== "undefined") {
            item = (DashboardManager.cachedData.reportsKepsek || []).find(x => x.id && x.id.toString().trim() === reportId.toString().trim())
                || (DashboardManager.cachedData.reportsGuru || []).find(x => x.id && x.id.toString().trim() === reportId.toString().trim());
        }

        if (!item) {
            App.showToast("Laporan tidak ditemukan.", "error");
            return;
        }

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const currentRole = currentUser ? currentUser.role : "";
        const currentName = currentUser ? (currentUser.nama || "").trim().toLowerCase() : "";
        const currentSchool = currentUser ? (currentUser.asal_sekolah || "").trim().toLowerCase() : "";
        const isPengawas = currentRole === "Pengawas";
        const isOwner = currentName && (item.nama || "").trim().toLowerCase() === currentName;
        const isSchoolKepsek = (currentRole === "Kepala Sekolah" || currentRole === "Kepsek") && currentSchool && (item.asalSekolah || "").trim().toLowerCase() === currentSchool;

        if (!isPengawas && !isOwner && !isSchoolKepsek) {
            App.showToast("Anda tidak memiliki izin mengedit laporan ini.", "error");
            return;
        }

        document.getElementById("edit-report-id").value = item.id;
        document.getElementById("edit-report-targetsheet").value = targetSheet || (item.id.startsWith("LPK") ? "Laporan_Kepsek" : "Laporan_Guru");
        document.getElementById("edit-report-id-display").innerText = item.id;
        document.getElementById("edit-report-meta-display").innerText = `${item.nama} • ${item.asalSekolah}`;
        document.getElementById("edit-report-kategori").value = item.kategori || "";
        document.getElementById("edit-report-poin").value = this.getPoinPenting(item);

        const currentFileBadge = document.getElementById("edit-report-current-file-badge");
        if (currentFileBadge) {
            currentFileBadge.innerHTML = item.namaFile 
                ? `Berkas: <a href="${item.fileUrl}" target="_blank" class="text-blue-600 hover:underline font-bold">${item.namaFile}</a>`
                : `<a href="${item.fileUrl}" target="_blank" class="text-blue-600 hover:underline font-bold">Buka Berkas Saat Ini</a>`;
        }

        const fileInput = document.getElementById("edit-report-file-input");
        if (fileInput) fileInput.value = "";

        // Populate folder dropdown
        const folderSel = document.getElementById("edit-report-folder");
        if (folderSel) {
            const allFolders = (typeof LiveSync !== "undefined" && LiveSync.state.folders)
                ? LiveSync.state.folders
                : (typeof DriveManager !== "undefined" && DriveManager.cachedFolders ? DriveManager.cachedFolders : []);
            
            const isKep = (targetSheet === "Laporan_Kepsek" || item.id.startsWith("LPK"));
            const schoolFolders = allFolders.filter(f => {
                if (!f.namaFolder || f.namaFolder.startsWith("__DELETED__:") || (f.id && f.id.toString().startsWith("DEL-"))) return false;
                const matchSchool = ReportManager.isFolderForSchool(f, item.asalSekolah);
                const matchSub = isKep ? f.subCategory === "kepsek" : (!f.subCategory || f.subCategory === "guru" || f.subCategory === "root");
                return matchSchool && matchSub;
            });

            const uniqueNames = new Set();
            let optsHtml = "";
            const currentFld = (item.jenisPelaporan || "").trim();
            if (currentFld) {
                uniqueNames.add(currentFld.toLowerCase());
                optsHtml += `<option value="${currentFld}" selected>${currentFld}</option>`;
            }

            schoolFolders.forEach(f => {
                const fn = (f.namaFolder || "").trim();
                if (fn && !uniqueNames.has(fn.toLowerCase())) {
                    uniqueNames.add(fn.toLowerCase());
                    optsHtml += `<option value="${fn}">${fn}</option>`;
                }
            });

            if (!optsHtml) {
                optsHtml = `<option value="${currentFld || 'Umum'}">${currentFld || 'Umum'}</option>`;
            }
            folderSel.innerHTML = optsHtml;
        }

        modal.classList.remove("hidden");
    },

    closeEditReportModal() {
        const modal = document.getElementById("modal-edit-report");
        if (modal) modal.classList.add("hidden");
    },

    async submitEditReport(e) {
        if (e && e.preventDefault) e.preventDefault();

        const reportId = document.getElementById("edit-report-id").value;
        const targetSheet = document.getElementById("edit-report-targetsheet").value;
        const folder = document.getElementById("edit-report-folder").value.trim();
        const kategori = document.getElementById("edit-report-kategori").value.trim();
        const poinPenting = document.getElementById("edit-report-poin").value.trim();
        const fileInput = document.getElementById("edit-report-file-input");

        const btnSubmit = document.getElementById("btn-submit-edit-report");
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Menyimpan...`;
        }

        const executeUpdate = async (filebase64, filename, mimeType) => {
            const updatedData = {
                id: reportId,
                jenisPelaporan: folder,
                kategori: kategori,
                poinPenting: poinPenting
            };
            if (filebase64 && filename) {
                updatedData.filebase64 = filebase64;
                updatedData.filename = filename;
                updatedData.mimeType = mimeType;
                updatedData.namaFile = filename;
            }

            if (typeof LiveSync !== "undefined") {
                await LiveSync.optimisticUpdateReport(updatedData, targetSheet);
            } else {
                const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
                await ApiService.post({
                    action: "update_laporan",
                    idLaporan: reportId,
                    targetSheet: targetSheet,
                    ...updatedData,
                    currentUserRole: currentUser ? currentUser.role : "Guru",
                    currentUserName: currentUser ? currentUser.nama : "",
                    currentUserUsername: currentUser ? currentUser.username : "",
                    currentUserSchool: currentUser ? currentUser.asal_sekolah : ""
                });
                App.showToast("Laporan berhasil diperbarui.", "success");
            }

            // Refresh tampilan tabel yang sedang aktif
            if (this.activeFolderSekolahName && document.getElementById("wrapper-folder-sekolah-table") && !document.getElementById("wrapper-folder-sekolah-table").classList.contains("hidden")) {
                this.openFolderSekolahTable(this.activeFolderSekolahType, this.activeFolderSekolahName, this.activeFolderSekolahSchool);
            } else if (this.selectedTypeState) {
                this.openSubFolderTable(targetSheet === "Laporan_Kepsek" ? "kepsek" : "guru", this.selectedTypeState);
            }

            this.closeEditReportModal();
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan`;
            }
        };

        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = async () => {
                const ext = file.name.split('.').pop().toLowerCase();
                const mimeMap = {
                    'pdf': 'application/pdf',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'xls': 'application/vnd.ms-excel',
                    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'csv': 'text/csv',
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'png': 'image/png',
                    'webp': 'image/webp'
                };
                const mimeType = mimeMap[ext] || file.type || 'application/octet-stream';
                await executeUpdate(reader.result, file.name, mimeType);
            };
            reader.readAsDataURL(file);
        } else {
            await executeUpdate();
        }
    }
};
