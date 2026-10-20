/**
 * ==========================================================================
 * PantauSekolah - User Manager Module
 * ==========================================================================
 * Mengelola pendaftaran & data pengguna untuk Pengawas & Kepala Sekolah.
 * Dilengkapi fitur Edit Pengguna, Multi-Select Checkbox, Hapus Batch, dan Reset Password.
 */

const UserManager = {
    cachedUsers: [],
    selectedUserIds: new Set(),

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
            const loadingRow = `<tr><td colspan="8" class="p-6 text-center text-slate-400 font-medium"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i> ${isKepsek ? 'Memuat data guru...' : 'Memuat data pengguna...'}</td></tr>`;

            if (tableBody) tableBody.innerHTML = loadingRow;
            if (tableBodyGuru) tableBodyGuru.innerHTML = loadingRow;
        }

        // Live Sync di background tanpa blocking
        if (typeof LiveSync !== "undefined") {
            LiveSync.sync({ silent: true });
        }
    },

    /**
     * Toggle Checkbox Pilih Semua
     */
    toggleSelectAll(masterCb) {
        const checked = masterCb.checked;

        // Ambil baris user yang sedang tampil
        const rowCheckboxes = document.querySelectorAll(".user-row-cb:not(:disabled)");
        rowCheckboxes.forEach(cb => {
            cb.checked = checked;
            const uId = cb.value;
            if (checked) {
                this.selectedUserIds.add(uId);
            } else {
                this.selectedUserIds.delete(uId);
            }
        });

        this.updateBulkBar();
    },

    /**
     * Handler saat satu checkbox baris diubah
     */
    onRowCheckboxChange(cb, userId) {
        if (cb.checked) {
            this.selectedUserIds.add(userId);
        } else {
            this.selectedUserIds.delete(userId);
        }

        // Sync status master checkbox
        const totalRows = document.querySelectorAll(".user-row-cb:not(:disabled)").length;
        const checkedRows = document.querySelectorAll(".user-row-cb:checked").length;
        const masterCheckboxes = [
            document.getElementById("check-all-users"),
            document.getElementById("check-all-guru-users")
        ].filter(Boolean);

        masterCheckboxes.forEach(m => {
            m.checked = (totalRows > 0 && checkedRows === totalRows);
            m.indeterminate = (checkedRows > 0 && checkedRows < totalRows);
        });

        this.updateBulkBar();
    },

    /**
     * Bersihkan seleksi checkbox
     */
    clearSelection() {
        this.selectedUserIds.clear();
        document.querySelectorAll(".user-row-cb").forEach(cb => cb.checked = false);
        const masterCheckboxes = [
            document.getElementById("check-all-users"),
            document.getElementById("check-all-guru-users")
        ].filter(Boolean);
        masterCheckboxes.forEach(m => {
            m.checked = false;
            m.indeterminate = false;
        });
        this.updateBulkBar();
    },

    /**
     * Perbarui tampilan Toolbar Aksi Masal (Bulk Action Bar)
     */
    updateBulkBar() {
        const count = this.selectedUserIds.size;
        const bulkBars = [
            document.getElementById("bulk-bar-users"),
            document.getElementById("bulk-bar-guru-users")
        ].filter(Boolean);

        bulkBars.forEach(bar => {
            if (count > 0) {
                bar.classList.remove("hidden");
                const countBadge = bar.querySelector(".bulk-count-badge");
                if (countBadge) countBadge.innerText = count;

                // Label & styling tombol reset password (maksimal 2 akun)
                const resetBtn = bar.querySelector(".btn-bulk-reset");
                if (resetBtn) {
                    if (count > 2) {
                        resetBtn.classList.remove("bg-amber-500", "hover:bg-amber-600", "text-white");
                        resetBtn.classList.add("bg-slate-200", "text-slate-400", "cursor-not-allowed");
                        resetBtn.title = "Reset password maksimal 2 akun sekaligus untuk keamanan.";
                    } else {
                        resetBtn.classList.remove("bg-slate-200", "text-slate-400", "cursor-not-allowed");
                        resetBtn.classList.add("bg-amber-500", "hover:bg-amber-600", "text-white");
                        resetBtn.title = "Reset password untuk akun terpilih";
                    }
                }
            } else {
                bar.classList.add("hidden");
            }
        });
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
                        <td colspan="8" class="p-8 text-center text-slate-400 font-medium">
                            <i class="fa-solid fa-chalkboard-user text-2xl text-slate-300 block mb-2"></i>
                            ${emptyMsg}
                        </td>
                    </tr>
                `;
            });
            this.clearSelection();
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

            const isSelf = u.username === currentUser.username;
            const isChecked = this.selectedUserIds.has(u.id);

            // Action Buttons: Edit, Reset, Hapus
            let actionBtn = "";
            if (isPengawas) {
                if (isSelf) {
                    actionBtn = `
                        <div class="inline-flex items-center gap-1.5">
                            <button onclick="UserManager.openEditUserModal('${u.id}')" title="Edit Data Akun Sendiri" class="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-semibold text-[11px] transition-colors border border-blue-200">
                                <i class="fa-solid fa-pen-to-square mr-1"></i> Edit
                            </button>
                            <span class="text-slate-400 text-[10px] italic font-medium px-1">(Akun Anda)</span>
                        </div>
                    `;
                } else {
                    actionBtn = `
                        <div class="inline-flex items-center gap-1.5">
                            <button onclick="UserManager.openEditUserModal('${u.id}')" title="Edit Data Pengguna" class="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-semibold text-[11px] transition-colors border border-blue-200">
                                <i class="fa-solid fa-pen-to-square mr-1"></i> Edit
                            </button>
                            <button onclick="AuthService.openForgotPasswordModal('${u.username}', '${u.asalSekolah || ''}')" title="Reset Password Akun" class="px-2.5 py-1 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg font-semibold text-[11px] transition-colors border border-amber-200">
                                <i class="fa-solid fa-key mr-1"></i> Reset
                            </button>
                            <button onclick="UserManager.confirmDeleteUser('${u.id}', '${u.nama}')" title="Hapus Pengguna" class="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg font-semibold text-[11px] transition-colors border border-rose-200">
                                <i class="fa-solid fa-trash-can mr-1"></i> Hapus
                            </button>
                        </div>
                    `;
                }
            } else if (isKepsek) {
                actionBtn = `
                    <div class="inline-flex items-center gap-1.5">
                        <button onclick="UserManager.openEditUserModal('${u.id}')" title="Edit Data Guru" class="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-semibold text-[11px] transition-colors border border-blue-200">
                            <i class="fa-solid fa-pen-to-square mr-1"></i> Edit
                        </button>
                        <button onclick="AuthService.openForgotPasswordModal('${u.username}', '${u.asalSekolah || ''}')" title="Reset Password Akun Guru" class="px-2.5 py-1 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg font-semibold text-[11px] transition-colors border border-amber-200">
                            <i class="fa-solid fa-key mr-1"></i> Reset
                        </button>
                    </div>
                `;
            } else {
                actionBtn = `<span class="text-slate-400 text-xs">-</span>`;
            }

            const checkboxHtml = `
                <td class="p-3.5 text-center whitespace-nowrap">
                    <input type="checkbox" class="user-row-cb w-4 h-4 rounded text-blue-600 border-[#D5CEBF] focus:ring-blue-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        value="${u.id}"
                        data-username="${u.username}"
                        data-nama="${u.nama}"
                        ${isSelf ? 'disabled title="Tidak dapat memilih akun Anda sendiri"' : ''}
                        ${isChecked ? 'checked' : ''}
                        onchange="UserManager.onRowCheckboxChange(this, '${u.id}')">
                </td>
            `;

            htmlRows += `
                <tr class="hover:bg-[#FAF7F0] transition-colors border-b border-[#F0EBE1] ${isChecked ? 'bg-blue-50/40' : ''}">
                    ${checkboxHtml}
                    <td class="p-3.5 font-bold text-slate-700 font-mono whitespace-nowrap">${u.id}</td>
                    <td class="p-3.5 whitespace-nowrap">
                        <p class="font-bold text-slate-800">${u.nama}</p>
                        <p class="text-[10px] text-slate-400 font-mono">@${u.username}</p>
                    </td>
                    <td class="p-3.5 whitespace-nowrap">${roleBadge}</td>
                    <td class="p-3.5 font-medium text-slate-700 whitespace-nowrap">${u.asalSekolah || '-'}</td>
                    <td class="p-3.5 text-center whitespace-nowrap">${driveBtn}</td>
                    <td class="p-3.5 whitespace-nowrap">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${u.status === 'Nonaktif' ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}">
                            ${u.status || 'Aktif'}
                        </span>
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">${actionBtn}</td>
                </tr>
            `;
        });

        targetBodies.forEach(tb => {
            tb.innerHTML = htmlRows;
        });

        this.updateBulkBar();
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

    // =========================================================================
    // FITUR EDIT PENGGUNA
    // =========================================================================

    openEditUserModal(userId) {
        const user = (this.cachedUsers || []).find(u => u.id === userId);
        if (!user) {
            App.showToast("Data pengguna tidak ditemukan.", "error");
            return;
        }

        const currentUser = AuthService.getUser();
        const isPengawas = currentUser && currentUser.role === "Pengawas";

        const modal = document.getElementById("modal-edit-user");
        if (!modal) return;

        // Populate fields
        document.getElementById("edit-user-id").value = user.id;
        document.getElementById("edit-user-id-display").value = user.id;
        document.getElementById("edit-user-nama").value = user.nama || "";
        document.getElementById("edit-user-username").value = user.username || "";
        document.getElementById("edit-user-status").value = user.status || "Aktif";
        document.getElementById("edit-user-password").value = "";

        const roleSelect = document.getElementById("edit-user-role");
        roleSelect.value = user.role || "Guru";
        roleSelect.disabled = !isPengawas; // Kepsek tidak bisa ubah role

        // Populate school options
        const schoolSelect = document.getElementById("edit-user-school");
        const availableSchools = (typeof DashboardManager !== "undefined" && DashboardManager.getAllSchoolsList)
            ? DashboardManager.getAllSchoolsList()
            : [];

        let schoolOptionsHtml = "";
        if (isPengawas) {
            schoolOptionsHtml += `<option value="Dinas Pendidikan" ${user.asalSekolah === "Dinas Pendidikan" ? "selected" : ""}>Dinas Pendidikan</option>`;
            availableSchools.forEach(sch => {
                const isSelected = (user.asalSekolah || "").toLowerCase() === sch.toLowerCase();
                schoolOptionsHtml += `<option value="${sch}" ${isSelected ? "selected" : ""}>${sch}</option>`;
            });
            schoolSelect.disabled = false;
        } else {
            schoolOptionsHtml = `<option value="${currentUser.asal_sekolah}" selected>${currentUser.asal_sekolah}</option>`;
            schoolSelect.disabled = true;
        }
        schoolSelect.innerHTML = schoolOptionsHtml;

        modal.classList.remove("hidden");

        // Focus nama
        setTimeout(() => {
            const el = document.getElementById("edit-user-nama");
            if (el) el.focus();
        }, 50);
    },

    closeEditUserModal() {
        const modal = document.getElementById("modal-edit-user");
        if (modal) modal.classList.add("hidden");
    },

    toggleEditPasswordVisibility() {
        const input = document.getElementById("edit-user-password");
        const icon = document.getElementById("edit-pwd-icon");
        if (!input) return;
        if (input.type === "password") {
            input.type = "text";
            if (icon) {
                icon.classList.remove("fa-eye");
                icon.classList.add("fa-eye-slash");
            }
        } else {
            input.type = "password";
            if (icon) {
                icon.classList.remove("fa-eye-slash");
                icon.classList.add("fa-eye");
            }
        }
    },

    onEditRoleChange() {
        const role = document.getElementById("edit-user-role").value;
        const schoolSelect = document.getElementById("edit-user-school");
        if (role === "Pengawas") {
            schoolSelect.value = "Dinas Pendidikan";
        }
    },

    async handleSaveEditUser(event) {
        if (event) event.preventDefault();

        const userId = document.getElementById("edit-user-id").value;
        const nama = document.getElementById("edit-user-nama").value.trim();
        const username = document.getElementById("edit-user-username").value.trim();
        const role = document.getElementById("edit-user-role").value;
        const asalSekolah = document.getElementById("edit-user-school").value;
        const status = document.getElementById("edit-user-status").value;
        const password = document.getElementById("edit-user-password").value.trim();

        if (!nama || !username) {
            App.showToast("Nama dan Username wajib diisi!", "error");
            return;
        }

        if (password && password.length < 5) {
            App.showToast("Password baru minimal 5 karakter!", "error");
            return;
        }

        const btn = document.getElementById("btn-save-edit-user");
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Menyimpan...`;
        }

        // 1. Optimistic update di memori & LiveSync seketika (0ms!)
        const targetUser = (this.cachedUsers || []).find(u => u.id === userId);
        if (targetUser) {
            targetUser.nama = nama;
            targetUser.username = username;
            targetUser.role = role;
            targetUser.asalSekolah = asalSekolah;
            targetUser.status = status;
        }

        if (typeof LiveSync !== "undefined") {
            const syncUser = (LiveSync.state.users || []).find(u => u.id === userId);
            if (syncUser) {
                syncUser.nama = nama;
                syncUser.username = username;
                syncUser.role = role;
                syncUser.asalSekolah = asalSekolah;
                syncUser.status = status;
                LiveSync.saveToLocalStorage();
            }
        }

        this.renderUserTable();
        this.closeEditUserModal();
        App.showToast("Data pengguna berhasil diperbarui!", "success");

        // 2. Kirim update ke server Google Apps Script
        const currentUser = AuthService.getUser();
        try {
            const res = await ApiService.post({
                action: "update_user",
                userId: userId,
                nama: nama,
                username: username,
                role: role,
                asal_sekolah: asalSekolah,
                status: status,
                password: password,
                currentUserRole: currentUser ? currentUser.role : "Pengawas",
                currentUserName: currentUser ? currentUser.nama : "Pengawas",
                currentUserUsername: currentUser ? currentUser.username : "admin"
            });

            if (res && res.status === "error") {
                App.showToast(res.message || "Gagal memperbarui pengguna di server.", "error");
            }

            if (typeof LiveSync !== "undefined") {
                LiveSync.sync({ silent: true });
            }
        } catch (err) {
            App.showToast("Gagal menyinkronkan pembaruan data pengguna ke server.", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1"></i> Simpan Perubahan`;
            }
        }
    },

    // =========================================================================
    // FITUR AKSI BATCH (HAPUS BANYAK & RESET PASSWORD DENGAN LIMITASI)
    // =========================================================================

    /**
     * Hapus semua pengguna yang dicentang
     */
    async bulkDeleteUsers() {
        if (this.selectedUserIds.size === 0) {
            App.showToast("Tidak ada pengguna yang dipilih.", "warning");
            return;
        }

        const count = this.selectedUserIds.size;
        const selectedUsers = (this.cachedUsers || []).filter(u => this.selectedUserIds.has(u.id));
        const sampleNames = selectedUsers.slice(0, 3).map(u => u.nama).join(", ") + (count > 3 ? "..." : "");

        const confirmed = await App.confirmModal({
            title: "Hapus Pengguna Terpilih",
            message: `Apakah Anda yakin ingin menghapus <strong>${count} pengguna</strong> terpilih?<br><span class="text-xs text-slate-500 font-medium">(${sampleNames})</span>`,
            subMessage: "Akun-akun ini tidak akan dapat login lagi ke sistem PantauSekolah.",
            confirmText: `Ya, Hapus ${count} Pengguna`,
            confirmType: "danger",
            icon: "fa-solid fa-trash-can"
        });

        if (confirmed) {
            const ids = Array.from(this.selectedUserIds);
            this.clearSelection();
            if (typeof LiveSync !== "undefined") {
                LiveSync.optimisticDeleteUser(ids);
            }
        }
    },

    /**
     * Reset password untuk akun terpilih
     * ATURAN USER: Jika reset tidak bisa dipilih sekaligus lebih dari 2!
     */
    async bulkResetPassword() {
        const count = this.selectedUserIds.size;
        if (count === 0) {
            App.showToast("Silakan centang akun yang ingin di-reset password-nya.", "warning");
            return;
        }

        // VALIDASI KRUSIAL DARI USER: TIDAK BISA DIPILIH LEBIH DARI 2
        if (count > 2) {
            App.showToast("Reset password tidak bisa dipilih sekaligus lebih dari 2 akun! Silakan pilih maksimal 2 akun demi keamanan data.", "warning");
            return;
        }

        const selectedUsers = (this.cachedUsers || []).filter(u => this.selectedUserIds.has(u.id));
        if (selectedUsers.length === 1) {
            AuthService.openForgotPasswordModal(selectedUsers[0].username, selectedUsers[0].asalSekolah || "");
            return;
        }

        // Jika tepat 2 akun:
        const userNames = selectedUsers.map(u => `@${u.username} (${u.nama})`).join(" dan ");
        const confirmed = await App.confirmModal({
            title: "Reset Password (2 Akun Terpilih)",
            message: `Anda akan mereset password untuk 2 akun sekaligus:<br><strong>${userNames}</strong>`,
            subMessage: "Sistem akan membuka dialog pengisian password baru untuk akun pertama, lalu dilanjutkan akun kedua.",
            confirmText: "Lanjutkan Reset",
            confirmType: "warning",
            icon: "fa-solid fa-key"
        });

        if (confirmed) {
            // Buka modal untuk akun pertama
            AuthService.openForgotPasswordModal(selectedUsers[0].username, selectedUsers[0].asalSekolah || "");
        }
    },

    // =========================================================================
    // MODAL TAMBAH USER BARU
    // =========================================================================

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
            schoolInput.placeholder = "Contoh: SDN 12 Raya Hulu";
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
        if (pwdInput) pwdInput.value = suggested;
    },

    /**
     * Salin password ke clipboard
     */
    copyPassword() {
        const pwdInput = document.getElementById("input-new-password");
        if (!pwdInput || !pwdInput.value) return;

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
        if (!input) return;
        if (input.type === "password") {
            input.type = "text";
            if (icon) {
                icon.classList.remove("fa-eye");
                icon.classList.add("fa-eye-slash");
            }
        } else {
            input.type = "password";
            if (icon) {
                icon.classList.remove("fa-eye-slash");
                icon.classList.add("fa-eye");
            }
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
     * Konfirmasi hapus user tunggal
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
