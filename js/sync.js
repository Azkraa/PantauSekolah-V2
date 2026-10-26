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
     * Dapatkan daftar sekolah yang telah dihapus permanen oleh pengawas
     */
    getDeletedSchoolsSet() {
        const set = new Set();
        try {
            const raw = localStorage.getItem("pantausekolah_deleted_schools");
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) arr.forEach(x => set.add(x.toString().trim().toLowerCase()));
            }
        } catch (e) {}
        return set;
    },

    /**
     * Dapatkan daftar username pengguna yang telah dihapus permanen
     */
    getDeletedUsernamesSet() {
        const set = new Set();
        try {
            const raw = localStorage.getItem("pantausekolah_deleted_usernames");
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) arr.forEach(x => set.add(x.toString().trim().toLowerCase()));
            }
        } catch (e) {}
        return set;
    },

    /**
     * Terapkan filter client-side untuk membuang sekolah / pengguna yang sudah dihapus permanen
     */
    applyClientFilters(data) {
        if (!data) return data;
        const deletedSchools = this.getDeletedSchoolsSet();
        const deletedUsers = this.getDeletedUsernamesSet();

        if (Array.isArray(data.schools)) {
            data.schools = data.schools.filter(s => !deletedSchools.has((s.nama || "").trim().toLowerCase()));
        }
        if (Array.isArray(data.users)) {
            data.users = data.users.filter(u => {
                const un = (u.username || "").trim().toLowerCase();
                const us = (u.asalSekolah || "").trim().toLowerCase();
                return !deletedUsers.has(un) && !deletedSchools.has(us);
            });
        }
        if (Array.isArray(data.folders)) {
            data.folders = data.folders.filter(f => !deletedSchools.has((f.namaSekolah || "").trim().toLowerCase()));
        }
        if (Array.isArray(data.reportsKepsek)) {
            data.reportsKepsek = data.reportsKepsek.filter(r => !deletedSchools.has((r.asalSekolah || "").trim().toLowerCase()));
        }
        if (Array.isArray(data.reportsGuru)) {
            data.reportsGuru = data.reportsGuru.filter(r => !deletedSchools.has((r.asalSekolah || "").trim().toLowerCase()));
        }
        if (Array.isArray(data.allActivity)) {
            data.allActivity = data.allActivity.filter(a => !deletedSchools.has((a.asalSekolah || "").trim().toLowerCase()));
        }
        return data;
    },

    /**
     * Normalisasi data sekolah agar selalu unik (mencegah duplikasi nama sekolah),
     * memiliki properti id, nama, driveFolderUrl, dan driveUrl,
     * serta auto-discovery sekolah yang ada di daftar pengguna jika belum terdaftar di tabel sekolah
     */
    normalizeSchools(schoolsList) {
        if (!Array.isArray(schoolsList)) schoolsList = [];
        const seen = new Map();
        const deletedSchools = this.getDeletedSchoolsSet();

        schoolsList.forEach((s, idx) => {
            if (!s) return;
            const sName = (s.nama || "").trim();
            if (!sName || sName.toLowerCase() === "dinas pendidikan" || sName.toLowerCase() === "dinas") return;
            const lower = sName.toLowerCase();
            if (deletedSchools.has(lower)) return; // Jangan masukkan sekolah yang telah dihapus permanen

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
                if (lower !== "dinas pendidikan" && lower !== "dinas" && !seen.has(lower) && !deletedSchools.has(lower)) {
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
        if (!Array.isArray(this.state.hiddenDefaultFolders)) {
            this.state.hiddenDefaultFolders = [];
        }
        try {
            const localHidden = JSON.parse(localStorage.getItem("pantausekolah_hidden_default_folders") || "[]");
            if (Array.isArray(localHidden)) {
                localHidden.forEach(k => {
                    if (!this.state.hiddenDefaultFolders.includes(k)) {
                        this.state.hiddenDefaultFolders.push(k);
                    }
                });
            }
        } catch (e) {}

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
                try {
                    const localHidden = JSON.parse(localStorage.getItem("pantausekolah_hidden_default_folders") || "[]");
                    if (Array.isArray(localHidden) && localHidden.length > 0) {
                        this.state.hiddenDefaultFolders = Array.from(new Set([
                            ...(this.state.hiddenDefaultFolders || []),
                            ...localHidden
                        ]));
                    }
                } catch (e) {}
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
                    this.applyClientFilters(this.state);
                    if (Array.isArray(resAll.hiddenDefaultFolders)) {
                        this.state.hiddenDefaultFolders = Array.from(new Set([
                            ...(this.state.hiddenDefaultFolders || []),
                            ...resAll.hiddenDefaultFolders
                        ]));
                        try {
                            localStorage.setItem("pantausekolah_hidden_default_folders", JSON.stringify(this.state.hiddenDefaultFolders));
                        } catch (e) {}
                    }
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
                    if (Array.isArray(dashRes.hiddenDefaultFolders)) {
                        this.state.hiddenDefaultFolders = Array.from(new Set([
                            ...(this.state.hiddenDefaultFolders || []),
                            ...dashRes.hiddenDefaultFolders
                        ]));
                        try {
                            localStorage.setItem("pantausekolah_hidden_default_folders", JSON.stringify(this.state.hiddenDefaultFolders));
                        } catch (e) {}
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
                this.applyClientFilters(this.state);
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
            const activeTabGuru = document.getElementById("tab-verifikasi-guru");
            const isTabGuruActive = activeTabGuru && !activeTabGuru.classList.contains("hidden");

            if (isTabKepsekActive) {
                const tableContainerKepsek = document.getElementById("table-container-kepsek");
                if (tableContainerKepsek && !tableContainerKepsek.classList.contains("hidden") && ReportManager.selectedTypeState) {
                    ReportManager.renderSubFolderTable("kepsek", ReportManager.selectedTypeState);
                }
            }

            if (isTabGuruActive) {
                const tableContainerGuru = document.getElementById("table-container-guru");
                if (tableContainerGuru && !tableContainerGuru.classList.contains("hidden") && ReportManager.selectedTypeState) {
                    ReportManager.renderSubFolderTable("guru", ReportManager.selectedTypeState);
                }
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
     * Update laporan secara instan di UI lalu kirim pembaruan ke server
     */
    async optimisticUpdateReport(updatedReport, targetSheet) {
        if (!updatedReport || !updatedReport.id) return;
        const repId = updatedReport.id.toString().trim();

        // 1. Update di array lokal seketika
        const updateInList = (list) => {
            return list.map(item => {
                if (item && item.id && item.id.toString().trim() === repId) {
                    return { ...item, ...updatedReport };
                }
                return item;
            });
        };

        this.state.reportsKepsek = updateInList(this.state.reportsKepsek);
        this.state.reportsGuru = updateInList(this.state.reportsGuru);
        this.state.allActivity = updateInList(this.state.allActivity);

        // 2. Simpan cache & render
        this.saveToLocalStorage();
        this.renderAllViews();
        App.showToast("Laporan berhasil diperbarui.", "success");

        // 3. Kirim ke server di background
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        try {
            const payload = {
                action: "update_laporan",
                idLaporan: repId,
                targetSheet: targetSheet,
                kategori: updatedReport.kategori,
                jenisPelaporan: updatedReport.jenisPelaporan,
                poinPenting: updatedReport.poinPenting,
                filebase64: updatedReport.filebase64 || undefined,
                filename: updatedReport.filename || undefined,
                mimeType: updatedReport.mimeType || undefined,
                currentUserRole: currentUser ? currentUser.role : "Guru",
                currentUserName: currentUser ? currentUser.nama : "",
                currentUserUsername: currentUser ? currentUser.username : "",
                currentUserSchool: currentUser ? currentUser.asal_sekolah : ""
            };

            const res = await ApiService.post(payload);
            if (res && res.status === "success" && res.data) {
                this.state.reportsKepsek = updateInList(this.state.reportsKepsek.map(x => x.id === repId ? { ...x, ...res.data } : x));
                this.state.reportsGuru = updateInList(this.state.reportsGuru.map(x => x.id === repId ? { ...x, ...res.data } : x));
                this.saveToLocalStorage();
                this.renderAllViews();
            } else if (res && res.status === "error") {
                App.showToast(res.message || "Gagal memperbarui laporan di server.", "error");
            }
            this.sync({ silent: true });
        } catch (err) {
            console.error("Error update_laporan:", err);
            App.showToast("Gagal memperbarui laporan di server.", "error");
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
    async optimisticDeleteUser(userIdOrIds, options = {}) {
        const ids = Array.isArray(userIdOrIds) ? userIdOrIds.map(x => x.toString().trim()) : [userIdOrIds.toString().trim()];
        const idSet = new Set(ids);

        // Kumpulkan username untuk proteksi blacklist & kecocokan server
        const targetUsernames = [];
        this.state.users.forEach(u => {
            const uid = u.id ? u.id.toString().trim() : "";
            if (idSet.has(uid) && u.username) {
                targetUsernames.push(u.username.trim().toLowerCase());
            }
        });

        // Simpan username ke deleted usernames blacklist
        if (targetUsernames.length > 0) {
            let deletedUsers = [];
            try {
                const raw = localStorage.getItem("pantausekolah_deleted_usernames");
                if (raw) deletedUsers = JSON.parse(raw);
            } catch (e) {}
            targetUsernames.forEach(un => {
                if (!deletedUsers.includes(un)) deletedUsers.push(un);
            });
            try {
                localStorage.setItem("pantausekolah_deleted_usernames", JSON.stringify(deletedUsers));
            } catch (e) {}
        }

        // 1. Hapus dari array lokal
        this.state.users = this.state.users.filter(u => {
            const uid = u.id ? u.id.toString().trim() : "";
            const uname = u.username ? u.username.trim().toLowerCase() : "";
            return !idSet.has(uid) && !targetUsernames.includes(uname);
        });

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
                usernames: targetUsernames,
                username: targetUsernames[0] || "",
                deleteSchool: options.deleteSchool ? true : false,
                currentUserName: currentUser ? currentUser.nama : "Pengawas",
                currentUserRole: currentUser ? currentUser.role : "Pengawas"
            });
            this.sync({ silent: true });
        } catch (e) {
            App.showToast("Gagal menghapus pengguna di server.", "error");
        }
    },

    /**
     * Hapus total sekolah dan seluruh datanya (0ms optimistik di UI + server di background)
     */
    async optimisticDeleteSchool(schoolName) {
        if (!schoolName) return;
        const cleanSchool = schoolName.trim();
        const sLower = cleanSchool.toLowerCase();

        // 1. Simpan ke daftar sekolah terhapus di localStorage agar tidak di-restore oleh live sync berikutnya
        let deletedSchools = [];
        try {
            const raw = localStorage.getItem("pantausekolah_deleted_schools");
            if (raw) deletedSchools = JSON.parse(raw);
        } catch (e) {}
        if (!deletedSchools.includes(sLower)) {
            deletedSchools.push(sLower);
            try {
                localStorage.setItem("pantausekolah_deleted_schools", JSON.stringify(deletedSchools));
            } catch (e) {}
        }

        // 2. Bersihkan sekolah dari seluruh state lokal
        this.state.schools = (this.state.schools || []).filter(s => (s.nama || "").trim().toLowerCase() !== sLower);
        this.state.users = (this.state.users || []).filter(u => (u.asalSekolah || "").trim().toLowerCase() !== sLower);
        this.state.folders = (this.state.folders || []).filter(f => (f.namaSekolah || "").trim().toLowerCase() !== sLower);
        this.state.reportsKepsek = (this.state.reportsKepsek || []).filter(r => (r.asalSekolah || "").trim().toLowerCase() !== sLower);
        this.state.reportsGuru = (this.state.reportsGuru || []).filter(r => (r.asalSekolah || "").trim().toLowerCase() !== sLower);
        this.state.allActivity = (this.state.allActivity || []).filter(a => (a.asalSekolah || "").trim().toLowerCase() !== sLower);

        // Bersihkan cache pemilihan aktif jika sedang membuka sekolah tersebut
        try {
            if ((localStorage.getItem("pantausekolah_folder_sekolah_school") || "").toLowerCase() === sLower) {
                localStorage.removeItem("pantausekolah_folder_sekolah_school");
            }
        } catch (e) {}

        // 3. Simpan cache & re-render seluruh tampilan seketika (0ms!)
        this.saveToLocalStorage();
        this.bindModules();
        this.renderAllViews();

        App.showToast(`🗑️ Sekolah "${cleanSchool}" dan foldernya berhasil dihapus total.`, "success");

        // 4. Kirim request hapus total ke server di background
        const currentUser = AuthService.getUser();
        try {
            await ApiService.post({
                action: "delete_school",
                schoolName: cleanSchool,
                currentUserRole: currentUser ? currentUser.role : "Pengawas",
                currentUserName: currentUser ? currentUser.nama : "Pengawas"
            });
            this.sync({ silent: true });
        } catch (err) {
            console.warn("Gagal hapus sekolah di server:", err);
            App.showToast("Gagal menghapus sekolah di server.", "error");
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
