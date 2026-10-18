/**
 * ==========================================================================
 * PantauSekolah - Audit Log Module (audit.js)
 * ==========================================================================
 * Khusus untuk Pengawas guna memantau seluruh aktivitas pengguna di sistem:
 * - Login & Logout
 * - Pengunggahan berkas laporan
 * - Verifikasi laporan (status & catatan)
 * - Pembuatan & penghapusan folder Google Drive
 * - Pendaftaran & penghapusan akun pengguna
 * - Penggantian kata sandi
 * ==========================================================================
 */

const AuditManager = {
    cachedLogs: [],
    filteredLogs: [],
    currentPage: 1,
    pageSize: 15,

    currentFilters: {
        search: "",
        role: "all",
        action: "all",
        school: "all",
        dateRange: "all"
    },

    /**
     * Inisialisasi modul Audit Log
     */
    init() {
        // Event listeners untuk filter
        const searchInput = document.getElementById("audit-search");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.currentFilters.search = e.target.value.trim().toLowerCase();
                this.currentPage = 1;
                this.applyFilters();
            });
        }
    },

    /**
     * Memuat riwayat Audit Log dari Cache atau Server GAS
     */
    async loadAuditLogs(forceServer = false) {
        const user = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (!user || user.role !== "Pengawas") {
            return;
        }

        const tableBody = document.getElementById("table-body-audit-logs");
        const loadingIndicator = document.getElementById("audit-loading-indicator");

        // Jika data ada di cache LiveSync dan bukan forceServer, gunakan langsung (0ms)
        if (!forceServer && typeof LiveSync !== "undefined" && LiveSync.state.auditLogs && LiveSync.state.auditLogs.length > 0) {
            this.cachedLogs = LiveSync.state.auditLogs;
            this.populateFilterDropdowns();
            this.applyFilters();
            return;
        }

        if (loadingIndicator) loadingIndicator.classList.remove("hidden");
        if (tableBody && this.cachedLogs.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-slate-400 text-xs">
                        <i class="fa-solid fa-circle-notch fa-spin text-blue-600 text-lg mb-2"></i>
                        <p class="font-medium">Memuat riwayat aktivitas sistem...</p>
                    </td>
                </tr>
            `;
        }

        try {
            const res = await ApiService.post({
                action: "get_audit_logs",
                currentUserRole: user.role
            });

            if (res && res.status === "success" && Array.isArray(res.logs)) {
                this.cachedLogs = res.logs;
                if (typeof LiveSync !== "undefined") {
                    LiveSync.state.auditLogs = res.logs;
                }
                this.populateFilterDropdowns();
                this.applyFilters();
            } else {
                if (tableBody && this.cachedLogs.length === 0) {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="5" class="p-8 text-center text-slate-400 text-xs">
                                Belum ada catatan aktivitas di sistem.
                            </td>
                        </tr>
                    `;
                }
            }
        } catch (err) {
            console.error("Gagal memuat audit log:", err);
            if (tableBody && this.cachedLogs.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="p-8 text-center text-rose-500 text-xs">
                            <i class="fa-solid fa-triangle-exclamation text-base mb-1"></i>
                            <p class="font-bold">Gagal memuat audit log dari server.</p>
                            <button onclick="AuditManager.loadAuditLogs(true)" class="mt-2 text-blue-600 hover:underline font-semibold">Coba lagi</button>
                        </td>
                    </tr>
                `;
            }
        } finally {
            if (loadingIndicator) loadingIndicator.classList.add("hidden");
        }
    },

    /**
     * Handler saat LiveSync memperbarui data di background
     */
    onDataSynced(newLogs) {
        if (!Array.isArray(newLogs)) return;
        this.cachedLogs = newLogs;

        const auditTab = document.getElementById("tab-audit-log");
        if (auditTab && !auditTab.classList.contains("hidden")) {
            this.populateFilterDropdowns();
            this.applyFilters(false);
        }
    },

    /**
     * Mengisi dropdown filter sekolah & aksi secara dinamis
     */
    populateFilterDropdowns() {
        const schoolSelect = document.getElementById("audit-filter-school");
        const actionSelect = document.getElementById("audit-filter-action");

        if (schoolSelect) {
            const currentVal = schoolSelect.value;
            const schools = new Set();
            this.cachedLogs.forEach(l => {
                if (l.asalSekolah && l.asalSekolah !== "-" && l.asalSekolah !== "Dinas") {
                    schools.add(l.asalSekolah);
                }
            });

            let optionsHtml = `<option value="all">Semua Sekolah Binaan</option>`;
            Array.from(schools).sort().forEach(s => {
                optionsHtml += `<option value="${s}">${s}</option>`;
            });
            schoolSelect.innerHTML = optionsHtml;
            if (currentVal && Array.from(schools).includes(currentVal)) {
                schoolSelect.value = currentVal;
            }
        }

        if (actionSelect) {
            const currentAction = actionSelect.value;
            const actions = new Set();
            this.cachedLogs.forEach(l => {
                if (l.aksi && l.aksi !== "-") actions.add(l.aksi);
            });

            let actionHtml = `<option value="all">Semua Jenis Aktivitas</option>`;
            Array.from(actions).sort().forEach(a => {
                actionHtml += `<option value="${a}">${a}</option>`;
            });
            actionSelect.innerHTML = actionHtml;
            if (currentAction && Array.from(actions).includes(currentAction)) {
                actionSelect.value = currentAction;
            }
        }
    },

    /**
     * Menjalankan filter pencarian dan opsi
     */
    applyFilters(resetPage = true) {
        if (resetPage) this.currentPage = 1;

        const searchVal = (document.getElementById("audit-search") ? document.getElementById("audit-search").value : "").trim().toLowerCase();
        const roleVal = document.getElementById("audit-filter-role") ? document.getElementById("audit-filter-role").value : "all";
        const actionVal = document.getElementById("audit-filter-action") ? document.getElementById("audit-filter-action").value : "all";
        const schoolVal = document.getElementById("audit-filter-school") ? document.getElementById("audit-filter-school").value : "all";
        const dateVal = document.getElementById("audit-filter-date") ? document.getElementById("audit-filter-date").value : "all";

        this.currentFilters = { search: searchVal, role: roleVal, action: actionVal, school: schoolVal, dateRange: dateVal };

        const now = new Date();
        const todayStr = this.getFormattedDateStr(now);

        this.filteredLogs = this.cachedLogs.filter(log => {
            // 1. Text Search (Nama, Username, Sekolah, Aksi, Keterangan, Detail)
            if (searchVal) {
                const combined = [
                    log.nama || "",
                    log.username || "",
                    log.role || "",
                    log.asalSekolah || "",
                    log.aksi || "",
                    log.keterangan || "",
                    log.detail || "",
                    log.timestamp || ""
                ].join(" ").toLowerCase();

                if (!combined.includes(searchVal)) return false;
            }

            // 2. Filter Role
            if (roleVal !== "all" && log.role !== roleVal) {
                return false;
            }

            // 3. Filter Aksi
            if (actionVal !== "all" && log.aksi !== actionVal) {
                return false;
            }

            // 4. Filter Sekolah
            if (schoolVal !== "all") {
                const logSchool = (log.asalSekolah || "").toLowerCase();
                if (logSchool !== schoolVal.toLowerCase()) return false;
            }

            // 5. Filter Rentang Waktu
            if (dateVal !== "all") {
                const logDateStr = (log.timestamp || "").split(" ")[0] || ""; // yyyy-MM-dd
                if (dateVal === "today") {
                    if (logDateStr !== todayStr) return false;
                } else if (dateVal === "7days") {
                    const diffDays = this.getDateDiffDays(logDateStr, now);
                    if (diffDays > 7) return false;
                } else if (dateVal === "30days") {
                    const diffDays = this.getDateDiffDays(logDateStr, now);
                    if (diffDays > 30) return false;
                }
            }

            return true;
        });

        this.updateStatsCards();
        this.renderTable();
    },

    /**
     * Reset semua filter ke default
     */
    resetFilters() {
        const searchInput = document.getElementById("audit-search");
        const roleSelect = document.getElementById("audit-filter-role");
        const actionSelect = document.getElementById("audit-filter-action");
        const schoolSelect = document.getElementById("audit-filter-school");
        const dateSelect = document.getElementById("audit-filter-date");

        if (searchInput) searchInput.value = "";
        if (roleSelect) roleSelect.value = "all";
        if (actionSelect) actionSelect.value = "all";
        if (schoolSelect) schoolSelect.value = "all";
        if (dateSelect) dateSelect.value = "all";

        this.applyFilters();
    },

    /**
     * Hitung & Tampilkan Kartu Metrik Statistik
     */
    updateStatsCards() {
        const elTotal = document.getElementById("stat-audit-total");
        const elToday = document.getElementById("stat-audit-today");
        const elReports = document.getElementById("stat-audit-reports");
        const elSecurity = document.getElementById("stat-audit-security");

        const all = this.cachedLogs;
        const now = new Date();
        const todayStr = this.getFormattedDateStr(now);

        const totalCount = all.length;
        const todayCount = all.filter(l => (l.timestamp || "").startsWith(todayStr)).length;
        const reportCount = all.filter(l => {
            const a = (l.aksi || "").toLowerCase();
            return a.includes("unggah") || a.includes("verifikasi") || a.includes("laporan");
        }).length;
        const securityCount = all.filter(l => {
            const a = (l.aksi || "").toLowerCase();
            return a.includes("login") || a.includes("pengguna") || a.includes("password");
        }).length;

        if (elTotal) elTotal.innerText = totalCount.toLocaleString("id-ID");
        if (elToday) elToday.innerText = todayCount.toLocaleString("id-ID");
        if (elReports) elReports.innerText = reportCount.toLocaleString("id-ID");
        if (elSecurity) elSecurity.innerText = securityCount.toLocaleString("id-ID");
    },

    /**
     * Render Tabel Riwayat Aktivitas
     */
    renderTable() {
        const tbody = document.getElementById("table-body-audit-logs");
        const paginationContainer = document.getElementById("audit-pagination-container");
        const countInfo = document.getElementById("audit-count-info");
        if (!tbody) return;

        const totalItems = this.filteredLogs.length;

        if (totalItems === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-10 text-center">
                        <div class="max-w-xs mx-auto space-y-2">
                            <div class="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center text-xl mx-auto">
                                <i class="fa-solid fa-magnifying-glass"></i>
                            </div>
                            <p class="font-bold text-slate-700 text-sm">Tidak ada aktivitas ditemukan</p>
                            <p class="text-xs text-slate-400">Tidak ada log yang cocok dengan kriteria filter atau pencarian Anda.</p>
                            <button onclick="AuditManager.resetFilters()" class="mt-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
                                Reset Semua Filter
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            if (paginationContainer) paginationContainer.innerHTML = "";
            if (countInfo) countInfo.innerText = "0 aktivitas";
            return;
        }

        // Pagination
        const totalPages = Math.ceil(totalItems / this.pageSize);
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, totalItems);
        const pageData = this.filteredLogs.slice(startIndex, endIndex);

        if (countInfo) {
            countInfo.innerText = `Menampilkan ${startIndex + 1} - ${endIndex} dari ${totalItems} aktivitas`;
        }

        tbody.innerHTML = "";
        pageData.forEach(item => {
            const roleBadge = this.getRoleBadge(item.role);
            const actionBadge = this.getActionBadge(item.aksi);
            const relativeTime = this.getRelativeTime(item.timestamp);
            const formattedTime = this.formatFullTimestamp(item.timestamp);

            tbody.innerHTML += `
                <tr class="hover:bg-[#FAF7F0] transition-colors border-b border-[#F0EBE1]">
                    <!-- 1. WAKTU & TANGGAL -->
                    <td class="p-3.5 whitespace-nowrap">
                        <div class="flex items-center gap-2">
                            <div class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs flex-shrink-0">
                                <i class="fa-regular fa-clock"></i>
                            </div>
                            <div>
                                <p class="text-xs font-bold text-slate-800 font-mono">${formattedTime.time}</p>
                                <p class="text-[10px] text-slate-500">${formattedTime.date} • <span class="font-semibold text-blue-600">${relativeTime}</span></p>
                            </div>
                        </div>
                    </td>

                    <!-- 2. PENGGUNA -->
                    <td class="p-3.5 whitespace-nowrap">
                        <div class="flex items-center gap-2.5">
                            <div class="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 flex-shrink-0">
                                ${this.getAvatarIcon(item.role)}
                            </div>
                            <div class="min-w-0">
                                <p class="text-xs font-bold text-slate-800 truncate">${item.nama || '-'}</p>
                                <div class="flex items-center gap-1.5 text-[10px] text-slate-500">
                                    <span class="font-mono text-slate-600">${item.username || '-'}</span>
                                    <span>•</span>
                                    <span class="truncate max-w-[140px] text-slate-600 font-medium" title="${item.asalSekolah || ''}">${item.asalSekolah || 'Dinas'}</span>
                                </div>
                            </div>
                        </div>
                    </td>

                    <!-- 3. PERAN (ROLE) -->
                    <td class="p-3.5 text-center whitespace-nowrap">
                        ${roleBadge}
                    </td>

                    <!-- 4. JENIS AKTIVITAS (AKSI) -->
                    <td class="p-3.5 whitespace-nowrap">
                        ${actionBadge}
                    </td>

                    <!-- 5. KETERANGAN & DETAIL -->
                    <td class="p-3.5 text-xs text-slate-700 min-w-[220px] max-w-[340px]">
                        <p class="font-semibold text-slate-800 leading-snug">${item.keterangan || '-'}</p>
                        ${item.detail && item.detail !== '-' ? `
                            <p class="text-[11px] text-slate-500 mt-0.5 truncate font-mono bg-slate-50 border border-slate-200/60 rounded px-1.5 py-0.5 inline-block max-w-full" title="${item.detail}">
                                ${item.detail}
                            </p>
                        ` : ''}
                    </td>
                </tr>
            `;
        });

        // Render tombol navigasi halaman
        this.renderPagination(totalPages);
    },

    /**
     * Render Navigasi Pagination
     */
    renderPagination(totalPages) {
        const container = document.getElementById("audit-pagination-container");
        if (!container) return;

        if (totalPages <= 1) {
            container.innerHTML = "";
            return;
        }

        let html = `
            <div class="flex items-center gap-1.5">
                <button onclick="AuditManager.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-slate-200"'}
                    class="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#F0EBE1] text-slate-700 transition-colors">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
        `;

        // Render nomor halaman cerdas (max 5 tombol)
        let startPage = Math.max(1, this.currentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        for (let p = startPage; p <= endPage; p++) {
            const isActive = p === this.currentPage;
            html += `
                <button onclick="AuditManager.goToPage(${p})"
                    class="px-3 py-1 rounded-lg text-xs font-bold transition-all ${isActive ? 'bg-blue-600 text-white shadow-xs' : 'bg-[#F0EBE1] text-slate-700 hover:bg-[#E5DFD3]'}">
                    ${p}
                </button>
            `;
        }

        html += `
                <button onclick="AuditManager.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-slate-200"'}
                    class="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#F0EBE1] text-slate-700 transition-colors">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;

        container.innerHTML = html;
    },

    goToPage(page) {
        this.currentPage = page;
        this.renderTable();
        // Scroll ke atas tabel
        const card = document.getElementById("tab-audit-log");
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    /**
     * Badge visual untuk Peran (Role)
     */
    getRoleBadge(role) {
        const r = (role || "").toLowerCase();
        if (r === "pengawas") {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
                <i class="fa-solid fa-user-shield text-[10px]"></i> Pengawas
            </span>`;
        }
        if (r === "kepala sekolah" || r === "kepsek") {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
                <i class="fa-solid fa-user-tie text-[10px]"></i> Kepala Sekolah
            </span>`;
        }
        return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
            <i class="fa-solid fa-chalkboard-user text-[10px]"></i> Guru
        </span>`;
    },

    /**
     * Ikon Avatar sesuai Peran
     */
    getAvatarIcon(role) {
        const r = (role || "").toLowerCase();
        if (r === "pengawas") return `<i class="fa-solid fa-user-shield text-amber-600"></i>`;
        if (r === "kepala sekolah" || r === "kepsek") return `<i class="fa-solid fa-user-tie text-blue-600"></i>`;
        return `<i class="fa-solid fa-chalkboard-user text-emerald-600"></i>`;
    },

    /**
     * Badge visual untuk Jenis Aktivitas (Aksi)
     */
    getActionBadge(aksi) {
        const a = (aksi || "").toLowerCase();

        if (a.includes("login berhasil")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <i class="fa-solid fa-right-to-bracket text-emerald-600"></i> Login Berhasil
            </span>`;
        }
        if (a.includes("login gagal")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <i class="fa-solid fa-triangle-exclamation text-rose-600"></i> Login Gagal
            </span>`;
        }
        if (a.includes("unggah")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <i class="fa-solid fa-cloud-arrow-up text-blue-600"></i> Unggah Laporan
            </span>`;
        }
        if (a.includes("verifikasi")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <i class="fa-solid fa-file-circle-check text-indigo-600"></i> Verifikasi Laporan
            </span>`;
        }
        if (a.includes("tambah folder")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <i class="fa-solid fa-folder-plus text-amber-600"></i> Tambah Folder
            </span>`;
        }
        if (a.includes("hapus folder") || a.includes("sembunyikan folder")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <i class="fa-solid fa-folder-minus text-rose-600"></i> Hapus Folder
            </span>`;
        }
        if (a.includes("tambah pengguna")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                <i class="fa-solid fa-user-plus text-teal-600"></i> Tambah Pengguna
            </span>`;
        }
        if (a.includes("hapus pengguna")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <i class="fa-solid fa-user-minus text-rose-600"></i> Hapus Pengguna
            </span>`;
        }
        if (a.includes("ganti password") || a.includes("password")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                <i class="fa-solid fa-key text-violet-600"></i> Ganti Password
            </span>`;
        }
        if (a.includes("hapus laporan")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <i class="fa-solid fa-trash-can text-rose-600"></i> Hapus Laporan
            </span>`;
        }
        if (a.includes("bersih")) {
            return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                <i class="fa-solid fa-broom text-slate-600"></i> Bersihkan Log
            </span>`;
        }

        return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-50 text-slate-700 border border-slate-200">
            <i class="fa-solid fa-clock-rotate-left text-slate-500"></i> ${aksi || 'Aktivitas'}
        </span>`;
    },

    /**
     * Format timestamp menjadi Objek { time, date }
     */
    formatFullTimestamp(ts) {
        if (!ts || ts === "-") return { time: "-", date: "-" };
        try {
            // ts format: "yyyy-MM-dd HH:mm:ss" atau ISO
            const parts = ts.split(" ");
            if (parts.length >= 2) {
                const dateParts = parts[0].split("-");
                const timeParts = parts[1].split(":");
                const day = dateParts[2] || "01";
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
                const month = monthNames[parseInt(dateParts[1] || "1", 10) - 1] || "Jan";
                const year = dateParts[0];
                return {
                    time: `${timeParts[0] || '00'}:${timeParts[1] || '00'}:${timeParts[2] || '00'} WIB`,
                    date: `${day} ${month} ${year}`
                };
            }
            const d = new Date(ts);
            if (!isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
                const month = monthNames[d.getMonth()];
                const year = d.getFullYear();
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                const seconds = String(d.getSeconds()).padStart(2, '0');
                return {
                    time: `${hours}:${minutes}:${seconds} WIB`,
                    date: `${day} ${month} ${year}`
                };
            }
        } catch (e) {}
        return { time: ts, date: "-" };
    },

    /**
     * Hitung waktu relatif (misal: "5 menit lalu")
     */
    getRelativeTime(ts) {
        if (!ts || ts === "-") return "-";
        try {
            const date = new Date(ts.replace(" ", "T") + "+07:00");
            const now = new Date();
            const diffMs = now - date;
            if (isNaN(diffMs) || diffMs < 0) return "Baru saja";

            const diffSec = Math.floor(diffMs / 1000);
            if (diffSec < 60) return "Baru saja";
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return `${diffMin} mnt lalu`;
            const diffHour = Math.floor(diffMin / 60);
            if (diffHour < 24) return `${diffHour} jam lalu`;
            const diffDay = Math.floor(diffHour / 24);
            if (diffDay === 1) return "Kemarin";
            if (diffDay < 7) return `${diffDay} hari lalu`;
            return `${Math.floor(diffDay / 7)} minggu lalu`;
        } catch (e) {
            return "-";
        }
    },

    getFormattedDateStr(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    getDateDiffDays(dateStr, now) {
        try {
            const d = new Date(dateStr);
            const diffTime = Math.abs(now - d);
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } catch (e) {
            return 999;
        }
    },

    /**
     * Ekspor Seluruh Log yang Sedang Difilter ke File CSV
     */
    exportToCSV() {
        if (!this.filteredLogs || this.filteredLogs.length === 0) {
            if (typeof App !== "undefined" && App.showToast) {
                App.showToast("Tidak ada data log untuk diekspor.", "error");
            }
            return;
        }

        const headers = ["ID", "Waktu", "Nama Pengguna", "Username", "Peran", "Asal Sekolah", "Aksi / Aktivitas", "Keterangan", "Detail"];
        const rows = this.filteredLogs.map(item => [
            `"${(item.id || '').replace(/"/g, '""')}"`,
            `"${(item.timestamp || '').replace(/"/g, '""')}"`,
            `"${(item.nama || '').replace(/"/g, '""')}"`,
            `"${(item.username || '').replace(/"/g, '""')}"`,
            `"${(item.role || '').replace(/"/g, '""')}"`,
            `"${(item.asalSekolah || '').replace(/"/g, '""')}"`,
            `"${(item.aksi || '').replace(/"/g, '""')}"`,
            `"${(item.keterangan || '').replace(/"/g, '""')}"`,
            `"${(item.detail || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const dateStr = this.getFormattedDateStr(now).replace(/-/g, "");
        const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');

        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Audit_Log_PantauSekolah_${dateStr}_${timeStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (typeof App !== "undefined" && App.showToast) {
            App.showToast(`Berhasil mengekspor ${this.filteredLogs.length} catatan audit log ke CSV!`, "success");
        }
    },

    /**
     * Konfirmasi pembersihan seluruh riwayat audit log
     */
    async confirmClearLogs() {
        const confirmed = await App.confirmModal({
            title: "Bersihkan Riwayat Audit Log",
            message: "Apakah Anda yakin ingin membersihkan seluruh riwayat audit log?",
            subMessage: "Tindakan ini akan mengosongkan rekaman aktivitas sebelumnya dari database. Catatan pembersihan ini akan disimpan sebagai log pertama baru.",
            confirmText: "Ya, Bersihkan Log",
            confirmType: "danger",
            icon: "fa-solid fa-broom"
        });

        if (!confirmed) return;

        const user = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (!user || user.role !== "Pengawas") return;

        try {
            const res = await ApiService.post({
                action: "clear_audit_logs",
                currentUserRole: user.role
            });

            if (res && res.status === "success") {
                if (typeof App !== "undefined" && App.showToast) {
                    App.showToast("Seluruh riwayat audit log berhasil dibersihkan!", "success");
                }
                this.loadAuditLogs(true);
            } else {
                if (typeof App !== "undefined" && App.showToast) {
                    App.showToast("Gagal membersihkan log: " + (res.message || "Kesalahan server"), "error");
                }
            }
        } catch (e) {
            if (typeof App !== "undefined" && App.showToast) {
                App.showToast("Terjadi kesalahan saat membersihkan log.", "error");
            }
        }
    }
};

// Pasang inisialisasi modul saat DOM siap
document.addEventListener("DOMContentLoaded", () => {
    AuditManager.init();
});
