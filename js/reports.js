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
            const school = item.asalSekolah || userSchool || "SD 04 Pinoh";
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
        this.selectedSchoolState = schoolName;
        this.selectedTypeState = ""; // Reset pilihan subfolder/tabel agar kembali ke tampilan kartu folder

        document.getElementById(`cards-container-${type}`).classList.add("hidden");
        document.getElementById(`subcards-container-${type}`).classList.remove("hidden");
        document.getElementById(`table-container-${type}`).classList.add("hidden");

        document.getElementById(`selected-school-title-${type}`).innerText = schoolName;

        // Kontrol tombol kembali & tambah folder sesuai peran
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const isPengawas = currentUser && currentUser.role === "Pengawas";
        const isGuru = currentUser && currentUser.role === "Guru";

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
        const schoolReports = rawData.filter(x => (x.asalSekolah || "SD 04 Pinoh").toLowerCase() === schoolName.toLowerCase());

        if (type === 'guru') {
            this.renderSubCardsGuru(schoolName);
        } else {
            this.renderSubCardsKepsek(schoolName);
        }
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

        const targetKeyKepsek = `${targetSchool.trim().toLowerCase()}:laporan kepala sekolah`;
        const isKepsekHidden = hiddenList.includes(targetKeyKepsek) || 
                               localHidden.includes(targetKeyKepsek) || 
                               isDeletedInFolders("laporan kepala sekolah");

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

        // 1. Folder Utama Laporan Kepala Sekolah (1 Folder saja)
        if (!isKepsekHidden) {
            const totalKepsek = schoolReports.length;
            html += `
                <div onclick="ReportManager.openSubFolderTable('kepsek', 'Laporan Kepala Sekolah')"
                    class="bg-white p-5 sm:p-6 rounded-2xl border border-[#E8E2D5] shadow-xs hover:shadow-md hover:border-amber-500 transition-all cursor-pointer group flex flex-col justify-between card-hover overflow-hidden">
                    <div class="flex items-start justify-between gap-3 mb-2.5 min-w-0 w-full">
                        <div class="flex items-start gap-3.5 min-w-0 flex-1">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-bold group-hover:bg-amber-600 group-hover:text-white transition-all flex-shrink-0">
                                <i class="fa-solid fa-briefcase"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <h4 class="font-bold text-slate-800 text-sm sm:text-base group-hover:text-amber-600 transition-colors leading-snug break-words line-clamp-2" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">Laporan Kepala Sekolah</h4>
                                <p class="text-[11px] sm:text-xs text-slate-400 mt-0.5">Arsip & Administrasi Utama</p>
                                <span class="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md border border-amber-200">${totalKepsek} Laporan</span>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-amber-600 text-xs sm:text-sm flex-shrink-0 mt-1"></i>
                    </div>
                    <div class="pt-2.5 border-t border-[#F0EBE1] flex items-center justify-between text-xs mt-1" onclick="event.stopPropagation()">
                        ${schoolDriveUrl ? `
                            <a href="${schoolDriveUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                <i class="fa-brands fa-google-drive"></i> Buka Drive
                            </a>
                        ` : '<span class="text-[10px] text-slate-400">Google Drive</span>'}
                        ${isPengawas ? `
                            <button onclick="ReportManager.confirmDeleteDefaultFolder('Laporan Kepala Sekolah', '${safeTargetSchool}')" title="Hapus Folder Laporan Kepala Sekolah" class="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-200 transition-colors">
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
        }

        // 2. Custom Folders Kepala Sekolah yang Dibuat Pengawas
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
                        ${f.driveFolderUrl ? `
                            <a href="${f.driveFolderUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                <i class="fa-brands fa-google-drive"></i> Buka Drive
                            </a>
                        ` : '<span class="text-[10px] text-slate-400">Google Drive</span>'}
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
                        ${f.driveFolderUrl ? `
                            <a href="${f.driveFolderUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                <i class="fa-brands fa-google-drive"></i> Buka Drive
                            </a>
                        ` : '<span class="text-[10px] text-slate-400">Google Drive</span>'}
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
                    <td colspan="7" class="p-8 text-center text-slate-400 font-medium">
                        <div class="max-w-md mx-auto space-y-2">
                            <i class="fa-regular fa-folder-open text-3xl text-slate-300"></i>
                            <p class="text-xs">${emptyMsg}</p>
                            ${driveUrl ? `
                                <div class="pt-2">
                                    <a href="${driveUrl}" target="_blank" class="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-bold bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl text-xs transition-colors">
                                        <i class="fa-brands fa-google-drive"></i> Buka Folder di Google Drive
                                    </a>
                                </div>
                            ` : ''}
                        </div>
                    </td>
                </tr>`;
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
            const canDelete = isPengawas || isOwner || isSchoolKepsek;

            tbody.innerHTML += `
                <tr class="hover:bg-[#FAF7F0] transition-colors border-b border-[#F0EBE1]">
                    <td class="p-3.5 whitespace-nowrap">
                        <p class="font-bold text-slate-800 font-mono text-xs">${item.id}</p>
                        <p class="text-[10px] text-slate-400 font-medium">${item.tanggal}</p>
                    </td>
                    <td class="p-3.5 font-bold text-slate-800 whitespace-nowrap">${item.nama}</td>
                    <td class="p-3.5 font-medium text-slate-700 whitespace-nowrap">${item.kategori}</td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <a href="${item.fileUrl}" target="_blank" class="inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-700 font-bold bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 px-2.5 py-1 rounded-lg text-xs transition-colors shadow-2xs">
                            ${ReportManager.getFileIcon(item.fileUrl, item.namaFile || item.filename, item.kategori)} <span>Buka Berkas</span>
                        </a>
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">${DashboardManager.getStatusBadge(item.status)}</td>
                    <td class="p-3.5 text-slate-600 text-xs max-w-[200px] truncate" title="${item.catatan && item.catatan !== '-' ? item.catatan : ''}">
                        ${item.catatan && item.catatan !== '-' && item.catatan !== 'Belum ada catatan' ? `<span class="italic text-slate-700 font-medium">"${item.catatan}"</span>` : '<span class="text-slate-400">-</span>'}
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <div class="inline-flex items-center justify-center gap-1.5">
                            ${canVerify ? `
                                <button onclick="ReportManager.openModalVerifikasi('${item.id}', '${item.nama}', '${item.status}', '${item.catatan}', '${targetSheet}')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-sm text-xs transition-colors flex items-center gap-1">
                                    <i class="fa-solid fa-file-circle-check"></i> Verifikasi
                                </button>
                            ` : ''}
                            ${canDelete ? `
                                <button onclick="ReportManager.confirmDeleteReport('${item.id}', '${item.nama}', '${targetSheet}')" title="${isOwner ? 'Hapus Berkas Saya' : 'Hapus Laporan'}" class="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2.5 py-1.5 rounded-xl border border-rose-200 text-xs transition-colors">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            ` : ''}
                            ${!canVerify && !canDelete ? `<span class="text-slate-400 text-xs">-</span>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });
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
            if (this.selectedTypeState) {
                this.openSubFolderTable(targetSheet === "Laporan_Kepsek" ? "kepsek" : "guru", this.selectedTypeState);
            }
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
     * Konfirmasi hapus folder bawaan (Mingguan / Daring)
     */
    async confirmDeleteDefaultFolder(folderType, schoolName) {
        const targetSchool = (schoolName || this.selectedSchoolState || "").trim();
        const confirmed = await App.confirmModal({
            title: `Hapus Folder Laporan ${folderType}`,
            message: `Apakah Anda yakin ingin menghapus folder <strong>"Laporan ${folderType}"</strong> untuk sekolah <strong>${targetSchool}</strong>?`,
            subMessage: "Folder ini akan dihapus dari daftar tampilan Laporan Guru sekolah Anda.",
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
        const key = `${targetSchool.toLowerCase()}:${folderType.toLowerCase()}`;

        // 1. Simpan di LiveSync / localStorage secara lokal untuk perubahan instan 0ms
        if (typeof LiveSync !== "undefined") {
            if (!LiveSync.state.hiddenDefaultFolders) {
                LiveSync.state.hiddenDefaultFolders = [];
            }
            if (!LiveSync.state.hiddenDefaultFolders.includes(key)) {
                LiveSync.state.hiddenDefaultFolders.push(key);
            }
            if (!LiveSync.state.folders) {
                LiveSync.state.folders = [];
            }
            LiveSync.state.folders.push({
                id: "DEL-TEMP-" + Date.now(),
                namaFolder: `__DELETED__:${folderType}`,
                namaSekolah: targetSchool,
                targetType: "single",
                driveFolderUrl: "",
                createdAt: "Baru saja",
                subCategory: "guru"
            });
            LiveSync.saveHiddenDefaultFolders();
            this.refreshFolderViews(targetSchool);
        }

        try {
            let hidden = JSON.parse(localStorage.getItem("pantausekolah_hidden_default_folders") || "[]");
            if (!hidden.includes(key)) hidden.push(key);
            localStorage.setItem("pantausekolah_hidden_default_folders", JSON.stringify(hidden));
            this.refreshFolderViews(targetSchool);
        } catch (e) {}

        App.showToast(`Folder Laporan ${folderType} berhasil dihapus.`, "success");

        // 2. Kirim ke backend di background
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (currentUser) {
            ApiService.post({
                action: "delete_default_folder",
                schoolName: targetSchool,
                folderType: folderType,
                subCategory: "guru",
                currentUserRole: currentUser.role,
                currentUserSchool: currentUser.asal_sekolah || ""
            }).then(() => {
                if (typeof LiveSync !== "undefined") {
                    LiveSync.sync({ silent: true });
                }
            }).catch(() => {});
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
     * Modal Verifikasi Laporan
     */
    openModalVerifikasi(id, nama, status, catatan, targetSheet) {
        this.activeSelectedId = id;
        this.activeTargetSheet = targetSheet;

        document.getElementById("modal-id-laporan").innerText = "ID: " + id;
        document.getElementById("modal-user-name").innerText = "Pengirim: " + nama;
        document.getElementById("modal-status").value = (status !== "Menunggu Verifikasi" && status !== "Menunggu Pengawas" && status !== "Menunggu Kepsek") ? status : "Disetujui";
        
        const catatanInput = document.getElementById("modal-catatan");
        catatanInput.value = (catatan !== "Belum ada catatan" && catatan !== "-") ? catatan : "";

        document.getElementById("modal-verifikasi").classList.remove("hidden");

        // Auto-focus pada dropdown status verifikasi
        setTimeout(() => {
            const statusSelect = document.getElementById("modal-status");
            if (statusSelect) statusSelect.focus();
        }, 50);

        // Enter di catatan langsung menyimpan verifikasi (Shift+Enter untuk baris baru)
        catatanInput.onkeydown = (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.simpanVerifikasi();
            }
        };

        // Escape key handler
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
            if (this.selectedTypeState) {
                this.openSubFolderTable(targetSheet === "Laporan_Kepsek" ? "kepsek" : "guru", this.selectedTypeState);
            }
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
            // Cek folder default Kepala Sekolah
            const targetKeyKepsek = `${schoolName.toLowerCase()}:laporan kepala sekolah`;
            const isKepsekHidden = hiddenList.includes(targetKeyKepsek) || 
                                   localHidden.includes(targetKeyKepsek) || 
                                   isDeletedInFolders("laporan kepala sekolah");
            if (!isKepsekHidden) {
                activeFolders.push("Laporan Kepala Sekolah");
            }

            // Custom Folders Kepala Sekolah (subCategory === 'kepsek')
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
                    filename: fileInput.name,
                    mimeType: mimeType,
                    filebase64: fileBase64
                }, uploadTimeout);

                if (res.status === "success") {
                    App.showToast("Dokumen berhasil diunggah ke Google Drive & Sheets!", "success");
                    document.getElementById("upload-form").reset();
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
     * Memuat modul khusus: Folder Dokumen Sekolah (Dedicated untuk Kepala Sekolah & Pengawas)
     */
    loadFolderSekolahView() {
        const user = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (!user) return;

        const isKepsek = user.role === "Kepala Sekolah" || user.role === "Kepsek";

        let schoolName = "";
        if (isKepsek) {
            schoolName = (user.asal_sekolah || "").trim();
        } else {
            // Pengawas: Ambil sekolah yang tersimpan di localStorage, atau yang sedang aktif, atau sekolah pertama
            let savedSchool = null;
            try {
                savedSchool = localStorage.getItem("pantausekolah_folder_sekolah_school");
            } catch (e) {}
            const schools = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.schools) 
                ? DashboardManager.cachedData.schools 
                : [];
            schoolName = savedSchool || this.selectedSchoolFolderSekolah || (schools[0] ? schools[0].nama : "SD Karya Bangsa");
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
        const targetSchool = (schoolName || this.selectedSchoolFolderSekolah || (user.asal_sekolah || "")).trim();
        if (!targetSchool) return;

        this.selectedSchoolFolderSekolah = targetSchool;
        this.selectedSchoolState = targetSchool;
        try {
            localStorage.setItem("pantausekolah_folder_sekolah_school", targetSchool);
        } catch (e) {}
        const safeTargetSchool = targetSchool.replace(/'/g, "\\'");

        // 1. Ambil URL Drive Utama Sekolah
        const schoolsMeta = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.schools) 
            ? DashboardManager.cachedData.schools 
            : [];
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
            if (schoolDriveUrl && schoolDriveUrl !== "#" && schoolDriveUrl !== "undefined") {
                rootDriveBtn.href = schoolDriveUrl;
                rootDriveBtn.classList.remove("opacity-50", "pointer-events-none");
            } else {
                rootDriveBtn.href = "#";
                rootDriveBtn.classList.add("opacity-50", "pointer-events-none");
            }
        }
        if (addFolderBtn) {
            addFolderBtn.style.display = (isPengawas || isKepsek) ? "inline-flex" : "none";
        }
        const addKepsekFolderBtn = document.getElementById("folder-sekolah-add-kepsek-btn");
        if (addKepsekFolderBtn) {
            addKepsekFolderBtn.style.display = isPengawas ? "inline-flex" : "none";
        }

        // 3. Switcher Sekolah (Hanya untuk Pengawas jika memiliki banyak sekolah binaan)
        const switcherWrapper = document.getElementById("wrapper-folder-sekolah-switcher");
        const pillsContainer = document.getElementById("pills-folder-sekolah-schools");
        if (switcherWrapper && pillsContainer) {
            if (isPengawas && schoolsMeta.length > 1) {
                switcherWrapper.classList.remove("hidden");
                pillsContainer.innerHTML = schoolsMeta.map(s => {
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
                    <div class="bg-white p-5 rounded-2xl border border-[#E8E2D5] shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 overflow-hidden">
                        <div class="flex items-start gap-3.5 w-full min-w-0">
                            <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold border border-emerald-100 flex-shrink-0">
                                <i class="fa-solid fa-folder-open"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <h4 class="font-bold text-slate-800 text-sm leading-snug break-words line-clamp-2" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;" title="${f.namaFolder}">${f.namaFolder}</h4>
                                <p class="text-[11px] text-slate-400 mt-0.5">Folder Dokumen Guru</p>
                                <span class="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">${countCustom} Berkas</span>
                            </div>
                        </div>
                        <div class="pt-3 border-t border-[#F0EBE1] flex items-center justify-between text-xs">
                            ${f.driveFolderUrl ? `
                                <a href="${f.driveFolderUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                    <i class="fa-brands fa-google-drive"></i> Buka Drive
                                </a>
                            ` : '<span class="text-[10px] text-slate-400 font-medium">Google Drive</span>'}
                            ${(isPengawas || isKepsek) ? `
                                <button onclick="ReportManager.confirmDeleteGuruFolder('${f.id}', '${safeFldName}', '${safeTargetSchool}')" title="Hapus Folder" class="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-200 transition-colors">
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

            const targetKeyKepsek = `${targetSchool.trim().toLowerCase()}:laporan kepala sekolah`;
            const isKepsekHidden = hiddenList.includes(targetKeyKepsek) || 
                                   localHidden.includes(targetKeyKepsek) || 
                                   isDeletedInFolders("laporan kepala sekolah");

            let htmlKepsek = "";

            // 1. Folder Utama Laporan Kepala Sekolah (1 Folder saja)
            if (!isKepsekHidden) {
                const totalKepsek = schoolReportsKepsek.length;
                htmlKepsek += `
                    <div class="bg-white p-5 rounded-2xl border border-[#E8E2D5] shadow-xs hover:shadow-md hover:border-amber-400 transition-all flex flex-col justify-between gap-3 overflow-hidden">
                        <div class="flex items-start gap-3.5 w-full min-w-0">
                            <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold border border-amber-100 flex-shrink-0">
                                <i class="fa-solid fa-briefcase"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <h4 class="font-bold text-slate-800 text-sm leading-snug break-words line-clamp-2" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">Laporan Kepala Sekolah</h4>
                                <p class="text-[11px] text-slate-400 mt-0.5">Arsip & Administrasi Utama</p>
                                <span class="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md border border-amber-100">${totalKepsek} Berkas</span>
                            </div>
                        </div>
                        <div class="pt-3 border-t border-[#F0EBE1] flex items-center justify-between text-xs">
                            ${schoolDriveUrl ? `
                                <a href="${schoolDriveUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                    <i class="fa-brands fa-google-drive"></i> Buka Drive
                                </a>
                            ` : '<span class="text-[10px] text-slate-400 font-medium">Google Drive</span>'}
                            ${isPengawas ? `
                                <button onclick="ReportManager.confirmDeleteDefaultFolder('Laporan Kepala Sekolah', '${safeTargetSchool}')" title="Hapus Folder Laporan Kepala Sekolah" class="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-200 transition-colors">
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
            }

            // 2. Folder Tambahan Kepala Sekolah (Dibuat Pengawas)
            uniqueFoldersKepsek.forEach(f => {
                const countCustom = schoolReportsKepsek.filter(x => {
                    const repType = (x.jenisPelaporan || x.kategori || '').toLowerCase();
                    return repType.includes(f.namaFolder.toLowerCase());
                }).length;
                const safeFldName = f.namaFolder.replace(/'/g, "\\'");

                htmlKepsek += `
                    <div class="bg-white p-5 rounded-2xl border border-[#E8E2D5] shadow-xs hover:shadow-md hover:border-amber-400 transition-all flex flex-col justify-between gap-3 overflow-hidden">
                        <div class="flex items-start gap-3.5 w-full min-w-0">
                            <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold border border-amber-100 flex-shrink-0">
                                <i class="fa-solid fa-folder-closed"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <h4 class="font-bold text-slate-800 text-sm leading-snug break-words line-clamp-2" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;" title="${f.namaFolder}">${f.namaFolder}</h4>
                                <p class="text-[11px] text-slate-400 mt-0.5">Folder Khusus Kepala Sekolah</p>
                                <span class="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md border border-amber-100">${countCustom} Berkas</span>
                            </div>
                        </div>
                        <div class="pt-3 border-t border-[#F0EBE1] flex items-center justify-between text-xs">
                            ${f.driveFolderUrl ? `
                                <a href="${f.driveFolderUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1.5 hover:underline">
                                    <i class="fa-brands fa-google-drive"></i> Buka Drive
                                </a>
                            ` : '<span class="text-[10px] text-slate-400 font-medium">Google Drive</span>'}
                            ${isPengawas ? `
                                <button onclick="ReportManager.confirmDeleteGuruFolder('${f.id}', '${safeFldName}', '${safeTargetSchool}')" title="Hapus Folder Khusus Kepala Sekolah" class="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-200 transition-colors">
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
    }
};
