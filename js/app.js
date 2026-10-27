/**
 * ==========================================================================
 * PantauSekolah - Main Application Controller
 * ==========================================================================
 */

const App = {
    /**
     * Inisialisasi awal saat halaman dimuat
     */
    init() {
        // 0. Inisialisasi Tema (Dark / Light Mode)
        this.initTheme();

        // 1. Cek Sesi Tersimpan (Session Persistence)
        const hasSession = AuthService.initSession();

        if (hasSession) {
            // Sesi aktif: Langsung tampilkan dashboard tanpa perlu login ulang
            document.documentElement.classList.add("has-session");
            document.getElementById("login-section").classList.add("hidden");
            document.getElementById("dashboard-section").classList.remove("hidden");

            AuthService.applyRolePermissions();
            if (typeof LiveSync !== "undefined") {
                LiveSync.init();
            }

            // Pulihkan modul yang sedang dibuka sebelum refresh (bukan reset ke dashboard)
            let savedTab = null;
            try {
                savedTab = localStorage.getItem("pantausekolah_active_tab");
            } catch (e) {}

            this.restoreActiveModule(savedTab);
        } else {
            // Belum login
            document.documentElement.classList.remove("has-session");
            document.getElementById("dashboard-section").classList.add("hidden");
            document.getElementById("login-section").classList.remove("hidden");
            setTimeout(() => {
                const uInput = document.getElementById("input-username");
                if (uInput) uInput.focus();
            }, 100);
        }

        // Event listener tambahan tombol Enter pada form login
        const formLogin = document.getElementById("form-login");
        if (formLogin) {
            formLogin.addEventListener("submit", (e) => {
                e.preventDefault();
                App.login();
            });
        }

        const usernameInput = document.getElementById("input-username");
        const passwordInput = document.getElementById("input-password");
        const handleLoginKey = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                App.login();
            }
        };
        if (usernameInput) usernameInput.addEventListener("keydown", handleLoginKey);
        if (passwordInput) passwordInput.addEventListener("keydown", handleLoginKey);
    },

    /**
     * Memulihkan modul yang aktif saat halaman di-refresh (Module Persistence)
     */
    restoreActiveModule(savedTab) {
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        if (!currentUser) {
            this.switchTab('dashboard');
            return;
        }

        const role = currentUser.role;
        const validTabs = [
            'dashboard',
            'verifikasi-kepsek',
            'verifikasi-guru',
            'folder-sekolah',
            'laporan-dinas',
            'upload',
            'user-manager',
            'guru-manager',
            'drive-manager',
            'audit-log'
        ];

        // Validasi modul apakah terdaftar
        let targetTab = savedTab;
        if (!targetTab || !validTabs.includes(targetTab)) {
            targetTab = 'dashboard';
        }

        // Cek izin peran (role-based guard) agar tab tidak bisa diakses sembarangan
        if (role === "Guru") {
            const allowedGuruTabs = ['dashboard', 'verifikasi-guru', 'upload'];
            if (!allowedGuruTabs.includes(targetTab)) {
                targetTab = 'dashboard';
            }
        } else if (role === "Kepala Sekolah" || role === "Kepsek") {
            const allowedKepsekTabs = ['dashboard', 'verifikasi-kepsek', 'verifikasi-guru', 'folder-sekolah', 'upload', 'guru-manager'];
            if (!allowedKepsekTabs.includes(targetTab)) {
                targetTab = 'dashboard';
            }
        } else if (role === "Pengawas") {
            // Pengawas memiliki hak akses penuh ke seluruh modul
        } else {
            targetTab = 'dashboard';
        }

        this.switchTab(targetTab);
    },

    /**
     * Proses Login
     */
    async login() {
        const usernameInput = document.getElementById("input-username");
        const passwordInput = document.getElementById("input-password");
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            this.showToast("Harap masukkan Username dan Password!", "error");
            return;
        }

        // Cek blacklist client-side
        const uLower = username.toLowerCase();
        let isLocallyDeleted = false;
        try {
            const delU = JSON.parse(localStorage.getItem("pantausekolah_deleted_usernames") || "[]");
            if (delU.includes(uLower)) isLocallyDeleted = true;
        } catch (e) {}

        if (isLocallyDeleted) {
            this.showToast("Akun ini telah dihapus oleh Pengawas dan tidak dapat digunakan lagi.", "error");
            return;
        }

        const btnLogin = document.getElementById("btn-login");
        const loadingLogin = document.getElementById("loading-login");

        btnLogin.classList.add("hidden");
        loadingLogin.classList.remove("hidden");

        try {
            const res = await ApiService.post({
                action: "login",
                username: username,
                password: password
            });

            if (res.status === "success") {
                const sLower = (res.asal_sekolah || "").toLowerCase();
                let isSchoolDeleted = false;
                try {
                    const delS = JSON.parse(localStorage.getItem("pantausekolah_deleted_schools") || "[]");
                    if (sLower && delS.includes(sLower)) isSchoolDeleted = true;
                } catch (e) {}

                if (isSchoolDeleted) {
                    this.showToast(`Sekolah "${res.asal_sekolah}" telah dihapus total oleh Pengawas. Akun tidak dapat digunakan lagi.`, "error");
                    return;
                }

                // Simpan Sesi
                AuthService.saveSession({
                    nama: res.nama,
                    role: res.role,
                    asal_sekolah: res.asal_sekolah,
                    username: res.username,
                    drive_url: res.drive_url
                });

                document.documentElement.classList.add("has-session");
                document.getElementById("login-section").classList.add("hidden");
                document.getElementById("dashboard-section").classList.remove("hidden");

                AuthService.applyRolePermissions();
                if (typeof LiveSync !== "undefined") {
                    LiveSync.init();
                }

                try {
                    localStorage.setItem("pantausekolah_active_tab", "dashboard");
                } catch (e) {}

                this.switchTab('dashboard');
                if (typeof AIAssistant !== "undefined") {
                    AIAssistant.renderQuickPrompts();
                    AIAssistant.renderMessages();
                }
                this.showToast(`Selamat datang, ${res.nama}!`, "success");

                usernameInput.value = "";
                passwordInput.value = "";
            } else {
                this.showToast(res.message || "Login gagal.", "error");
            }
        } catch (error) {
            console.error("Login Error:", error);
            this.showToast(error.message || "Gagal terhubung dengan server saat login.", "error");
        } finally {
            btnLogin.classList.remove("hidden");
            loadingLogin.classList.add("hidden");
        }
    },

    /**
     * Modal Konfirmasi Pengganti Browser confirm()
     * @returns {Promise<boolean>}
     */
    confirmModal({
        title = "Konfirmasi Tindakan",
        message = "Apakah Anda yakin ingin melanjutkan tindakan ini?",
        subMessage = "",
        confirmText = "Ya, Lanjutkan",
        cancelText = "Batal",
        confirmType = "danger", // 'danger' | 'warning' | 'primary'
        icon = ""
    } = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById("modal-confirm");
            const box = document.getElementById("modal-confirm-box");
            const titleEl = document.getElementById("modal-confirm-title");
            const messageEl = document.getElementById("modal-confirm-message");
            const subMessageEl = document.getElementById("modal-confirm-submessage");
            const iconWrapper = document.getElementById("modal-confirm-icon-wrapper");
            const iconEl = document.getElementById("modal-confirm-icon");
            const btnCancel = document.getElementById("modal-confirm-btn-cancel");
            const btnOk = document.getElementById("modal-confirm-btn-ok");

            titleEl.innerText = title;
            messageEl.innerHTML = message;
            subMessageEl.innerHTML = subMessage;
            subMessageEl.style.display = subMessage ? "block" : "none";

            btnOk.innerText = confirmText;
            btnCancel.innerText = cancelText;

            // Reset styling
            iconWrapper.className = "w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-2xl shadow-sm border";
            btnOk.className = "w-1/2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all text-white";

            if (confirmType === "danger") {
                iconWrapper.classList.add("bg-rose-50", "text-rose-600", "border-rose-100");
                iconEl.className = icon || "fa-solid fa-trash-can";
                btnOk.classList.add("bg-rose-600", "hover:bg-rose-700", "shadow-rose-500/25", "focus:ring-2", "focus:ring-rose-400");
            } else if (confirmType === "warning") {
                iconWrapper.classList.add("bg-amber-50", "text-amber-600", "border-amber-100");
                iconEl.className = icon || "fa-solid fa-triangle-exclamation";
                btnOk.classList.add("bg-amber-600", "hover:bg-amber-700", "shadow-amber-500/25", "focus:ring-2", "focus:ring-amber-400");
            } else {
                iconWrapper.classList.add("bg-blue-50", "text-blue-600", "border-blue-100");
                iconEl.className = icon || "fa-solid fa-circle-question";
                btnOk.classList.add("bg-blue-600", "hover:bg-blue-700", "shadow-blue-500/25", "focus:ring-2", "focus:ring-blue-400");
            }

            modal.classList.remove("hidden");
            setTimeout(() => {
                box.classList.remove("scale-95", "opacity-0");
                box.classList.add("scale-100", "opacity-100");
                btnOk.focus();
            }, 20);

            // Listener tombol keyboard Enter (Konfirmasi) dan Escape (Batal)
            const keyHandler = (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    cleanup();
                    resolve(true);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    cleanup();
                    resolve(false);
                }
            };
            window.addEventListener("keydown", keyHandler, true);

            const cleanup = () => {
                window.removeEventListener("keydown", keyHandler, true);
                box.classList.remove("scale-100", "opacity-100");
                box.classList.add("scale-95", "opacity-0");
                setTimeout(() => {
                    modal.classList.add("hidden");
                    btnOk.onclick = null;
                    btnCancel.onclick = null;
                }, 150);
            };

            btnOk.onclick = (e) => {
                e.preventDefault();
                cleanup();
                resolve(true);
            };

            btnCancel.onclick = (e) => {
                e.preventDefault();
                cleanup();
                resolve(false);
            };
        });
    },

    /**
     * Proses Logout dengan Modal Konfirmasi
     */
    async logout() {
        const confirmed = await this.confirmModal({
            title: "Konfirmasi Keluar Akun",
            message: "Apakah Anda yakin ingin keluar dari aplikasi <strong>PantauSekolah</strong>?",
            subMessage: "Anda perlu memasukkan kembali username dan password untuk masuk.",
            confirmText: "Ya, Keluar Akun",
            confirmType: "warning",
            icon: "fa-solid fa-arrow-right-from-bracket"
        });

        if (confirmed) {
            if (typeof AIAssistant !== "undefined") {
                AIAssistant.toggleChat(false);
            }
            AuthService.clearSession();
            try {
                localStorage.removeItem("pantausekolah_active_tab");
                localStorage.removeItem("pantausekolah_selected_school");
                localStorage.removeItem("pantausekolah_folder_sekolah_school");
            } catch (e) {}
            document.documentElement.classList.remove("has-session");
            document.getElementById("dashboard-section").classList.add("hidden");
            document.getElementById("login-section").classList.remove("hidden");
            document.getElementById("input-username").value = "";
            document.getElementById("input-password").value = "";
            this.showToast("Anda telah berhasil keluar.", "success");
        }
    },

    /**
     * Berpindah Antar Halaman / Tab
     */
    switchTab(tabName) {
        // Tutup drawer sidebar mobile jika terbuka
        if (window.innerWidth < 768) {
            const sidebar = document.getElementById("main-sidebar");
            const overlay = document.getElementById("sidebar-overlay");
            if (sidebar && !sidebar.classList.contains("-translate-x-full")) {
                sidebar.classList.add("-translate-x-full");
                overlay.classList.add("hidden");
            }
        }

        const tabs = [
            'dashboard',
            'verifikasi-kepsek',
            'verifikasi-guru',
            'folder-sekolah',
            'laporan-dinas',
            'upload',
            'user-manager',
            'guru-manager',
            'drive-manager',
            'audit-log'
        ];

        tabs.forEach(tab => {
            const elTab = document.getElementById(`tab-${tab}`);
            const elNav = document.getElementById(`nav-${tab}`);
            if (elTab) elTab.classList.add("hidden");
            if (elNav) {
                elNav.classList.remove("nav-active", "text-white");
                elNav.classList.add("text-slate-400");
            }
        });

        // Tampilkan tab target
        const targetTab = document.getElementById(`tab-${tabName}`);
        const targetNav = document.getElementById(`nav-${tabName}`);
        if (targetTab) targetTab.classList.remove("hidden");
        if (targetNav) {
            targetNav.classList.remove("text-slate-400");
            targetNav.classList.add("nav-active");
        }

        // Simpan modul aktif agar saat di-refresh halaman tetap di modul ini
        try {
            localStorage.setItem("pantausekolah_active_tab", tabName);
        } catch (e) {}

        const titleEl = document.getElementById("page-title");
        const subTitleEl = document.getElementById("page-subtitle");

        if (typeof ReportManager !== "undefined") {
            ReportManager.selectedTypeState = "";
        }

        if (tabName === 'dashboard') {
            titleEl.innerText = "Dashboard Utama";
            subTitleEl.innerText = "Ringkasan aktivitas dan grafik statistik performa laporan";
            DashboardManager.loadData();
        } else if (tabName === 'verifikasi-kepsek') {
            titleEl.innerText = "Laporan Kepala Sekolah";
            subTitleEl.innerText = "Folder per sekolah untuk laporan administrasi dan manajemen Kepala Sekolah";
            const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
            const isPengawas = currentUser && currentUser.role === "Pengawas";
            const schools = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.schools) 
                ? DashboardManager.cachedData.schools 
                : [];
            let savedSchool = null;
            if (isPengawas) {
                try {
                    savedSchool = localStorage.getItem("pantausekolah_selected_school");
                } catch (e) {}
            }
            const schoolExists = savedSchool && schools.some(s => (s.nama || "").toLowerCase() === savedSchool.toLowerCase());
            if (savedSchool && schoolExists) {
                ReportManager.openSchoolFolder('kepsek', savedSchool);
            } else {
                try {
                    localStorage.removeItem("pantausekolah_selected_school");
                } catch (e) {}
                ReportManager.backToFolderKepsek();
            }
        } else if (tabName === 'verifikasi-guru') {
            const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
            const isKepsek = currentUser && (currentUser.role === "Kepala Sekolah" || currentUser.role === "Kepsek");
            const isGuru = currentUser && currentUser.role === "Guru";
            const isPengawas = currentUser && currentUser.role === "Pengawas";

            if (isGuru) {
                titleEl.innerText = "Folder Laporan Guru";
                subTitleEl.innerText = "Folder dan berkas laporan pembelajaran yang Anda unggah";
            } else {
                titleEl.innerText = "Laporan Guru";
                subTitleEl.innerText = "Folder laporan RPP dan pembelajaran Guru";
            }

            if ((isKepsek || isGuru) && currentUser.asal_sekolah) {
                ReportManager.openSchoolFolder('guru', currentUser.asal_sekolah);
            } else if (isPengawas) {
                const schools = (typeof DashboardManager !== "undefined" && DashboardManager.cachedData.schools) 
                    ? DashboardManager.cachedData.schools 
                    : [];
                let savedSchool = null;
                try {
                    savedSchool = localStorage.getItem("pantausekolah_selected_school");
                } catch (e) {}
                const schoolExists = savedSchool && schools.some(s => (s.nama || "").toLowerCase() === savedSchool.toLowerCase());
                if (savedSchool && schoolExists) {
                    ReportManager.openSchoolFolder('guru', savedSchool);
                } else {
                    try {
                        localStorage.removeItem("pantausekolah_selected_school");
                    } catch (e) {}
                    ReportManager.backToFolderGuru();
                }
            } else {
                ReportManager.backToFolderGuru();
            }
        } else if (tabName === 'folder-sekolah') {
            titleEl.innerText = "Folder Dokumen Sekolah";
            subTitleEl.innerText = "Kelola folder guru serta pantau arsip terkunci kepala sekolah";
            ReportManager.loadFolderSekolahView();
        } else if (tabName === 'upload') {
            titleEl.innerText = "Unggah Laporan Baru";
            subTitleEl.innerText = "Kirimkan dokumen laporan Anda ke Google Drive & Sheets";
            if (typeof ReportManager !== "undefined") {
                ReportManager.populateUploadFolders();
            }
        } else if (tabName === 'user-manager') {
            titleEl.innerText = "Manajemen Pengguna (User Manager)";
            subTitleEl.innerText = "Atur akun Pengawas, Kepala Sekolah, dan Guru serta pembuatan folder Drive otomatis";
            UserManager.loadUsers();
        } else if (tabName === 'guru-manager') {
            titleEl.innerText = "Manajemen & Registrasi Guru";
            subTitleEl.innerText = "Daftarkan dan kelola akun guru untuk sekolah Anda";
            UserManager.loadUsers();
        } else if (tabName === 'drive-manager') {
            titleEl.innerText = "Manajemen Folder Google Drive";
            subTitleEl.innerText = "Buat dan kelola folder Google Drive untuk 1 sekolah atau seluruh sekolah binaan sekaligus";
            DriveManager.loadDriveData();
        } else if (tabName === 'audit-log') {
            titleEl.innerText = "Audit Log Aktivitas Pengguna";
            subTitleEl.innerText = "Pemantauan komprehensif seluruh aktivitas login, unggah, verifikasi, dan manajemen sistem";
            if (typeof AuditManager !== "undefined") {
                AuditManager.loadAuditLogs();
            }
        } else if (tabName === 'laporan-dinas') {
            titleEl.innerText = "Laporan Pengawas ke Dinas Pendidikan";
            subTitleEl.innerText = "Penyusunan dokumen resmi, matriks kepatuhan sekolah binaan, serta cetak laporan ke Kepala Dinas";
            if (typeof DinasReportManager !== "undefined") {
                DinasReportManager.init();
            }
        }
    },

    /**
     * Toggle Sidebar di Perangkat Mobile
     */
    toggleMobileSidebar() {
        const sidebar = document.getElementById("main-sidebar");
        const overlay = document.getElementById("sidebar-overlay");
        sidebar.classList.toggle("-translate-x-full");
        overlay.classList.toggle("hidden");
    },

    /**
     * Inisialisasi Tema Aplikasi (Light / Dark Mode)
     */
    initTheme() {
        let theme = "light";
        try {
            theme = localStorage.getItem("pantausekolah_theme");
        } catch (e) {}

        const isDark = theme === "dark" || (!theme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (isDark) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        this.updateThemeUI(isDark);
    },

    /**
     * Toggle Tema Gelap / Terang
     */
    toggleTheme() {
        const isCurrentlyDark = document.documentElement.classList.contains("dark");
        const newIsDark = !isCurrentlyDark;

        if (newIsDark) {
            document.documentElement.classList.add("dark");
            try {
                localStorage.setItem("pantausekolah_theme", "dark");
            } catch (e) {}
            this.showToast("Mode Gelap diaktifkan", "success");
        } else {
            document.documentElement.classList.remove("dark");
            try {
                localStorage.setItem("pantausekolah_theme", "light");
            } catch (e) {}
            this.showToast("Mode Terang diaktifkan", "success");
        }

        this.updateThemeUI(newIsDark);

        // Jika dashboard chart aktif, segarkan chart agar kontras warna teks/grid pas
        if (typeof Dashboard !== "undefined" && typeof Dashboard.renderCharts === "function") {
            try {
                Dashboard.renderCharts();
            } catch (e) {}
        }
    },

    /**
     * Update UI ikon & label toggle tema
     */
    updateThemeUI(isDark) {
        const icon = document.getElementById("theme-toggle-icon");
        const text = document.getElementById("theme-toggle-text");
        const btn = document.getElementById("btn-theme-toggle");

        if (icon) {
            if (isDark) {
                icon.className = "fa-solid fa-sun text-xs sm:text-sm text-amber-400";
            } else {
                icon.className = "fa-solid fa-moon text-xs sm:text-sm text-slate-700";
            }
        }
        if (text) {
            text.innerText = isDark ? "Terang" : "Gelap";
        }
        if (btn) {
            btn.title = isDark ? "Beralih ke Mode Terang" : "Beralih ke Mode Gelap";
        }
    },

    /**
     * Notifikasi Toast Responsif
     */
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        const isSuccess = type === 'success';
        const borderColor = isSuccess ? 'border-emerald-500' : 'border-rose-500';
        const iconClass = isSuccess ? 'fa-circle-check text-emerald-500' : 'fa-circle-exclamation text-rose-500';
        const title = isSuccess ? 'Berhasil' : 'Pemberitahuan';

        toast.className = `pointer-events-auto flex items-center gap-3 bg-white border-l-4 ${borderColor} shadow-xl rounded-xl p-3.5 w-full sm:min-w-[300px] sm:max-w-md transform translate-y-2 sm:translate-y-0 sm:translate-x-full transition-all duration-300 ease-out opacity-0`;
        toast.innerHTML = `
            <i class="fa-solid ${iconClass} text-xl flex-shrink-0"></i>
            <div class="flex-1 min-w-0">
                <p class="font-bold text-xs text-slate-800">${title}</p>
                <p class="text-[11px] text-slate-600 mt-0.5 leading-relaxed break-words">${message}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600 text-xs p-1">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        container.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-y-2', 'sm:translate-x-full', 'opacity-0'), 10);
        setTimeout(() => {
            toast.classList.add('translate-y-2', 'sm:translate-x-full', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
};

// Jalankan aplikasi saat seluruh DOM selesai dimuat
document.addEventListener("DOMContentLoaded", () => {
    App.init();
});
