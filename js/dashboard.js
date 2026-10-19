/**
 * ==========================================================================
 * PantauSekolah - Dashboard & Charts Module
 * ==========================================================================
 */

const DashboardManager = {
    cachedData: {
        reportsKepsek: [],
        reportsGuru: [],
        allActivity: [],
        schools: []
    },

    chartStatusInstance: null,
    chartPerbandinganInstance: null,

    /**
     * Memuat data utama dashboard dari backend
     */
    async loadData(options = { force: false }) {
        // Render instan 0ms dari cache memori
        this.renderStats();
        this.renderCharts();
        this.renderActivityFeed();
        if (typeof ReportManager !== "undefined") {
            ReportManager.renderSchoolFolderCards('kepsek');
            ReportManager.renderSchoolFolderCards('guru');
        }

        // Lakukan background sync live tanpa memblokir tampilan UI
        if (typeof LiveSync !== "undefined") {
            LiveSync.sync({ force: options.force, silent: true });
        }
    },

    /**
     * Helper untuk memfilter aktivitas sesuai hak akses (sekolah pengguna)
     */
    getFilteredActivity() {
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const all = this.cachedData.allActivity || [];
        if (currentUser && currentUser.role === "Guru") {
            const school = (currentUser.asal_sekolah || "").toLowerCase();
            const myName = (currentUser.nama || "").trim().toLowerCase();
            return all.filter(x => (x.asalSekolah || "").toLowerCase() === school && (x.nama || "").trim().toLowerCase() === myName);
        }
        if (currentUser && currentUser.role !== "Pengawas" && currentUser.asal_sekolah) {
            const school = currentUser.asal_sekolah.toLowerCase();
            return all.filter(x => (x.asalSekolah || "").toLowerCase() === school);
        }
        return all;
    },

    getFilteredKepsek() {
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const list = this.cachedData.reportsKepsek || [];
        if (currentUser && currentUser.role !== "Pengawas" && currentUser.asal_sekolah) {
            const school = currentUser.asal_sekolah.toLowerCase();
            return list.filter(x => (x.asalSekolah || "").toLowerCase() === school);
        }
        return list;
    },

    getFilteredGuru() {
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const list = this.cachedData.reportsGuru || [];
        if (currentUser && currentUser.role === "Guru") {
            const school = (currentUser.asal_sekolah || "").toLowerCase();
            const myName = (currentUser.nama || "").trim().toLowerCase();
            return list.filter(x => (x.asalSekolah || "").toLowerCase() === school && (x.nama || "").trim().toLowerCase() === myName);
        }
        if (currentUser && currentUser.role !== "Pengawas" && currentUser.asal_sekolah) {
            const school = currentUser.asal_sekolah.toLowerCase();
            return list.filter(x => (x.asalSekolah || "").toLowerCase() === school);
        }
        return list;
    },

    /**
     * Render Angka Statistik Utama
     */
    renderStats() {
        const all = this.getFilteredActivity();
        let total = all.length;
        let disetujui = 0;
        let menunggu = 0;
        let revisi = 0;

        all.forEach(item => {
            if (item.status === "Disetujui") disetujui++;
            else if (item.status === "Perlu Perbaikan" || item.status === "Ditolak") revisi++;
            else menunggu++;
        });

        document.getElementById("stat-total").innerText = total;
        document.getElementById("stat-disetujui").innerText = disetujui;
        document.getElementById("stat-menunggu").innerText = menunggu;
        document.getElementById("stat-revisi").innerText = revisi;
    },

    /**
     * Render Grafik Chart.js
     */
    renderCharts() {
        const all = this.getFilteredActivity();

        let disetujui = all.filter(x => x.status === "Disetujui").length;
        let menunggu = all.filter(x => x.status !== "Disetujui" && x.status !== "Perlu Perbaikan" && x.status !== "Ditolak").length;
        let perbaikan = all.filter(x => x.status === "Perlu Perbaikan").length;
        let ditolak = all.filter(x => x.status === "Ditolak").length;

        // 1. Donut Chart Status
        const canvasStatus = document.getElementById('chartStatus');
        if (canvasStatus) {
            const ctxStatus = canvasStatus.getContext('2d');
            if (this.chartStatusInstance) this.chartStatusInstance.destroy();

            this.chartStatusInstance = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: ['Disetujui', 'Menunggu', 'Perlu Perbaikan', 'Ditolak'],
                    datasets: [{
                        data: [disetujui, menunggu, perbaikan, ditolak],
                        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { family: 'Poppins', size: window.innerWidth < 640 ? 9 : 11 }
                            }
                        }
                    }
                }
            });
        }

        // 2. Bar Chart Perbandingan Kepsek vs Guru
        const canvasComp = document.getElementById('chartPerbandingan');
        if (canvasComp) {
            const countKepsek = this.getFilteredKepsek().length;
            const countGuru = this.getFilteredGuru().length;

            const ctxComp = canvasComp.getContext('2d');
            if (this.chartPerbandinganInstance) this.chartPerbandinganInstance.destroy();

            this.chartPerbandinganInstance = new Chart(ctxComp, {
                type: 'bar',
                data: {
                    labels: ['Kepala Sekolah', 'Guru'],
                    datasets: [{
                        label: 'Jumlah Laporan Terunggah',
                        data: [countKepsek, countGuru],
                        backgroundColor: ['#2563eb', '#6366f1'],
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1 }
                        }
                    }
                }
            });
        }
    },

    /**
     * Render Aktivitas Terkini
     */
    renderActivityFeed() {
        const feedContainer = document.getElementById("activity-feed");
        if (!feedContainer) return;

        const all = this.getFilteredActivity();

        if (all.length === 0) {
            feedContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Belum ada aktivitas laporan tersimpan.</p>`;
            return;
        }

        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const currentRole = currentUser ? currentUser.role : "";
        const currentName = currentUser ? (currentUser.nama || "").trim().toLowerCase() : "";
        const currentSchool = currentUser ? (currentUser.asal_sekolah || "").trim().toLowerCase() : "";
        const isPengawas = currentRole === "Pengawas";

        feedContainer.innerHTML = "";
        all.slice(0, 10).forEach(item => {
            const statusBadge = this.getStatusBadge(item.status);
            const roleColor = item.sourceRole === "Kepala Sekolah" ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700";
            const targetSheet = item.sourceRole === "Kepala Sekolah" ? "Laporan_Kepsek" : "Laporan_Guru";

            const itemUploader = (item.nama || "").trim().toLowerCase();
            const itemSchool = (item.asalSekolah || "").trim().toLowerCase();

            const isOwner = currentName && itemUploader === currentName;
            const isSchoolKepsek = (currentRole === "Kepala Sekolah" || currentRole === "Kepsek") && currentSchool && itemSchool === currentSchool;
            const canDelete = isPengawas || isOwner || isSchoolKepsek;

            feedContainer.innerHTML += `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-[#FAF8F5] border border-[#E8E2D5] rounded-xl gap-2.5 hover:border-[#D0C7B7] hover:bg-[#FAF7F0] transition-colors">
                    <div class="flex items-start gap-3">
                        <div class="w-9 h-9 bg-white border border-[#E8E2D5] rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5 shadow-2xs">
                            ${(typeof ReportManager !== "undefined" && typeof ReportManager.getFileIcon === "function") 
                                ? ReportManager.getFileIcon(item.fileUrl, item.namaFile || item.filename, item.kategori) 
                                : '<i class="fa-solid fa-file-lines text-blue-600"></i>'}
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <p class="text-xs font-bold text-slate-800 truncate">${item.nama}</p>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded ${roleColor}">${item.asalSekolah || '-'}</span>
                            </div>
                            <p class="text-[11px] text-slate-500 mt-0.5"><span class="font-semibold text-slate-700">${item.kategori}</span> • ${item.tanggal}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                        ${statusBadge}
                        <a href="${item.fileUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center gap-1.5 bg-white border border-[#E8E2D5] hover:border-blue-300 px-2.5 py-1 rounded-lg shadow-2xs transition-colors">
                            <i class="fa-solid fa-eye"></i> Buka
                        </a>
                        ${canDelete ? `
                            <button onclick="ReportManager.confirmDeleteReport('${item.id}', '${item.nama}', '${targetSheet}')" title="${isOwner ? 'Hapus berkas unggahan saya' : 'Hapus berkas laporan ini'}" class="text-rose-600 hover:text-rose-800 font-bold text-xs flex items-center gap-1.5 bg-white hover:bg-rose-50 border border-[#E8E2D5] hover:border-rose-300 px-2.5 py-1 rounded-lg shadow-2xs transition-colors">
                                <i class="fa-solid fa-trash-can text-rose-500"></i> <span class="hidden sm:inline">Hapus</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
    },

    getStatusBadge(status) {
        if (status === "Disetujui") {
            return `<span class="bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-lg text-[10px]">✅ Disetujui</span>`;
        }
        if (status === "Perlu Perbaikan") {
            return `<span class="bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-lg text-[10px]">⚠️ Perbaikan</span>`;
        }
        if (status === "Ditolak") {
            return `<span class="bg-rose-100 text-rose-700 font-bold px-2.5 py-1 rounded-lg text-[10px]">❌ Ditolak</span>`;
        }
        return `<span class="bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-lg text-[10px]">⏳ Menunggu</span>`;
    }
};
