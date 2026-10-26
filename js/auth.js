/**
 * ==========================================================================
 * PantauSekolah - Authentication & Session Management
 * ==========================================================================
 */

const AuthService = {
    currentUser: null,

    /**
     * Memuat sesi yang tersimpan dari localStorage atau Cookie saat aplikasi dibuka (Session Persistence)
     * Menjamin pengguna tetap otomatis login jika tab browser ditutup sebelum logout
     */
    initSession() {
        try {
            let raw = localStorage.getItem(CONFIG.SESSION_STORAGE_KEY);
            if (!raw) {
                // Fallback cek Cookie persisten jika tab browser dihapus atau localStorage dibersihkan
                const match = document.cookie.match(new RegExp('(^|;\\s*)' + CONFIG.SESSION_STORAGE_KEY + '=([^;]*)'));
                if (match && match[2]) {
                    raw = decodeURIComponent(match[2]);
                    try {
                        localStorage.setItem(CONFIG.SESSION_STORAGE_KEY, raw);
                    } catch (e) {}
                }
            }
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.username && parsed.role) {
                    // Cek apakah akun atau sekolahnya telah dihapus permanen oleh pengawas
                    let isDeleted = false;
                    try {
                        const delU = JSON.parse(localStorage.getItem("pantausekolah_deleted_usernames") || "[]");
                        const delS = JSON.parse(localStorage.getItem("pantausekolah_deleted_schools") || "[]");
                        const uLower = (parsed.username || "").toLowerCase();
                        const sLower = (parsed.asal_sekolah || "").toLowerCase();
                        if (delU.includes(uLower) || (sLower && delS.includes(sLower))) {
                            isDeleted = true;
                        }
                    } catch (e) {}

                    if (isDeleted) {
                        this.clearSession();
                        return false;
                    }

                    this.currentUser = parsed;
                    return true;
                }
            }
        } catch (e) {
            console.error("Gagal membaca sesi lokal:", e);
        }
        return false;
    },

    saveSession(userData) {
        this.currentUser = userData;
        try {
            const serialized = JSON.stringify(userData);
            localStorage.setItem(CONFIG.SESSION_STORAGE_KEY, serialized);
            // Simpan juga ke Cookie dengan durasi 30 hari (persisten saat tab browser dihapus/ditutup)
            document.cookie = `${CONFIG.SESSION_STORAGE_KEY}=${encodeURIComponent(serialized)}; path=/; max-age=2592000; SameSite=Lax`;
        } catch (e) {
            console.error("Gagal menyimpan sesi:", e);
        }
    },

    clearSession() {
        this.currentUser = null;
        try {
            localStorage.removeItem(CONFIG.SESSION_STORAGE_KEY);
            localStorage.removeItem("pantausekolah_active_tab");
            localStorage.removeItem("pantausekolah_selected_school");
            localStorage.removeItem("pantausekolah_folder_sekolah_school");
        } catch (e) {}
        try {
            document.cookie = `${CONFIG.SESSION_STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`;
        } catch (e) {}
        if (typeof LiveSync !== "undefined") {
            try {
                localStorage.removeItem(LiveSync.STORAGE_KEY);
                LiveSync.state = {
                    reportsKepsek: [],
                    reportsGuru: [],
                    allActivity: [],
                    schools: [],
                    users: [],
                    folders: [],
                    hiddenDefaultFolders: [],
                    lastSyncTime: "-"
                };
            } catch (e) {}
        }
        if (typeof UserManager !== "undefined") {
            UserManager.cachedUsers = [];
        }
        if (typeof DashboardManager !== "undefined") {
            DashboardManager.cachedData = { reportsKepsek: [], reportsGuru: [], allActivity: [], schools: [] };
        }
        if (typeof ReportManager !== "undefined") {
            ReportManager.selectedSchoolState = "";
            ReportManager.selectedSchoolFolderSekolah = "";
            ReportManager.selectedTypeState = "";
            ReportManager.activeSelectedId = "";
            ReportManager.activeTargetSheet = "";
        }
        if (typeof DriveManager !== "undefined") {
            DriveManager.cachedSchools = [];
            DriveManager.cachedFolders = [];
        }
    },

    isLoggedIn() {
        return !!this.currentUser;
    },

    getUser() {
        return this.currentUser;
    },

    /**
     * Generator Rekomendasi Password Acak Aman
     */
    generateSuggestedPassword() {
        const adjectives = ["Kreatif", "Cerdas", "Hebat", "Disiplin", "Mandiri", "Pintar", "Inovatif", "Amanah"];
        const nouns = ["Guru", "Sekolah", "Bina", "Pendidik", "Siswa", "Pena", "Buku"];
        const symbols = ["#", "!", "@", "$", "*"];

        const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
        const randomSym = symbols[Math.floor(Math.random() * symbols.length)];
        const randomNum = Math.floor(100 + Math.random() * 900); // 3 digit

        return `${randomAdj}${randomNoun}${randomSym}${randomNum}`;
    },

    /**
     * Setup Hak Akses Menu Berdasarkan Role Pengguna
     */
    applyRolePermissions() {
        if (!this.currentUser) return;

        const role = this.currentUser.role;
        const navDashboard = document.getElementById("nav-dashboard");
        const navKepsek = document.getElementById("nav-verifikasi-kepsek");
        const navGuru = document.getElementById("nav-verifikasi-guru");
        const navFolderSekolah = document.getElementById("nav-folder-sekolah");
        const navUpload = document.getElementById("nav-upload");
        const navUsers = document.getElementById("nav-user-manager");
        const navGuruManager = document.getElementById("nav-guru-manager");
        const navDrive = document.getElementById("nav-drive-manager");
        const navAudit = document.getElementById("nav-audit-log");
        const navLaporanDinas = document.getElementById("nav-laporan-dinas");
        const selectKategori = document.getElementById("kategori-laporan");

        // Sembunyikan semua menu role-spesifik terlebih dahulu
        [navKepsek, navGuru, navFolderSekolah, navUpload, navUsers, navGuruManager, navDrive, navAudit, navLaporanDinas].forEach(el => {
            if (el) el.classList.add("hidden");
        });

        if (role === "Pengawas") {
            // Pengawas: Admin Utama
            if (typeof ReportManager !== "undefined") {
                ReportManager.selectedSchoolState = "";
                ReportManager.selectedSchoolFolderSekolah = "";
            }
            if (navKepsek) navKepsek.classList.remove("hidden");
            if (navGuru) {
                navGuru.classList.remove("hidden");
                const span = navGuru.querySelector("span");
                if (span) span.innerText = "Laporan Guru";
            }
            if (navFolderSekolah) navFolderSekolah.classList.remove("hidden");
            if (navLaporanDinas) navLaporanDinas.classList.remove("hidden");
            if (navUsers) navUsers.classList.remove("hidden");
            if (navDrive) navDrive.classList.remove("hidden");
            if (navAudit) navAudit.classList.remove("hidden");
            if (navUpload) navUpload.classList.add("hidden");
        } else if (role === "Kepala Sekolah" || role === "Kepsek") {
            // Kepala Sekolah: Mengawasi Guru + Mendaftarkan Guru + Upload Laporan Kepsek + Modul Folder Sekolah
            if (navGuru) {
                navGuru.classList.remove("hidden");
                const span = navGuru.querySelector("span");
                if (span) span.innerText = "Laporan Guru";
            }
            if (navFolderSekolah) navFolderSekolah.classList.remove("hidden");
            if (navGuruManager) navGuruManager.classList.remove("hidden");
            if (navUpload) navUpload.classList.remove("hidden");

            if (typeof ReportManager !== "undefined" && this.currentUser.asal_sekolah) {
                ReportManager.selectedSchoolState = this.currentUser.asal_sekolah;
                ReportManager.selectedSchoolFolderSekolah = this.currentUser.asal_sekolah;
            }

            if (selectKategori) {
                selectKategori.innerHTML = `
                    <option value="Umum">Umum / Sesuai Folder</option>
                    <option value="Manajerial">1. Manajerial (RKJM, RKT, RKAS)</option>
                    <option value="Kewirausahaan">2. Kewirausahaan (Inovasi & Kemitraan)</option>
                    <option value="Supervisi">3. Laporan Supervisi Guru & Tenaga Kependidikan</option>
                `;
            }
        } else {
            // Guru: Melihat folder laporan guru (berkas miliknya) dan upload laporan
            if (navGuru) {
                navGuru.classList.remove("hidden");
                const span = navGuru.querySelector("span");
                if (span) span.innerText = "Folder Laporan Guru";
            }
            if (navUpload) navUpload.classList.remove("hidden");

            if (typeof ReportManager !== "undefined" && this.currentUser.asal_sekolah) {
                ReportManager.selectedSchoolState = this.currentUser.asal_sekolah;
                ReportManager.selectedSchoolFolderSekolah = this.currentUser.asal_sekolah;
            }

            if (selectKategori) {
                selectKategori.innerHTML = `
                    <option value="Umum">Umum / Sesuai Folder</option>
                    <option value="Perencanaan">1. Perencanaan (RPP, Modul Ajar, Silabus)</option>
                    <option value="Pelaksanaan KBM">2. Pelaksanaan KBM (Jurnal Mengajar, Dokumentasi)</option>
                    <option value="Penilaian">3. Penilaian (Rekap Nilai, Analisis Hasil Belajar)</option>
                `;
            }
        }

        if (typeof ReportManager !== "undefined") {
            ReportManager.populateUploadFolders();
        }

        // Sembunyikan group admin jika role adalah Guru
        const navGroupAdmin = document.getElementById("nav-group-admin");
        if (navGroupAdmin) {
            if (role === "Guru") navGroupAdmin.classList.add("hidden");
            else navGroupAdmin.classList.remove("hidden");
        }

        // Sembunyikan status card Google Drive di sidebar untuk Kepala Sekolah dan Guru (Hanya Pengawas yang punya akses)
        const sidebarDriveStatus = document.getElementById("sidebar-drive-status");
        if (sidebarDriveStatus) {
            if (role === "Pengawas") {
                sidebarDriveStatus.classList.remove("hidden");
            } else {
                sidebarDriveStatus.classList.add("hidden");
            }
        }

        // Tampilkan info profil di sidebar
        const nameEl = document.getElementById("user-info-name");
        const roleEl = document.getElementById("user-info-role");
        const avatarIcon = document.getElementById("user-info-avatar-icon");

        if (nameEl) nameEl.innerText = this.currentUser.nama || this.currentUser.username;
        if (roleEl) roleEl.innerText = `${this.currentUser.role} • ${this.currentUser.asal_sekolah || 'Dinas'}`;
        if (avatarIcon) {
            if (role === "Pengawas") avatarIcon.className = "fa-solid fa-user-shield";
            else if (role === "Kepala Sekolah" || role === "Kepsek") avatarIcon.className = "fa-solid fa-user-tie";
            else avatarIcon.className = "fa-solid fa-chalkboard-user";
        }
    },

    /**
     * Buka Modal Lupa Password / Reset Password
     */
    openForgotPasswordModal(prefillUsername = "", prefillSchool = "") {
        const modal = document.getElementById("modal-forgot-password");
        if (!modal) return;

        const form = document.getElementById("form-forgot-password");
        if (form) form.reset();

        const inputUser = document.getElementById("input-reset-username");
        const inputSchool = document.getElementById("input-reset-school");
        const modalTitle = document.getElementById("modal-forgot-title");

        const currentUser = this.getUser();
        const isPengawas = currentUser && currentUser.role === "Pengawas";

        if (prefillUsername) {
            if (inputUser) inputUser.value = prefillUsername;
            if (inputSchool && prefillSchool) inputSchool.value = prefillSchool;
            if (modalTitle) modalTitle.innerText = `Reset Password (@${prefillUsername})`;
        } else {
            if (modalTitle) modalTitle.innerText = "Ganti Password / Lupa Password";
        }

        modal.classList.remove("hidden");

        setTimeout(() => {
            if (prefillUsername) {
                const newPwdInput = document.getElementById("input-reset-new-password");
                if (newPwdInput) newPwdInput.focus();
            } else if (inputUser) {
                inputUser.focus();
            }
        }, 50);

        if (this._escForgotHandler) window.removeEventListener("keydown", this._escForgotHandler);
        this._escForgotHandler = (e) => {
            if (e.key === "Escape") {
                this.closeForgotPasswordModal();
            }
        };
        window.addEventListener("keydown", this._escForgotHandler);
    },

    /**
     * Tutup Modal Lupa Password
     */
    closeForgotPasswordModal() {
        if (this._escForgotHandler) {
            window.removeEventListener("keydown", this._escForgotHandler);
            this._escForgotHandler = null;
        }
        const modal = document.getElementById("modal-forgot-password");
        if (modal) modal.classList.add("hidden");
    },

    /**
     * Generate saran password acak untuk reset
     */
    generateAndFillResetPassword() {
        const pwd = this.generateSuggestedPassword();
        const inputNew = document.getElementById("input-reset-new-password");
        const inputConfirm = document.getElementById("input-reset-confirm-password");
        if (inputNew) inputNew.value = pwd;
        if (inputConfirm) inputConfirm.value = pwd;
        App.showToast("Saran password acak telah dimasukkan!", "info");
    },

    /**
     * Salin password reset ke clipboard
     */
    copyResetPassword() {
        const inputNew = document.getElementById("input-reset-new-password");
        if (!inputNew || !inputNew.value) return;

        navigator.clipboard.writeText(inputNew.value).then(() => {
            App.showToast("Password berhasil disalin ke clipboard!", "success");
        }).catch(() => {
            App.showToast("Gagal menyalin password.", "error");
        });
    },

    /**
     * Kirim formulir ganti / reset password ke backend
     */
    async submitResetPassword() {
        const username = (document.getElementById("input-reset-username")?.value || "").trim();
        const asalSekolah = (document.getElementById("input-reset-school")?.value || "").trim();
        const newPassword = (document.getElementById("input-reset-new-password")?.value || "").trim();
        const confirmPassword = (document.getElementById("input-reset-confirm-password")?.value || "").trim();

        if (!username) {
            App.showToast("Username wajib diisi!", "error");
            return;
        }
        if (!newPassword) {
            App.showToast("Password baru wajib diisi!", "error");
            return;
        }
        if (newPassword.length < 5) {
            App.showToast("Password minimal terdiri dari 5 karakter!", "error");
            return;
        }
        if (newPassword !== confirmPassword) {
            App.showToast("Konfirmasi password baru tidak cocok!", "error");
            return;
        }

        const btn = document.getElementById("btn-submit-reset-password");
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-1.5"></i> Memproses...`;
        }

        const currentUser = this.getUser();

        try {
            const res = await ApiService.post({
                action: "reset_password",
                username: username,
                asal_sekolah: asalSekolah,
                new_password: newPassword,
                currentUserRole: currentUser ? currentUser.role : ""
            });

            if (res.status === "success") {
                App.showToast(res.message || "Password berhasil diperbarui!", "success");
                this.closeForgotPasswordModal();

                // Isi otomatis username di form login dan fokus ke input password
                const inputLoginUser = document.getElementById("input-username");
                const inputLoginPwd = document.getElementById("input-password");
                if (inputLoginUser) inputLoginUser.value = username;
                if (inputLoginPwd) {
                    inputLoginPwd.value = "";
                    inputLoginPwd.focus();
                }
            } else {
                App.showToast(res.message || "Gagal memperbarui password.", "error");
            }
        } catch (err) {
            App.showToast("Terjadi kesalahan koneksi saat memperbarui password.", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-check"></i> Simpan Password Baru`;
            }
        }
    }
};
