/**
 * ==========================================================================
 * PantauSekolah - User Manager Module
 * ==========================================================================
 * Mengelola pendaftaran & data pengguna untuk Pengawas & Kepala Sekolah.
 */

const UserManager = {
    cachedUsers: [],

    /**
     * Memuat daftar pengguna dari server
     */
    async loadUsers() {
        const user = AuthService.getUser();
        if (!user) return;

        const isKepsek = user.role === "Kepala Sekolah" || user.role === "Kepsek";

        // Render instan 0ms dari memori jika data sudah ada
        if (this.cachedUsers && this.cachedUsers.length > 0) {
            this.renderUserTable();
        } else {
            const tableBody = document.getElementById("table-body-users");
            const tableBodyGuru = document.getElementById("table-body-guru-users");
            const loadingRow = `<tr><td colspan="7" class="p-6 text-center text-slate-400 font-medium"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i> ${isKepsek ? 'Memuat data guru...' : 'Memuat data pengguna...'}</td></tr>`;

            if (tableBody) tableBody.innerHTML = loadingRow;
            if (tableBodyGuru) tableBodyGuru.innerHTML = loadingRow;
        }

        // Live Sync di background tanpa blocking
        if (typeof LiveSync !== "undefined") {
            LiveSync.sync({ silent: true });
        }
    },

    /**
     * Render data pengguna ke tabel
     */
    renderUserTable() {
        const currentUser = AuthService.getUser();
        if (!currentUser) return;

        const role = currentUser.role;
        const isPengawas = role === "Pengawas";
        const isKepsek = role === "Kepala Sekolah" || role === "Kepsek";
        const userSchool = (currentUser.asal_sekolah || "").trim();

        const targetBodies = [
            document.getElementById("table-body-users"),
            document.getElementById("table-body-guru-users")
        ].filter(Boolean);

        if (targetBodies.length === 0) return;

        // 1. Filter pengguna yang berhak ditampilkan
        let displayUsers = [...(this.cachedUsers || [])];

        if (isKepsek) {
            // Kepala Sekolah: SEMUA akun lain di-hidden, HANYA menampilkan guru dari sekolah miliknya
            displayUsers = displayUsers.filter(u => {
                const isGuru = u.role === "Guru";
                const uSchool = (u.asalSekolah || "").trim().toLowerCase();
                const mySchool = userSchool.toLowerCase();
                return isGuru && (uSchool === mySchool);
            });
        }

        const subtitleEl = document.getElementById("guru-manager-school-subtitle");
        if (subtitleEl) {
            subtitleEl.innerText = isKepsek && userSchool 
                ? `Guru binaan aktif di ${userSchool}`
                : "Guru binaan di sekolah Anda";
        }

        // 2. Jika tidak ada data guru / pengguna
        if (displayUsers.length === 0) {
            const emptyMsg = isKepsek 
                ? `Belum ada guru yang terdaftar pada ${userSchool || 'sekolah Anda'}`
                : "Belum ada data pengguna terdaftar.";

            targetBodies.forEach(tb => {
                tb.innerHTML = `
                    <tr>
                        <td colspan="7" class="p-8 text-center text-slate-400 font-medium">
                            <i class="fa-solid fa-chalkboard-user text-2xl text-slate-300 block mb-2"></i>
                            ${emptyMsg}
                        </td>
                    </tr>
                `;
            });
            return;
        }

        let htmlRows = "";
        displayUsers.forEach(u => {
            const roleBadge = this.getRoleBadge(u.role);
            const driveBtn = u.driveUrl ? `
                <a href="${u.driveUrl}" target="_blank" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-semibold text-[11px] transition-colors border border-blue-200">
                    <i class="fa-brands fa-google-drive"></i> Buka Drive
                </a>
            ` : `<span class="text-slate-400 text-[11px] italic">Belum ada</span>`;

            const actionBtn = isPengawas && u.username !== currentUser.username ? `
                <div class="inline-flex items-center gap-1.5">
                    <button onclick="AuthService.openForgotPasswordModal('${u.username}', '${u.asalSekolah || ''}')" title="Reset Password Akun" class="px-2.5 py-1 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg font-semibold text-[11px] transition-colors border border-amber-200">
                        <i class="fa-solid fa-key mr-1"></i> Reset
                    </button>
                    <button onclick="UserManager.confirmDeleteUser('${u.id}', '${u.nama}')" title="Hapus Pengguna" class="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg font-semibold text-[11px] transition-colors border border-rose-200">
                        <i class="fa-solid fa-trash-can mr-1"></i> Hapus
                    </button>
                </div>
            ` : (isKepsek ? `
                <div class="inline-flex items-center gap-1.5">
                    <button onclick="AuthService.openForgotPasswordModal('${u.username}', '${u.asalSekolah || ''}')" title="Reset Password Akun Guru" class="px-2.5 py-1 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg font-semibold text-[11px] transition-colors border border-amber-200">
                        <i class="fa-solid fa-key mr-1"></i> Reset
                    </button>
                </div>
            ` : `<span class="text-slate-400 text-xs">-</span>`);

            htmlRows += `
                <tr class="hover:bg-[#FAF7F0] transition-colors border-b border-[#F0EBE1]">
                    <td class="p-3.5 font-bold text-slate-700 font-mono whitespace-nowrap">${u.id}</td>
                    <td class="p-3.5 whitespace-nowrap">
                        <p class="font-bold text-slate-800">${u.nama}</p>
                        <p class="text-[10px] text-slate-400 font-mono">@${u.username}</p>
                    </td>
                    <td class="p-3.5 whitespace-nowrap">${roleBadge}</td>
                    <td class="p-3.5 font-medium text-slate-700 whitespace-nowrap">${u.asalSekolah || '-'}</td>
                    <td class="p-3.5 text-center whitespace-nowrap">${driveBtn}</td>
                    <td class="p-3.5 whitespace-nowrap">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                            ${u.status}
                        </span>
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">${actionBtn}</td>
                </tr>
            `;
        });

        targetBodies.forEach(tb => {
            tb.innerHTML = htmlRows;
        });
    },

    getRoleBadge(role) {
        if (role === "Pengawas") {
            return `<span class="bg-purple-100 text-purple-700 font-bold px-2.5 py-0.5 rounded-md text-[10px] border border-purple-200">Pengawas</span>`;
        }
        if (role === "Kepala Sekolah" || role === "Kepsek") {
            return `<span class="bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-md text-[10px] border border-blue-200">Kepala Sekolah</span>`;
        }
        return `<span class="bg-emerald-100 text-emerald-700 font-bold px-2.5 py-0.5 rounded-md text-[10px] border border-emerald-200">Guru</span>`;
    },

    /**
     * Buka Modal Tambah User
     */
    openAddUserModal() {
        const currentUser = AuthService.getUser();
        const isPengawas = currentUser && currentUser.role === "Pengawas";

        const modal = document.getElementById("modal-add-user");
        const modalTitle = document.getElementById("modal-add-user-title");
        const roleSelect = document.getElementById("input-new-role");
        const schoolInput = document.getElementById("input-new-school");

        // Reset form
        document.getElementById("form-add-user").reset();

        if (isPengawas) {
            modalTitle.innerText = "Tambah Pengguna Baru (Pengawas)";
            roleSelect.disabled = false;
            schoolInput.disabled = false;
            schoolInput.placeholder = "Contoh: SD 04 Pinoh";
        } else {
            // Kepala Sekolah: khusus mendaftarkan Guru untuk sekolahnya
            modalTitle.innerText = `Daftarkan Guru Baru (${currentUser.asal_sekolah})`;
            roleSelect.value = "Guru";
            roleSelect.disabled = true;
            schoolInput.value = currentUser.asal_sekolah;
            schoolInput.disabled = true;
        }

        // Tampilkan rekomendasi password awal
        this.generateAndFillPassword();

        modal.classList.remove("hidden");

        // Auto-focus pada field nama pertama
        setTimeout(() => {
            const inputNama = document.getElementById("input-new-nama");
            if (inputNama) inputNama.focus();
        }, 50);

        // Escape key handler
        if (this._escHandler) window.removeEventListener("keydown", this._escHandler);
        this._escHandler = (e) => {
            if (e.key === "Escape") {
                this.closeAddUserModal();
            }
        };
        window.addEventListener("keydown", this._escHandler);
    },

    closeAddUserModal() {
        if (this._escHandler) {
            window.removeEventListener("keydown", this._escHandler);
            this._escHandler = null;
        }
        document.getElementById("modal-add-user").classList.add("hidden");
    },

    /**
     * Generate password acak dan tempelkan ke input password
     */
    generateAndFillPassword() {
        const pwdInput = document.getElementById("input-new-password");
        const suggested = AuthService.generateSuggestedPassword();
        pwdInput.value = suggested;
    },

    /**
     * Salin password ke clipboard
     */
    copyPassword() {
        const pwdInput = document.getElementById("input-new-password");
        if (!pwdInput.value) return;

        navigator.clipboard.writeText(pwdInput.value).then(() => {
            App.showToast("Password berhasil disalin ke clipboard!", "success");
        }).catch(() => {
            App.showToast("Gagal menyalin password.", "error");
        });
    },

    /**
     * Toggle visibility password
     */
    togglePasswordVisibility(inputId, iconId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        if (input.type === "password") {
            input.type = "text";
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
        } else {
            input.type = "password";
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
        }
    },

    /**
     * Simpan user baru ke database
     */
    async submitCreateUser() {
        const currentUser = AuthService.getUser();
        const nama = document.getElementById("input-new-nama").value.trim();
        const username = document.getElementById("input-new-username").value.trim();
        const password = document.getElementById("input-new-password").value.trim();
        const role = document.getElementById("input-new-role").value;
        const asalSekolah = document.getElementById("input-new-school").value.trim();

        if (!nama || !username || !password || !asalSekolah) {
            App.showToast("Semua kolom data wajib diisi!", "error");
            return;
        }

        const btn = document.getElementById("btn-submit-user");
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-1.5"></i> Menyimpan...`;

        try {
            const res = await ApiService.post({
                action: "create_user",
                currentUserRole: currentUser.role,
                currentUserSchool: currentUser.asal_sekolah,
                nama: nama,
                username: username,
                password: password,
                role: role,
                asal_sekolah: asalSekolah
            });

            if (res.status === "success") {
                App.showToast(res.message || "Pengguna berhasil ditambahkan!", "success");
                this.closeAddUserModal();
                await this.loadUsers();
            } else {
                App.showToast(res.message || "Gagal menambahkan pengguna.", "error");
            }
        } catch (err) {
            App.showToast("Terjadi kesalahan koneksi saat menyimpan pengguna.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-check mr-1.5"></i> Simpan Pengguna`;
        }
    },

    /**
     * Konfirmasi hapus user
     */
    async confirmDeleteUser(userId, nama) {
        const confirmed = await App.confirmModal({
            title: "Hapus Pengguna",
            message: `Apakah Anda yakin ingin menghapus akun pengguna <strong>"${nama}"</strong> (${userId})?`,
            subMessage: "Pengguna ini tidak akan dapat login lagi ke sistem PantauSekolah.",
            confirmText: "Ya, Hapus Pengguna",
            confirmType: "danger",
            icon: "fa-solid fa-user-xmark"
        });

        if (confirmed) {
            this.deleteUser(userId);
        }
    },

    deleteUser(userId) {
        if (typeof LiveSync !== "undefined") {
            LiveSync.optimisticDeleteUser(userId);
        }
    }
};
