/**
 * ==========================================================================
 * PantauSekolah - Real-time Live Sync & Cache Module (sync.js)
 * ==========================================================================
 * Fitur:
 * 1. Cache-First (Instant 0ms render saat buka aplikasi / pindah tab).
 * 2. Background Auto Live Sync (sinkronisasi otomatis tiap 10-15 detik tanpa reload).
 * 3. Optimistic UI Updates (Hapus, Verifikasi, Tambah langsung berubah 0ms).
 * 4. Backward-compatible fallback (Parallel fetch jika GAS belum deploy sync_all).
 * ==========================================================================
 */

const LiveSync = {
    STORAGE_KEY: "pantausekolah_live_cache_v2",
    SYNC_INTERVAL_MS: 12000, // Sync otomatis tiap 12 detik

    state: {
        reportsKepsek: [],
        reportsGuru: [],
        allActivity: [],
        schools: [],
        users: [],
        folders: [],
        auditLogs: [],
        hiddenDefaultFolders: [],
        lastSyncTime: null,
        dataHash: ""
    },

    isSyncing: false,
    intervalId: null,

    /**
     * Inisialisasi LiveSync saat aplikasi dimulai
     */
    init() {
        // 1. Muat cache dari LocalStorage terlebih dahulu agar UI instan 0ms
        this.loadFromLocalStorage();

        // 2. Hubungkan state dengan modul-modul lain
        this.bindModules();

        // 3. Jalankan initial background sync segera
        this.sync({ force: true, silent: true });

        // 4. Mulai interval live sync otomatis
        this.startAutoSync();

        // 5. Sync saat tab browser kembali aktif (visibilitychange)
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                this.sync({ silent: true });
            }
        });
    },

    /**
     * Normalisasi data sekolah agar selalu unik (mencegah duplikasi nama sekolah),
     * memiliki properti id, nama, driveFolderUrl, dan driveUrl,
     * serta auto-discovery sekolah yang ada di daftar pengguna jika belum terdaftar di tabel sekolah
     */
    normalizeSchools(schoolsList) {
        if (!Array.isArray(schoolsList)) schoolsList = [];
        const seen = new Map();

        schoolsList.forEach((s, idx) => {
            if (!s) return;
            const sName = (s.nama || "").trim();
            if (!sName || sName.toLowerCase() === "dinas pendidikan" || sName.toLowerCase() === "dinas") return;
            const lower = sName.toLowerCase();
            const url = s.driveFolderUrl || s.driveUrl || "";
            const folderId = s.driveFolderId || s.id || "";

            if (seen.has(lower)) {
                // Jika sudah ada sebelumnya, gabungkan (utamakan URL Drive yang valid jika ada yang kosong)
                const existing = seen.get(lower);
                if ((!existing.driveFolderUrl || existing.driveFolderUrl === "#") && url && url !== "#") {
                    existing.driveFolderUrl = url;
                    existing.driveUrl = url;
                }
                if (!existing.driveFolderId && folderId) {
                    existing.driveFolderId = folderId;
                }
            } else {
                seen.set(lower, {
                    id: s.id || s.driveFolderId || `SCH-${String(seen.size + 1).padStart(3, '0')}`,
                    nama: sName,
                    driveFolderId: folderId,
                    driveFolderUrl: url,
                    driveUrl: url
                });
            }
        });

        // AUTO-DISCOVERY: Temukan sekolah dari daftar pengguna jika belum terdaftar di tabel sekolah
        if (Array.isArray(this.state.users)) {
            this.state.users.forEach(u => {
                const userSchool = (u.asalSekolah || "").trim();
                if (!userSchool) return;
                const lower = userSchool.toLowerCase();
                if (lower !== "dinas pendidikan" && lower !== "dinas" && !seen.has(lower)) {
                    const fallbackUrl = u.driveUrl || "";
                    seen.set(lower, {
                        id: `SCH-${String(seen.size + 1).padStart(3, '0')}`,
                        nama: userSchool,
                        driveFolderId: "",
                        driveFolderUrl: fallbackUrl,
                        driveUrl: fallbackUrl
                    });
                }
            });
        }

        const result = Array.from(seen.values());
        return result.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    },

    /**
     * Menghubungkan LiveSync state dengan modul lain
     */
    bindModules() {
        const normalizedSchools = this.normalizeSchools(this.state.schools);

        if (typeof DashboardManager !== "undefined") {
            DashboardManager.cachedData = {
                reportsKepsek: this.state.reportsKepsek,
                reportsGuru: this.state.reportsGuru,
                allActivity: this.state.allActivity,
                schools: normalizedSchools
            };
        }
        if (typeof UserManager !== "undefined") {
            UserManager.cachedUsers = this.state.users;
        }
        if (typeof DriveManager !== "undefined") {
            DriveManager.cachedSchools = normalizedSchools;
            DriveManager.cachedFolders = this.state.folders;
        }
        if (typeof AuditManager !== "undefined") {
            AuditManager.cachedLogs = this.state.auditLogs || [];
        }

        // Ekstrak penanda folder default yang dihapus (__DELETED__:)
        this.state.hiddenDefaultFolders = [];
        if (Array.isArray(this.state.folders)) {
            this.state.folders.forEach(f => {
                if (f.namaFolder && f.namaFolder.includes("__DELETED__:")) {
                    const parts = f.namaFolder.split("__DELETED__:");
                    const type = (parts[1] || "").trim().toLowerCase();
                    const sch = (f.namaSekolah || "").trim().toLowerCase();
                    if (type) {
                        if (sch) {
                            const key = `${sch}:${type}`;
                            if (!this.state.hiddenDefaultFolders.includes(key)) {
                                this.state.hiddenDefaultFolders.push(key);
                            }
                        }
                        if (f.targetType === "all" || !sch) {
                            normalizedSchools.forEach(s => {
                                const sKey = `${(s.nama || "").trim().toLowerCase()}:${type}`;
                                if (!this.state.hiddenDefaultFolders.includes(sKey)) {
                                    this.state.hiddenDefaultFolders.push(sKey);
                                }
                            });
                        }
                    }
                }
            });
        }
        try {
            localStorage.setItem("pantausekolah_hidden_default_folders", JSON.stringify(this.state.hiddenDefaultFolders));
        } catch (e) {}
    },

    saveHiddenDefaultFolders() {
        this.saveToLocalStorage();
    },

    cleanFolders(folders) {
        return (folders || []).filter(f => 
            f && f.namaFolder && 
            !f.namaFolder.startsWith("__DELETED__:") && 
            !(f.id && f.id.toString().startsWith("DEL-"))
        );
    },

    /**
     * Muat cache lokal dari LocalStorage
     */
    loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.state = Object.assign(this.state, parsed);
                if (this.state.schools) {
                    this.state.schools = this.normalizeSchools(this.state.schools);
                }
                if (this.state.folders) {
                    this.state.folders = this.cleanFolders(this.state.folders);
                }
                this.updateLiveIndicator("Cache Siap (0ms)");
            }
        } catch (e) {
            console.warn("Gagal membaca cache lokal:", e);
        }
    },

    /**
     * Simpan state ke LocalStorage
     */
    saveToLocalStorage() {
        try {
            this.state.lastSyncTime = new Date().toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
            this.bindModules();
            this.updateLiveIndicator(`Tersinkron: ${this.state.lastSyncTime}`);
        } catch (e) {
            console.warn("Gagal menyimpan ke cache lokal:", e);
        }
    },

    /**
     * Memulai timer polling live sync di background
     */
    startAutoSync() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => {
            if (AuthService.isLoggedIn() && document.visibilityState === "visible") {
                this.sync({ silent: true });
            }
        }, this.SYNC_INTERVAL_MS);
    },

    /**
     * Proses Sync ke Server (GAS)
     */
    async sync({ force = false, silent = false } = {}) {
        if (this.isSyncing) return;
        if (!AuthService.isLoggedIn()) return;

        this.isSyncing = true;
        this.setSyncingUI(true);

        const currentUser = AuthService.getUser();

        try {
            let dataUpdated = false;

            // Percobaan 1: Cek apakah backend mendukung 'sync_all' (Super Cepat 1 roundtrip)
            let syncAllSuccess = false;
            try {
                const resAll = await ApiService.post({
                    action: "sync_all",
                    currentUserRole: currentUser.role,
                    asal_sekolah: currentUser.asal_sekolah
                });

                if (resAll && resAll.status === "success") {
                    syncAllSuccess = true;
                    this.state.reportsKepsek = resAll.reportsKepsek || [];
                    this.state.reportsGuru = resAll.reportsGuru || [];
                    this.state.allActivity = resAll.allActivity || [];
                    this.state.schools = this.normalizeSchools(resAll.schools || []);
                    this.state.users = resAll.users || [];
                    this.state.folders = this.cleanFolders(resAll.folders);
                    if (resAll.auditLogs) {
                        this.state.auditLogs = resAll.auditLogs;
                    }
                    dataUpdated = true;
                }
            } catch (err) {
                // Abaikan jika sync_all belum tersedia di deployment GAS
            }

            // Percobaan 2: Fallback Parallel Fetch (Promise.all) jika sync_all belum di-deploy di GAS
            if (!syncAllSuccess) {
                const promises = [
                    ApiService.post({
                        action: "get_dashboard_data",
                        currentUserRole: currentUser.role,
                        asal_sekolah: currentUser.asal_sekolah
                    }),
                    ApiService.post({ action: "get_users", role: currentUser.role, asal_sekolah: currentUser.asal_sekolah }),
                    ApiService.post({ action: "get_schools" }),
                    ApiService.post({
                        action: "get_drive_folders",
                        currentUserRole: currentUser.role,
                        asal_sekolah: currentUser.asal_sekolah
                    })
                ];

                const results = await Promise.all(promises);
                const dashRes = results[0];

                if (dashRes && dashRes.status === "success") {
                    this.state.reportsKepsek = dashRes.reportsKepsek || [];
                    this.state.reportsGuru = dashRes.reportsGuru || [];
                    this.state.allActivity = dashRes.allActivity || [];
                    if (dashRes.auditLogs) {
                        this.state.auditLogs = dashRes.auditLogs;
                    }
                    let schoolsRaw = dashRes.schools || [];
                    if (currentUser.role !== "Pengawas" && currentUser.asal_sekolah) {
                        schoolsRaw = schoolsRaw.filter(s => (s.nama || "").toLowerCase() === currentUser.asal_sekolah.toLowerCase());
                    }
                    this.state.schools = this.normalizeSchools(schoolsRaw);
                    if (Array.isArray(dashRes.folders) && dashRes.folders.length > 0) {
                        this.state.folders = this.cleanFolders(dashRes.folders);
                    }
                    dataUpdated = true;
                }

                if (results[1] && results[1].status === "success") {
                    this.state.users = results[1].users || [];
                    dataUpdated = true;
                }

                if (results[2] && results[2].status === "success") {
                    this.state.schools = this.normalizeSchools(results[2].schools || this.state.schools);
                    dataUpdated = true;
                }

                if (results[3] && results[3].status === "success") {
                    this.state.folders = this.cleanFolders(results[3].folders || this.state.folders);
                    dataUpdated = true;
                }
            }

            // Isolasi Folder Sekolah: Non-Pengawas HANYA boleh memiliki folder milik sekolahnya sendiri
            if (currentUser && currentUser.role !== "Pengawas" && currentUser.asal_sekolah) {
                const userSch = currentUser.asal_sekolah.trim().toLowerCase();
                this.state.folders = (this.state.folders || []).filter(f => {
                    const fSch = (f.namaSekolah || "").trim().toLowerCase();
                    if (!fSch) return false;
                    if (fSch === "semua" || fSch === "semua sekolah" || fSch === "all" || f.targetType === "all") return true;
                    return fSch === userSch;
                });
            }

            if (dataUpdated || force) {
                this.saveToLocalStorage();
                try {
                    this.renderAllViews();
                } catch (renderErr) {
                    console.error("LiveSync Render Error:", renderErr);
                }
            }

        } catch (err) {
            console.error("LiveSync Background Error:", err);
            if (!silent) {
                App.showToast("Gagal menyinkronkan data dengan server.", "error");
            }
        } finally {
            this.isSyncing = false;
            this.setSyncingUI(false);
        }
    },

    /**
     * Membandingkan apakah ada perubahan data
     */
    hasDataChanged(res) {
        const newTotal = (res.allActivity || []).length + (res.users || []).length + (res.folders || []).length;
        const oldTotal = this.state.allActivity.length + this.state.users.length + this.state.folders.length;
        return newTotal !== oldTotal || this.state.allActivity.length === 0;
    },

    /**
     * Re-render seluruh view yang sedang aktif secara mulus tanpa refresh halaman
     */
    renderAllViews() {
        this.bindModules();

        // 1. Re-render Dashboard
        if (typeof DashboardManager !== "undefined") {
            DashboardManager.renderStats();
            DashboardManager.renderCharts();
            DashboardManager.renderActivityFeed();
        }

        // 2. Re-render Folder Cards Laporan
        if (typeof ReportManager !== "undefined") {
            ReportManager.renderSchoolFolderCards('kepsek');
            ReportManager.renderSchoolFolderCards('guru');

            const curUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
            const isKepsek = curUser && (curUser.role === "Kepala Sekolah" || curUser.role === "Kepsek");
            const isGuru = curUser && curUser.role === "Guru";
            const targetGuruSchool = ReportManager.selectedSchoolState || ((isKepsek || isGuru) ? curUser.asal_sekolah : "");

            if (targetGuruSchool) {
                ReportManager.renderSubCardsGuru(targetGuruSchool);
                if (typeof ReportManager.renderSubCardsKepsek === "function") {
                    ReportManager.renderSubCardsKepsek(targetGuruSchool);
                }
                if (ReportManager.currentViewMode && ReportManager.currentViewMode.kepsek === "summary") {
                    ReportManager.renderSummaryPoinPenting("kepsek");
                }
                if (ReportManager.currentViewMode && ReportManager.currentViewMode.guru === "summary") {
                    ReportManager.renderSummaryPoinPenting("guru");
                }
                if (typeof ReportManager.updateBadgeCounts === "function") {
                    ReportManager.updateBadgeCounts();
                }
            }

            if (typeof ReportManager.populateUploadFolders === "function") {
                ReportManager.populateUploadFolders();
            }

            // Re-render Tab Folder Dokumen Sekolah (modul Kepala Sekolah)
            if (typeof ReportManager.renderFolderSekolahView === "function") {
                const schools = this.state.schools || [];
                const firstSchoolName = (schools[0]) ? schools[0].nama : "";
                if (isKepsek) {
                    if (curUser.asal_sekolah) {
                        ReportManager.renderFolderSekolahView(curUser.asal_sekolah);
                    } else if (typeof ReportManager.renderFolderSekolahEmptyState === "function") {
                        ReportManager.renderFolderSekolahEmptyState("Data sekolah untuk akun Kepala Sekolah Anda belum dikonfigurasikan.");
                    }
                } else {
                    // Pengawas
                    if (schools.length === 0) {
                        if (typeof ReportManager.renderFolderSekolahEmptyState === "function") {
                            ReportManager.renderFolderSekolahEmptyState("Belum ada laporan atau data sekolah binaan yang terdaftar pada sistem.");
                        }
                    } else {
                        const validSchool = (ReportManager.selectedSchoolFolderSekolah && schools.some(s => (s.nama || "").toLowerCase() === ReportManager.selectedSchoolFolderSekolah.toLowerCase()))
                            ? ReportManager.selectedSchoolFolderSekolah
                            : firstSchoolName;
                        if (validSchool) {
                            ReportManager.renderFolderSekolahView(validSchool);
                        }
                    }
                }
            }

            // Segarkan tabel subfolder HANYA JIKA pengguna memang sedang aktif membuka tabel tersebut
            const activeTabKepsek = document.getElementById("tab-verifikasi-kepsek");
            const isTabKepsekActive = activeTabKepsek && !activeTabKepsek.classList.contains("hidden");
            const targetType = isTabKepsekActive ? "kepsek" : "guru";
            const tableContainer = document.getElementById(`table-container-${targetType}`);
            const isTableVisible = tableContainer && !tableContainer.classList.contains("hidden");

            if (isTableVisible && ReportManager.selectedTypeState && targetGuruSchool) {
                ReportManager.renderSubFolderTable(targetType, ReportManager.selectedTypeState);
            } else if (!isTableVisible) {
                // Jika tabel sedang tertutup (menampilkan kartu folder), pastikan selectedTypeState kosong agar tidak auto-open
                ReportManager.selectedTypeState = "";
            }
        }

        // 3. Re-render Tabel Pengguna
        if (typeof UserManager !== "undefined") {
            UserManager.renderUserTable();
        }

        // 4. Re-render Drive Manager
        if (typeof DriveManager !== "undefined") {
            DriveManager.renderSchoolDriveCards();
            DriveManager.populateSchoolDropdown();
            DriveManager.renderCustomFoldersTable();
        }

        // 5. Re-render Audit Log (Khusus Pengawas)
        if (typeof AuditManager !== "undefined" && typeof AuditManager.onDataSynced === "function") {
            AuditManager.onDataSynced(this.state.auditLogs);
        }
    },

    // =========================================================================
    // OPTIMISTIC UI MUTATIONS (Perubahan Instan 0ms)
    // =========================================================================

    /**
     * Verifikasi laporan secara instan di UI lalu simpan di server
     */
    async optimisticVerifyReport(idLaporan, status, catatan, targetSheet) {
        // 1. Mutasi lokal segera
        const updateInArray = (arr) => {
            const item = arr.find(x => x.id === idLaporan);
            if (item) {
                item.status = status;
                item.catatan = catatan || "-";
            }
        };

        updateInArray(this.state.reportsKepsek);
        updateInArray(this.state.reportsGuru);
        updateInArray(this.state.allActivity);

        // 2. Simpan cache & render seketika (0 ms!)
        this.saveToLocalStorage();
        this.renderAllViews();
        App.showToast("✅ Verifikasi berhasil diperbarui!", "success");

        // 3. Kirim ke server di background tanpa memblokir UI
        try {
            await ApiService.post({
                action: "verifikasi_laporan",
                idLaporan: idLaporan,
                targetSheet: targetSheet,
                statusVerifikasi: status,
                catatanVerifikasi: catatan
            });
            // Re-sync senyap untuk memastikan konsistensi
            this.sync({ silent: true });
        } catch (err) {
            App.showToast("Gagal sinkronisasi verifikasi ke server.", "error");
        }
    },

    /**
     * Hapus laporan secara instan di UI lalu hapus di server (Mendukung single ID maupun batch array IDs)
     */
    async optimisticDeleteReport(idOrIds, targetSheet) {
        const ids = Array.isArray(idOrIds) ? idOrIds.map(x => x.toString().trim()) : [idOrIds.toString().trim()];
        const idSet = new Set(ids);

        // 1. Hapus dari array lokal seketika
        this.state.reportsKepsek = this.state.reportsKepsek.filter(x => !idSet.has(x.id ? x.id.toString().trim() : ""));
        this.state.reportsGuru = this.state.reportsGuru.filter(x => !idSet.has(x.id ? x.id.toString().trim() : ""));
        this.state.allActivity = this.state.allActivity.filter(x => !idSet.has(x.id ? x.id.toString().trim() : ""));

        // 2. Simpan cache & render seketika (0 ms!)
        this.saveToLocalStorage();
        this.renderAllViews();
        App.showToast(ids.length > 1 ? `🗑️ ${ids.length} Laporan berhasil dihapus.` : "🗑️ Laporan berhasil dihapus.", "success");

        // 3. Kirim ke server di background
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        try {
            const res = await ApiService.post({
                action: "delete_laporan",
                idLaporans: ids,
                idLaporan: ids[0],
                targetSheet: targetSheet,
                currentUserRole: currentUser ? currentUser.role : "Guru",
                currentUserName: currentUser ? currentUser.nama : "",
                currentUserUsername: currentUser ? currentUser.username : "",
                currentUserSchool: currentUser ? currentUser.asal_sekolah : ""
            });

            if (res && res.status === "error") {
                App.showToast(res.message || "Gagal menghapus laporan di server.", "error");
            }
            this.sync({ silent: true });
        } catch (err) {
            App.showToast("Gagal menghapus laporan di server.", "error");
        }
    },

    /**
     * Hapus user secara instan di UI lalu hapus di server (Mendukung single ID maupun batch array IDs)
     */
    async optimisticDeleteUser(userIdOrIds) {
        const ids = Array.isArray(userIdOrIds) ? userIdOrIds.map(x => x.toString().trim()) : [userIdOrIds.toString().trim()];
        const idSet = new Set(ids);

        // 1. Hapus dari array lokal
        this.state.users = this.state.users.filter(u => !idSet.has(u.id ? u.id.toString().trim() : ""));

        // 2. Simpan cache & render seketika (0 ms!)
        this.saveToLocalStorage();
        this.renderAllViews();
        App.showToast(ids.length > 1 ? `🗑️ ${ids.length} Pengguna berhasil dihapus.` : "🗑️ Pengguna berhasil dihapus.", "success");

        // 3. Kirim ke server di background
        const currentUser = AuthService.getUser();
        try {
            await ApiService.post({
                action: "delete_user",
                userIds: ids,
                userId: ids[0],
                currentUserRole: currentUser.role
            });
            this.sync({ silent: true });
        } catch (e) {
            App.showToast("Gagal menghapus pengguna di server.", "error");
        }
    },

    /**
     * Hapus folder Drive secara instan di UI lalu hapus di server (Mendukung single ID maupun batch array IDs)
     */
    async optimisticDeleteFolder(folderIdOrIds, schoolName) {
        const ids = Array.isArray(folderIdOrIds) ? folderIdOrIds.map(x => x.toString().trim()) : [folderIdOrIds.toString().trim()];
        const idSet = new Set(ids);

        // 1. Hapus dari array lokal
        if (schoolName) {
            this.state.folders = this.state.folders.filter(f => !(idSet.has(f.id ? f.id.toString().trim() : "") && (f.namaSekolah || "").toLowerCase() === schoolName.toLowerCase()));
        } else {
            this.state.folders = this.state.folders.filter(f => !idSet.has(f.id ? f.id.toString().trim() : ""));
        }

        // 2. Simpan cache & render seketika (0 ms!)
        this.saveToLocalStorage();
        this.renderAllViews();
        App.showToast(ids.length > 1 ? `🗑️ ${ids.length} Folder berhasil dihapus.` : "🗑️ Folder berhasil dihapus.", "success");

        // 3. Kirim ke server di background
        const currentUser = AuthService.getUser();
        try {
            await ApiService.post({
                action: "delete_drive_folder",
                folderIds: ids,
                folderId: ids[0],
                schoolName: schoolName || "",
                currentUserRole: currentUser.role,
                currentUserSchool: (currentUser ? currentUser.asal_sekolah : "")
            });
            this.sync({ silent: true });
        } catch (err) {
            App.showToast("Gagal menghapus folder di server.", "error");
        }
    },

    /**
     * Indikator status Live Sync di Navbar Header
     */
    setSyncingUI(isSyncing) {
        const icon = document.getElementById("icon-refresh-sync");
        const dot = document.getElementById("sync-live-dot");

        if (icon) {
            if (isSyncing) icon.classList.add("fa-spin");
            else icon.classList.remove("fa-spin");
        }

        if (dot) {
            if (isSyncing) {
                dot.className = "w-2 h-2 rounded-full bg-blue-500 animate-ping";
            } else {
                dot.className = "w-2 h-2 rounded-full bg-emerald-500";
            }
        }
    },

    updateLiveIndicator(text) {
        const el = document.getElementById("sync-live-text");
        if (el) el.innerText = text;
    }
};
