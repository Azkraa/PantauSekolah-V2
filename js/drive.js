/**
 * ==========================================================================
 * PantauSekolah - Google Drive Folder Manager Module
 * ==========================================================================
 * Mengelola pembuatan dan penataan folder Google Drive sekolah (Single & Batch).
 */

const DriveManager = {
    cachedSchools: [],
    cachedFolders: [],
    selectedFolderIds: new Set(),

    /**
     * Memuat data folder dan sekolah dari backend
     */
    async loadDriveData() {
        const user = AuthService.getUser();
        if (!user || user.role !== "Pengawas") return;

        // Render instan 0ms jika data sudah ada di memori
        if (this.cachedSchools && this.cachedSchools.length > 0) {
            this.renderSchoolDriveCards();
            this.populateSchoolDropdown();
            this.renderCustomFoldersTable();
        }

        // Live Sync di background
        if (typeof LiveSync !== "undefined") {
            LiveSync.sync({ silent: true });
        }
    },

    /**
     * Render daftar sekolah beserta link folder Google Drive utamanya
     */
    renderSchoolDriveCards() {
        const grid = document.getElementById("grid-school-drives");
        if (!grid) return;

        if (this.cachedSchools.length === 0) {
            grid.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 font-medium bg-white rounded-2xl border">Belum ada folder sekolah yang terdaftar.</div>`;
            return;
        }

        grid.innerHTML = "";
        this.cachedSchools.forEach((sch, idx) => {
            const schoolId = sch.id || sch.driveFolderId || `SCH-${String(idx + 1).padStart(3, '0')}`;
            const folderUrl = sch.driveFolderUrl || sch.driveUrl || "";
            const hasValidUrl = folderUrl && folderUrl !== "undefined" && folderUrl !== "#";

            grid.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border border-[#E8E2D5] shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4 card-hover overflow-hidden">
                    <div class="flex items-start gap-3.5 w-full min-w-0">
                        <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 border border-blue-100">
                            <i class="fa-brands fa-google-drive"></i>
                        </div>
                        <div class="min-w-0 flex-1">
                            <h4 class="font-bold text-slate-800 text-sm break-words line-clamp-2 leading-snug">${sch.nama}</h4>
                            <p class="text-[11px] text-slate-400 font-mono mt-0.5">${schoolId}</p>
                            <span class="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
                                Folder Aktif
                            </span>
                        </div>
                    </div>
                    <div class="pt-3 border-t border-[#F0EBE1] flex items-center justify-between">
                        <span class="text-[11px] text-slate-400 font-medium">Google Drive</span>
                        ${hasValidUrl
                            ? `<a href="${folderUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka Folder
                               </a>`
                            : `<span class="text-xs text-slate-400 italic">Belum ada folder Drive</span>`
                        }
                    </div>
                </div>
            `;
        });
    },

    /**
     * Mengisi dropdown pilihan sekolah di modal tambah folder
     */
    populateSchoolDropdown() {
        const select = document.getElementById("select-target-school");
        if (!select) return;

        select.innerHTML = "";
        this.cachedSchools.forEach(sch => {
            select.innerHTML += `<option value="${sch.nama}">${sch.nama}</option>`;
        });
    },

    /**
     * Render riwayat pembuatan folder tambahan
     */
    renderCustomFoldersTable() {
        const tbody = document.getElementById("table-body-custom-folders");
        if (!tbody) return;

        // Deduplikasi folder jika ada duplikasi ID atau nama+sekolah+subkategori
        const seenFolderKeys = new Set();
        const visibleFolders = (this.cachedFolders || []).filter(f => {
            if (!f || !f.namaFolder) return false;
            if (f.namaFolder.startsWith("__DELETED__:") || (f.id && f.id.toString().startsWith("DEL-"))) return false;

            const fName = (f.namaFolder || "").trim().toLowerCase();
            const sName = (f.namaSekolah || "").trim().toLowerCase();
            const sub = (f.subCategory || "guru").trim().toLowerCase();
            const key = `${fName}|||${sName}|||${sub}`;

            if (seenFolderKeys.has(key)) return false;
            seenFolderKeys.add(key);
            return true;
        });

        if (visibleFolders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400 font-medium">Belum ada folder tambahan yang dibuat.</td></tr>`;
            this.clearSelection();
            return;
        }

        tbody.innerHTML = "";
        visibleFolders.forEach(f => {
            const typeBadge = f.targetType === "all"
                ? `<span class="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded text-[10px]">Semua Sekolah</span>`
                : `<span class="bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded text-[10px]">1 Sekolah</span>`;

            const isChecked = this.selectedFolderIds.has(f.id);

            tbody.innerHTML += `
                <tr class="hover:bg-[#FAF7F0] transition-colors border-b border-[#F0EBE1] ${isChecked ? 'bg-blue-50/40' : ''}">
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <input type="checkbox" class="folder-row-cb w-4 h-4 rounded text-blue-600 border-[#D5CEBF] focus:ring-blue-500 cursor-pointer"
                            value="${f.id}"
                            ${isChecked ? 'checked' : ''}
                            onchange="DriveManager.onRowCheckboxChange(this, '${f.id}')">
                    </td>
                    <td class="p-3.5 font-mono text-slate-700 font-bold whitespace-nowrap">${f.id}</td>
                    <td class="p-3.5 font-bold text-slate-800 whitespace-nowrap">${f.namaFolder}</td>
                    <td class="p-3.5 font-medium text-slate-700 whitespace-nowrap">${f.namaSekolah}</td>
                    <td class="p-3.5 whitespace-nowrap">${typeBadge}</td>
                    <td class="p-3.5 text-slate-500 text-[11px] whitespace-nowrap">${f.createdAt}</td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <a href="${f.driveFolderUrl}" target="_blank" class="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-bold bg-blue-50/80 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg text-xs transition-colors">
                            <i class="fa-brands fa-google-drive"></i> Buka Drive
                        </a>
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <button onclick="DriveManager.confirmDeleteFolder('${f.id}', '${f.namaFolder}', '${f.namaSekolah}')" class="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg font-semibold text-[11px] transition-colors border border-rose-200">
                            <i class="fa-solid fa-trash-can mr-1"></i> Hapus
                        </button>
                    </td>
                </tr>
            `;
        });

        this.updateBulkBar();
    },

    toggleSelectAll(masterCb) {
        const checked = masterCb.checked;
        const cbs = document.querySelectorAll(".folder-row-cb");
        cbs.forEach(cb => {
            cb.checked = checked;
            if (checked) {
                this.selectedFolderIds.add(cb.value);
            } else {
                this.selectedFolderIds.delete(cb.value);
            }
        });
        this.updateBulkBar();
    },

    onRowCheckboxChange(cb, folderId) {
        if (cb.checked) {
            this.selectedFolderIds.add(folderId);
        } else {
            this.selectedFolderIds.delete(folderId);
        }

        const total = document.querySelectorAll(".folder-row-cb").length;
        const checked = document.querySelectorAll(".folder-row-cb:checked").length;
        const master = document.getElementById("check-all-custom-folders");
        if (master) {
            master.checked = (total > 0 && checked === total);
            master.indeterminate = (checked > 0 && checked < total);
        }
        this.updateBulkBar();
    },

    clearSelection() {
        this.selectedFolderIds.clear();
        document.querySelectorAll(".folder-row-cb").forEach(cb => cb.checked = false);
        const master = document.getElementById("check-all-custom-folders");
        if (master) {
            master.checked = false;
            master.indeterminate = false;
        }
        this.updateBulkBar();
    },

    updateBulkBar() {
        const count = this.selectedFolderIds.size;
        const bar = document.getElementById("bulk-bar-custom-folders");
        if (bar) {
            if (count > 0) {
                bar.classList.remove("hidden");
                const badge = bar.querySelector(".bulk-count-badge");
                if (badge) badge.innerText = count;
            } else {
                bar.classList.add("hidden");
            }
        }
    },

    async bulkDeleteFolders() {
        const ids = Array.from(this.selectedFolderIds);
        if (ids.length === 0) {
            App.showToast("Tidak ada folder yang dipilih.", "warning");
            return;
        }

        const count = ids.length;
        const confirmed = await App.confirmModal({
            title: "Hapus Folder Terpilih",
            message: `Apakah Anda yakin ingin menghapus <strong>${count} folder</strong> Google Drive terpilih?`,
            subMessage: "Folder di Google Drive dan basis data juga akan dipindahkan ke Sampah.",
            confirmText: `Ya, Hapus ${count} Folder`,
            confirmType: "danger",
            icon: "fa-solid fa-trash-can"
        });

        if (confirmed) {
            this.clearSelection();
            if (typeof LiveSync !== "undefined") {
                LiveSync.optimisticDeleteFolder(ids);
            }
        }
    },

    async confirmDeleteFolder(folderId, folderName, schoolName) {
        const confirmed = await App.confirmModal({
            title: "Hapus Folder Google Drive",
            message: `Apakah Anda yakin ingin menghapus folder <strong>"${folderName}"</strong> (${folderId})${schoolName ? ` untuk <strong>${schoolName}</strong>` : ''}?`,
            subMessage: "Folder di Google Drive juga akan dipindahkan ke Sampah.",
            confirmText: "Ya, Hapus Folder",
            confirmType: "danger",
            icon: "fa-solid fa-trash-can"
        });

        if (confirmed) {
            this.deleteFolder(folderId, schoolName);
        }
    },

    deleteFolder(folderId, schoolName) {
        if (typeof LiveSync !== "undefined") {
            LiveSync.optimisticDeleteFolder(folderId, schoolName);
        }
    },

    openAddFolderModal() {
        document.getElementById("form-add-drive-folder").reset();
        this.handleTargetTypeChange();
        document.getElementById("modal-add-drive-folder").classList.remove("hidden");

        // Auto-focus pada field nama folder
        setTimeout(() => {
            const inputFolder = document.getElementById("input-folder-name");
            if (inputFolder) inputFolder.focus();
        }, 50);

        // Escape key handler
        if (this._escHandler) window.removeEventListener("keydown", this._escHandler);
        this._escHandler = (e) => {
            if (e.key === "Escape") {
                this.closeAddFolderModal();
            }
        };
        window.addEventListener("keydown", this._escHandler);
    },

    closeAddFolderModal() {
        if (this._escHandler) {
            window.removeEventListener("keydown", this._escHandler);
            this._escHandler = null;
        }
        document.getElementById("modal-add-drive-folder").classList.add("hidden");
    },

    /**
     * Handler saat switch opsi: "Satu Sekolah" vs "Semua Sekolah Sekaligus"
     */
    handleTargetTypeChange() {
        const targetType = document.querySelector('input[name="drive-target-type"]:checked').value;
        const schoolWrapper = document.getElementById("wrapper-single-school-select");

        if (targetType === "all") {
            schoolWrapper.classList.add("hidden");
        } else {
            schoolWrapper.classList.remove("hidden");
        }
    },

    /**
     * Eksekusi pembuatan folder baru di Drive
     */
    async submitCreateFolder() {
        const currentUser = AuthService.getUser();
        const folderName = document.getElementById("input-folder-name").value.trim();
        const targetType = document.querySelector('input[name="drive-target-type"]:checked').value;
        const targetSchool = document.getElementById("select-target-school").value;
        const subCategory = document.getElementById("select-sub-category").value;

        if (!folderName) {
            App.showToast("Nama folder wajib diisi!", "error");
            return;
        }

        // Langsung tutup modal formulir seketika (Auto Close) tanpa modal konfirmasi ganda
        this.closeAddFolderModal();

        const isBatch = targetType === "all";
        const targetLabel = isBatch ? "seluruh sekolah binaan" : targetSchool;
        App.showToast(`Sedang membuat folder "${folderName}" untuk ${targetLabel}... ${isBatch ? 'Proses ini memerlukan waktu beberapa detik, mohon tunggu...' : ''}`, "info");

        try {
            // Gunakan timeout khusus 120 detik untuk batch all schools agar tidak terkena abort timeout
            const timeoutMs = isBatch ? (CONFIG.UPLOAD_TIMEOUT_MS || 120000) : undefined;
            const res = await ApiService.post({
                action: "create_drive_folder",
                currentUserRole: currentUser.role,
                folderName: folderName,
                targetType: targetType,
                targetSchool: targetSchool,
                subCategory: subCategory
            }, timeoutMs);

            if (res.status === "success") {
                App.showToast(res.message || `Folder "${folderName}" berhasil dibuat di Google Drive!`, "success");
                await this.loadDriveData();
            } else {
                App.showToast(res.message || "Gagal membuat folder Google Drive.", "error");
            }
        } catch (err) {
            console.error("Error creating Drive folder:", err);
            const errMsg = (err && err.message) ? err.message : "Terjadi kesalahan saat membuat folder Google Drive.";
            App.showToast(errMsg, "error");
            // Muat ulang data folder yang sempat tersimpan
            await this.loadDriveData();
        }
    }
};
