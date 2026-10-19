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
    chartFolderFilter: "all",

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

        // 2. Isi Dropdown Folder dan Render Grafik Kepatuhan Unggah Tiap Sekolah
        this.populateChartFolderDropdown();
        this.renderSchoolComplianceChart();
    },

    /**
     * Dapatkan daftar seluruh folder laporan aktif yang BENAR-BENAR dibuat pengawas di Google Drive.
     * Hanya dari LiveSync.state.folders / DriveManager.cachedFolders — tanpa hardcoded defaults.
     */
    getAllAvailableFolders() {
        const folderSet = new Set();

        // Ambil HANYA dari folder yang benar-benar dibuat pengawas di Drive
        const customFolders = (typeof LiveSync !== "undefined" && LiveSync.state && LiveSync.state.folders)
            ? LiveSync.state.folders
            : (typeof DriveManager !== "undefined" && DriveManager.cachedFolders ? DriveManager.cachedFolders : []);

        customFolders.forEach(f => {
            if (f && f.namaFolder
                && !f.namaFolder.startsWith("__DELETED__:")
                && !String(f.id || "").startsWith("DEL-")) {
                folderSet.add(f.namaFolder.trim());
            }
        });

        return Array.from(folderSet).sort((a, b) => a.localeCompare(b, 'id'));
    },

    /**
     * Dapatkan daftar seluruh sekolah binaan
     */
    getAllSchoolsList() {
        const schoolMap = new Map();

        // Dari cachedData.schools atau LiveSync.state.schools
        const metaSchools = (this.cachedData && this.cachedData.schools)
            ? this.cachedData.schools
            : ((typeof LiveSync !== "undefined" && LiveSync.state.schools) ? LiveSync.state.schools : []);

        metaSchools.forEach(s => {
            if (s && s.nama && s.nama.trim()) {
                schoolMap.set(s.nama.trim().toLowerCase(), s.nama.trim());
            }
        });

        // Dari seluruh laporan yang telah terkirim
        const allReports = [...(this.cachedData.reportsKepsek || []), ...(this.cachedData.reportsGuru || [])];
        allReports.forEach(r => {
            if (r && r.asalSekolah && r.asalSekolah.trim()) {
                schoolMap.set(r.asalSekolah.trim().toLowerCase(), r.asalSekolah.trim());
            }
        });

        const list = Array.from(schoolMap.values());
        return list.sort((a, b) => a.localeCompare(b, 'id'));
    },

    /**
     * Isi pilihan dropdown folder pada header card grafik
     */
    populateChartFolderDropdown() {
        const select = document.getElementById("select-filter-chart-folder");
        if (!select) return;

        const folders = this.getAllAvailableFolders();
        const currentVal = this.chartFolderFilter || "all";

        let html = `<option value="all" ${currentVal === "all" ? "selected" : ""}>📂 Semua Folder (Kelengkapan Total)</option>`;
        if (folders.length > 0) {
            html += `<optgroup label="Filter Per Folder Laporan">`;
            folders.forEach(f => {
                const isSel = currentVal.toLowerCase() === f.toLowerCase();
                html += `<option value="${f}" ${isSel ? "selected" : ""}>📁 ${f}</option>`;
            });
            html += `</optgroup>`;
        } else {
            html += `<option value="" disabled>— Belum ada folder dibuat pengawas —</option>`;
        }

        select.innerHTML = html;
    },

    /**
     * Handler saat filter folder grafik diubah
     */
    onChartFolderFilterChange(val) {
        this.chartFolderFilter = val;
        this.renderSchoolComplianceChart();
    },

    /**
     * Render Grafik Kepatuhan & Progres Unggah Per Sekolah (Menggantikan Bar Chart Kepsek vs Guru)
     */
    renderSchoolComplianceChart() {
        const canvas = document.getElementById('chartPerbandingan');
        if (!canvas) return;

        const schools = this.getAllSchoolsList();
        const folders = this.getAllAvailableFolders();
        const allReports = [...(this.cachedData.reportsKepsek || []), ...(this.cachedData.reportsGuru || [])];

        const subtitleEl = document.getElementById("chart-sekolah-subtitle");
        const totalSchoolsEl = document.getElementById("chart-kpi-total-schools");
        const kpiBadgeEl = document.getElementById("chart-kpi-badge");
        const canvasWrapper = document.getElementById("chart-sekolah-canvas-wrapper");

        if (totalSchoolsEl) totalSchoolsEl.innerText = schools.length;

        // Jika belum ada sekolah sama sekali
        if (schools.length === 0) {
            if (subtitleEl) subtitleEl.innerText = "Belum ada sekolah binaan terdaftar di sistem";
            if (kpiBadgeEl) {
                kpiBadgeEl.className = "font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200";
                kpiBadgeEl.innerText = "0 Sekolah";
            }
            if (this.chartPerbandinganInstance) {
                this.chartPerbandinganInstance.destroy();
                this.chartPerbandinganInstance = null;
            }
            return;
        }

        // Sesuaikan tinggi canvas agar jika ada 20 sekolah, tidak berhimpitan
        if (canvasWrapper) {
            if (schools.length > 5) {
                const dynamicHeight = Math.max(260, schools.length * 28 + 50);
                canvasWrapper.style.height = `${dynamicHeight}px`;
            } else {
                canvasWrapper.style.height = "260px";
            }
        }

        const isAllFilter = !this.chartFolderFilter || this.chartFolderFilter === "all";
        const selectedFolder = this.chartFolderFilter;

        let labels = [];
        let datasetData = [];
        let backgroundColors = [];
        let borderColors = [];
        let schoolDetails = [];

        if (isAllFilter) {
            // MODE A: SEMUA FOLDER (Kepatuhan Kelengkapan Folder Tiap Sekolah)
            const totalTarget = Math.max(folders.length, 1);
            let totalCompletedAllSchools = 0;

            schools.forEach(schoolName => {
                const sReports = allReports.filter(r => (r.asalSekolah || "").toLowerCase() === schoolName.toLowerCase());
                
                let completedCount = 0;
                let missingFolders = [];
                let uploadedFolders = [];

                folders.forEach(f => {
                    const fLower = f.toLowerCase();
                    const hasF = sReports.some(r => {
                        const j = (r.jenisPelaporan || "").toLowerCase();
                        const k = (r.kategori || "").toLowerCase();
                        return j === fLower || k === fLower || j.includes(fLower) || fLower.includes(j);
                    });
                    if (hasF) {
                        completedCount++;
                        uploadedFolders.push(f);
                    } else {
                        missingFolders.push(f);
                    }
                });

                const pct = Math.round((completedCount / totalTarget) * 100);
                totalCompletedAllSchools += pct;

                // Hitung "Perlu Perhatian" — tentukan alasan
                const attentionReasons = [];
                const rejectedCount = sReports.filter(r => r.status === "Ditolak" || r.status === "Perlu Perbaikan").length;
                const waitingCount  = sReports.filter(r => r.status === "Menunggu Verifikasi" || r.status === "Menunggu").length;
                const approvedCount = sReports.filter(r => r.status === "Disetujui").length;

                if (sReports.length === 0) {
                    attentionReasons.push("Belum ada laporan yang diunggah sama sekali");
                } else {
                    if (rejectedCount > 0) {
                        attentionReasons.push(`${rejectedCount} laporan perlu perbaikan / ditolak`);
                    }
                    if (missingFolders.length >= Math.ceil(totalTarget / 2) && totalTarget > 0) {
                        attentionReasons.push(`${missingFolders.length} dari ${totalTarget} folder belum diisi`);
                    }
                    if (waitingCount > 0 && approvedCount === 0 && rejectedCount === 0) {
                        attentionReasons.push("Semua laporan masih menunggu verifikasi");
                    }
                }

                labels.push(schoolName);
                datasetData.push(completedCount);
                schoolDetails.push({
                    school: schoolName,
                    completed: completedCount,
                    totalTarget: totalTarget,
                    percent: pct,
                    missing: missingFolders,
                    uploaded: uploadedFolders,
                    attentionReasons: attentionReasons
                });

                // Warna progress: hijau (100%), biru (>=60%), amber (>=30%), merah (<30%)
                if (pct === 100) {
                    backgroundColors.push('rgba(16, 185, 129, 0.85)');
                    borderColors.push('#10b981');
                } else if (pct >= 60) {
                    backgroundColors.push('rgba(59, 130, 246, 0.85)');
                    borderColors.push('#3b82f6');
                } else if (pct >= 30) {
                    backgroundColors.push('rgba(245, 158, 11, 0.85)');
                    borderColors.push('#f59e0b');
                } else {
                    backgroundColors.push('rgba(239, 68, 68, 0.85)');
                    borderColors.push('#ef4444');
                }
            });

            const avgPct = Math.round(totalCompletedAllSchools / schools.length);
            if (subtitleEl) {
                subtitleEl.innerText = `Menampilkan kelengkapan upload dari total ${folders.length} folder laporan aktif`;
            }
            if (kpiBadgeEl) {
                kpiBadgeEl.className = avgPct >= 75
                    ? "font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200"
                    : (avgPct >= 50
                        ? "font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200"
                        : "font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200");
                kpiBadgeEl.innerText = `Rata-rata: ${avgPct}% Lengkap (${folders.length} Folder)`;
            }

        } else {
            // MODE B: FILTER FOLDER KHUSUS (Misal: "Laporan RKAS")
            const fLower = selectedFolder.toLowerCase();
            let schoolsUploadedCount = 0;

            schools.forEach(schoolName => {
                const matching = allReports.filter(r => {
                    if ((r.asalSekolah || "").toLowerCase() !== schoolName.toLowerCase()) return false;
                    const j = (r.jenisPelaporan || "").toLowerCase();
                    const k = (r.kategori || "").toLowerCase();
                    return j === fLower || k === fLower || j.includes(fLower) || fLower.includes(j);
                });

                const count = matching.length;
                if (count > 0) schoolsUploadedCount++;

                // Hitung alasan perlu perhatian untuk Mode B
                const attentionReasons = [];
                if (count === 0) {
                    attentionReasons.push(`Belum mengunggah berkas untuk folder "${selectedFolder}"`);
                } else {
                    const rejectedB = matching.filter(r => r.status === "Ditolak" || r.status === "Perlu Perbaikan").length;
                    const waitingB  = matching.filter(r => r.status === "Menunggu Verifikasi" || r.status === "Menunggu").length;
                    const approvedB = matching.filter(r => r.status === "Disetujui").length;
                    if (rejectedB > 0) {
                        attentionReasons.push(`${rejectedB} berkas ditolak / perlu perbaikan`);
                    }
                    if (waitingB > 0 && approvedB === 0 && rejectedB === 0) {
                        attentionReasons.push("Semua berkas masih menunggu verifikasi");
                    }
                }

                labels.push(schoolName);
                datasetData.push(count);
                schoolDetails.push({
                    school: schoolName,
                    count: count,
                    isUploaded: count > 0,
                    folder: selectedFolder,
                    attentionReasons: attentionReasons
                });

                if (count > 0) {
                    backgroundColors.push('rgba(16, 185, 129, 0.85)');
                    borderColors.push('#10b981');
                } else {
                    backgroundColors.push('rgba(254, 202, 202, 0.55)');
                    borderColors.push('#ef4444');
                }
            });

            const compliancePct = Math.round((schoolsUploadedCount / schools.length) * 100);
            if (subtitleEl) {
                subtitleEl.innerText = `Status pengunggahan berkas "${selectedFolder}" pada seluruh sekolah binaan`;
            }
            if (kpiBadgeEl) {
                kpiBadgeEl.className = compliancePct >= 80
                    ? "font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200"
                    : (compliancePct >= 50
                        ? "font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200"
                        : "font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200");
                kpiBadgeEl.innerText = `${schoolsUploadedCount} / ${schools.length} Sekolah Sudah Upload (${compliancePct}%)`;
            }
        }

        const ctx = canvas.getContext('2d');
        if (this.chartPerbandinganInstance) {
            this.chartPerbandinganInstance.destroy();
        }

        // Gunakan horizontal bar (indexAxis: 'y') jika sekolah >= 3 agar nama sekolah mudah dibaca
        const isHorizontal = schools.length >= 3;

        this.chartPerbandinganInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: isAllFilter ? 'Folder Terunggah' : `Berkas ${selectedFolder}`,
                    data: datasetData,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    borderRadius: 6,
                    maxBarThickness: 24
                }]
            },
            options: {
                indexAxis: isHorizontal ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 15,
                        top: 5,
                        bottom: 5
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        padding: 10,
                        titleFont: { family: 'Poppins', size: 12, weight: 'bold' },
                        bodyFont: { family: 'Poppins', size: 11 },
                        callbacks: {
                            title: (items) => items[0].label,
                            label: (item) => {
                                const s = schoolDetails[item.dataIndex];
                                if (isAllFilter) {
                                    return ` Kelengkapan: ${item.raw} dari ${s.totalTarget} folder (${s.percent}%)`;
                                } else {
                                    return s.isUploaded 
                                        ? ` ✅ Sudah Upload: ${item.raw} berkas (${selectedFolder})`
                                        : ` ❌ Belum Mengunggah (${selectedFolder})`;
                                }
                            },
                            afterLabel: (item) => {
                                const s = schoolDetails[item.dataIndex];
                                if (isAllFilter && s.missing && s.missing.length > 0) {
                                    const missingSample = s.missing.slice(0, 2).join(", ");
                                    const more = s.missing.length > 2 ? ` (+${s.missing.length - 2} lagi)` : "";
                                    return ` Belum: ${missingSample}${more}`;
                                }
                                return null;
                            }
                        }
                    }
                },
                scales: isHorizontal ? {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            precision: 0,
                            font: { family: 'Poppins', size: 10 }
                        },
                        grid: { color: '#F0EBE1' }
                    },
                    y: {
                        afterFit: (axis) => {
                            axis.width = Math.max(axis.width, 135);
                        },
                        ticks: {
                            font: { family: 'Poppins', size: window.innerWidth < 640 ? 9 : 11, weight: '500' },
                            color: '#334155',
                            padding: 6
                        },
                        grid: { display: false }
                    }
                } : {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            precision: 0,
                            font: { family: 'Poppins', size: 10 }
                        },
                        grid: { color: '#F0EBE1' }
                    },
                    x: {
                        ticks: {
                            font: { family: 'Poppins', size: 10, weight: '500' },
                            color: '#334155'
                        },
                        grid: { display: false }
                    }
                }
            }
        });

        // Tampilkan daftar sekolah yang perlu perhatian di bawah grafik
        this.renderAttentionList(schoolDetails);
    },

    /**
     * Render daftar sekolah yang perlu perhatian pengawas di bawah grafik kepatuhan
     */
    renderAttentionList(schoolDetails) {
        const container = document.getElementById("chart-attention-list");
        if (!container) return;

        const needsAttention = (schoolDetails || []).filter(s => s.attentionReasons && s.attentionReasons.length > 0);

        if (needsAttention.length === 0) {
            container.className = "hidden mt-3 space-y-1.5 text-xs";
            container.innerHTML = "";
            return;
        }

        container.className = "mt-3 space-y-1.5 text-xs";

        let html = `
            <div class="flex items-center gap-2 mb-2 pt-2 border-t border-[#F0EBE1]">
                <span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    ${needsAttention.length} Sekolah Perlu Perhatian
                </span>
                <span class="text-[10px] text-slate-400 hidden sm:inline">Detail alasan di bawah ini</span>
            </div>`;

        needsAttention.forEach(s => {
            html += `
            <div class="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <div class="flex items-center gap-1.5 min-w-[160px] sm:min-w-[180px]">
                    <i class="fa-solid fa-school text-amber-600 flex-shrink-0 text-[11px]"></i>
                    <span class="font-bold text-slate-800 text-[11px] leading-tight">${s.school}</span>
                </div>
                <ul class="flex flex-col gap-0.5 flex-1">
                    ${s.attentionReasons.map(r => `
                        <li class="flex items-start gap-1 text-[11px] text-amber-800">
                            <i class="fa-solid fa-circle-exclamation text-[9px] mt-0.5 flex-shrink-0 text-amber-500"></i>
                            <span>${r}</span>
                        </li>`).join("")}
                </ul>
            </div>`;
        });

        container.innerHTML = html;
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
