/**
 * =============================================================================
 * PantauSekolah - AI Chat Assistant Module (ai-assistant.js)
 * =============================================================================
 * Fitur:
 * 1. Asisten AI Interaktif Berbasis Percakapan (PantauBot).
 * 2. Sadar Peran & Konteks (Pengawas, Kepala Sekolah, Guru).
 * 3. Injeksi data riil supervisi & kurikulum secara dinamis (RAG Ringan).
 * 4. Mendukung OpenRouter & Google Gemini API dengan fallback berlapis.
 * 5. Floating widget elegan, responsive, mendukung Dark Mode & Quick Prompts.
 * =============================================================================
 */

const AIAssistant = {
    STORAGE_KEY_MESSAGES: "pantausekolah_ai_chat_history",
    STORAGE_KEY_KEY: "pantausekolah_ai_api_key",
    STORAGE_KEY_MODEL: "pantausekolah_ai_model",

    isOpen: false,
    isMaximized: false,
    isLoading: false,
    messages: [],

    /**
     * Inisialisasi modul Asisten AI
     */
    init() {
        this.loadChatHistory();
        this.renderQuickPrompts();
        this.renderMessages();
        this.bindEvents();
    },

    /**
     * Muat riwayat pesan dari local storage
     */
    loadChatHistory() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY_MESSAGES);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this.messages = parsed;
                    return;
                }
            }
        } catch (e) {}

        // Jika riwayat kosong, pasang salam awal sesuai peran
        this.messages = [];
    },

    /**
     * Simpan riwayat percakapan ke local storage
     */
    saveChatHistory() {
        try {
            // Batasi riwayat maksimal 25 pesan terakhir agar memori tetap ringan
            const toSave = this.messages.slice(-25);
            localStorage.setItem(this.STORAGE_KEY_MESSAGES, JSON.stringify(toSave));
        } catch (e) {}
    },

    /**
     * Hapus riwayat percakapan
     */
    clearChat() {
        this.messages = [];
        try {
            localStorage.removeItem(this.STORAGE_KEY_MESSAGES);
        } catch (e) {}
        this.renderMessages();
        this.renderQuickPrompts();
        if (typeof App !== "undefined" && typeof App.showToast === "function") {
            App.showToast("Riwayat obrolan AI telah dibersihkan.", "info");
        }
    },

    /**
     * Buka / Tutup Jendela Percakapan
     */
    toggleChat(forceState) {
        const container = document.getElementById("ai-chat-window");
        const launcher = document.getElementById("ai-chat-launcher");
        if (!container) return;

        this.isOpen = typeof forceState === "boolean" ? forceState : !this.isOpen;

        if (this.isOpen) {
            container.classList.remove("hidden");
            // Delay halus untuk animasi scale up
            requestAnimationFrame(() => {
                container.classList.remove("opacity-0", "scale-95", "pointer-events-none");
                container.classList.add("opacity-100", "scale-100");
            });
            if (launcher) launcher.classList.add("ring-4", "ring-indigo-400/40");
            
            // Auto focus ke input
            setTimeout(() => {
                const input = document.getElementById("ai-chat-input");
                if (input) input.focus();
                this.scrollToBottom();
            }, 100);
        } else {
            container.classList.remove("opacity-100", "scale-100");
            container.classList.add("opacity-0", "scale-95", "pointer-events-none");
            setTimeout(() => {
                if (!this.isOpen) container.classList.add("hidden");
            }, 200);
            if (launcher) launcher.classList.remove("ring-4", "ring-indigo-400/40");
        }
    },

    /**
     * Toggle ukuran jendela (Maximize / Normal)
     */
    toggleMaximize() {
        const container = document.getElementById("ai-chat-window");
        const maxBtn = document.getElementById("ai-btn-maximize");
        if (!container) return;

        this.isMaximized = !this.isMaximized;

        if (this.isMaximized) {
            container.classList.remove("w-[94vw]", "sm:w-[440px]", "md:w-[480px]", "h-[600px]", "max-h-[82vh]");
            container.classList.add("w-[96vw]", "sm:w-[720px]", "md:w-[860px]", "h-[88vh]", "max-h-[92vh]");
            if (maxBtn) maxBtn.innerHTML = '<i class="fa-solid fa-compress text-xs"></i>';
        } else {
            container.classList.remove("w-[96vw]", "sm:w-[720px]", "md:w-[860px]", "h-[88vh]", "max-h-[92vh]");
            container.classList.add("w-[94vw]", "sm:w-[440px]", "md:w-[480px]", "h-[600px]", "max-h-[82vh]");
            if (maxBtn) maxBtn.innerHTML = '<i class="fa-solid fa-expand text-xs"></i>';
        }
        this.scrollToBottom();
    },

    /**
     * Toggle menu pengaturan API Key & Model di header chat
     */
    toggleSettings(forceState) {
        const panel = document.getElementById("ai-settings-drawer");
        if (!panel) return;
        const isHidden = panel.classList.contains("hidden");
        const willShow = typeof forceState === "boolean" ? forceState : isHidden;

        if (willShow) {
            panel.classList.remove("hidden");
            const keyInput = document.getElementById("ai-cfg-api-key");
            const modelInput = document.getElementById("ai-cfg-model");
            if (keyInput) keyInput.value = localStorage.getItem(this.STORAGE_KEY_KEY) || "";
            if (modelInput) modelInput.value = localStorage.getItem(this.STORAGE_KEY_MODEL) || "openai/gpt-oss-120b";
        } else {
            panel.classList.add("hidden");
        }
    },

    /**
     * Simpan pengaturan API Key & Model
     */
    saveSettings() {
        const keyInput = document.getElementById("ai-cfg-api-key");
        const modelInput = document.getElementById("ai-cfg-model");
        const key = keyInput ? keyInput.value.trim() : "";
        const model = modelInput ? modelInput.value.trim() : "openai/gpt-oss-120b";

        if (key) {
            localStorage.setItem(this.STORAGE_KEY_KEY, key);
        } else {
            localStorage.removeItem(this.STORAGE_KEY_KEY);
        }
        localStorage.setItem(this.STORAGE_KEY_MODEL, model || "openai/gpt-oss-120b");

        this.toggleSettings(false);
        if (typeof App !== "undefined" && typeof App.showToast === "function") {
            App.showToast("Pengaturan AI berhasil diperbarui!", "success");
        }
    },

    /**
     * Bangun System Prompt Kontekstual berbasis Peran dan Data Aplikasi Real-time
     */
    buildSystemPrompt() {
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const role = currentUser ? (currentUser.role || "Pengguna") : "Pengguna";
        const nama = currentUser ? (currentUser.nama || "Bapak/Ibu") : "Bapak/Ibu";
        const sekolah = currentUser ? (currentUser.asal_sekolah || "") : "";

        // Rangkum status data supervisi aplikasi saat ini
        let appDataSummary = "";
        try {
            if (typeof LiveSync !== "undefined" && LiveSync.state) {
                const s = LiveSync.state;
                if (role === "Pengawas") {
                    const schools = s.schools || [];
                    const kepsekR = s.reportsKepsek || [];
                    const guruR = s.reportsGuru || [];
                    appDataSummary = `KONTEKS DATA APLIKASI SAAT INI (REAL-TIME):
- Jumlah Sekolah Binaan: ${schools.length} Sekolah (${schools.map(x => x.nama).slice(0, 5).join(", ")}${schools.length > 5 ? '...' : ''})
- Laporan Kepala Sekolah Terkumpul: ${kepsekR.length} Berkas (Disetujui: ${kepsekR.filter(r => r.status === 'Disetujui').length}, Revisi: ${kepsekR.filter(r => r.status === 'Perlu Perbaikan').length})
- Laporan Guru Terkumpul: ${guruR.length} Berkas (Disetujui: ${guruR.filter(r => r.status === 'Disetujui').length}, Revisi: ${guruR.filter(r => r.status === 'Perlu Perbaikan').length})`;
                } else if (role === "Kepala Sekolah" || role === "Kepsek") {
                    const myGuruReports = (s.reportsGuru || []).filter(r => (r.asalSekolah || "").toLowerCase() === sekolah.toLowerCase());
                    const myReports = (s.reportsKepsek || []).filter(r => (r.asalSekolah || "").toLowerCase() === sekolah.toLowerCase());
                    appDataSummary = `KONTEKS SEKOLAH SAAT INI:
- Satuan Pendidikan: ${sekolah || "Sekolah Binaan"}
- Status Laporan Manajerial Kepala Sekolah: ${myReports.length} Berkas (${myReports.map(r => `${r.kategori}: ${r.status}`).join(", ") || "Belum ada laporan"})
- Laporan Guru di Sekolah Anda: ${myGuruReports.length} Berkas (${myGuruReports.filter(r => r.status === 'Disetujui').length} Disetujui, ${myGuruReports.filter(r => r.status === 'Perlu Perbaikan').length} Perlu Revisi)`;
                } else if (role === "Guru") {
                    const myReports = (s.reportsGuru || []).filter(r => (r.nama || "").toLowerCase() === nama.toLowerCase() || (r.asalSekolah || "").toLowerCase() === sekolah.toLowerCase());
                    const needRevision = myReports.filter(r => r.status === 'Perlu Perbaikan' || r.status === 'Ditolak');
                    appDataSummary = `KONTEKS GURU SAAT INI:
- Nama Pendidik: ${nama}
- Satuan Pendidikan: ${sekolah || "Sekolah"}
- Total Berkas Laporan Anda: ${myReports.length} Dokumen
${needRevision.length > 0 ? `- Perhatian Berkas Perlu Revisi: ${needRevision.map(r => `[${r.kategori}] Catatan Pengawas: "${r.catatan || 'Perlu perbaikan kelengkapan'}"`).join(" | ")}` : '- Status Berkas: Semua berkas terverifikasi baik/menunggu evaluasi.'}`;
                }
            }
        } catch (e) {}

        return `Anda adalah "PantauBot", Asisten AI Cerdas Pendidik & Pengawas Sekolah Resmi pada platform PantauSekolah.
Identitas Pengguna yang sedang berbicara dengan Anda:
- Nama: ${nama}
- Peran: ${role}
- Asal Sekolah / Instansi: ${sekolah || "Dinas Pendidikan"}

${appDataSummary}

PANDUAN & ATURAN RESPON:
1. Bersikaplah profesional, edukatif, santun, solutif, dan menguasai regulasi pendidikan di Indonesia (Kurikulum Merdeka, Standar Nasional Pendidikan, Permendikbudristek No. 12/2024 tentang Kurikulum pada PAUD, Dikdas, dan Dikmen, Perdirjen GTK tentang Pengelolaan Kinerja Guru & Kepala Sekolah di PMM, serta pengelolaan BOS/BOSP/RKAS).
2. Jika pengguna meminta bantuan pembuatan naskah (seperti Modul Ajar, RPP, kisi-kisi soal asesmen, draf surat tugas, sambutan rapat, atau rekomendasi tindak lanjut hasil supervisi), berikan draf yang lengkap, terstruktur rapi, siap pakai, dan berkualitas tinggi.
3. Gunakan pemformatan Markdown yang bersih dan mudah dibaca: gunakan **tebal** untuk poin penting, gunakan daftar berbutir (-) atau bernomor (1, 2, 3), dan beri jarak baris yang nyaman dibaca.
4. Jangan ragu berinisiatif memberikan tips tambahan yang bermanfaat bagi peningkatan mutu pendidikan di sekolah pengguna. Jawab selalu dalam Bahasa Indonesia yang baik dan formal-santun.`;
    },

    /**
     * Dapatkan daftar rekomendasi pertanyaan cepat sesuai peran aktif
     */
    getQuickPromptsForRole() {
        const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
        const role = currentUser ? (currentUser.role || "") : "";

        if (role === "Pengawas") {
            return [
                { icon: "fa-chart-pie", text: "Analisis kepatuhan sekolah binaan saya" },
                { icon: "fa-file-signature", text: "Buatkan draf surat tugas monitoring supervisi" },
                { icon: "fa-lightbulb", text: "Rekomendasi tindak lanjut sekolah kepatuhan rendah" },
                { icon: "fa-clipboard-check", text: "Format instrumen supervisi klinis guru" }
            ];
        } else if (role === "Kepala Sekolah" || role === "Kepsek") {
            return [
                { icon: "fa-folder-tree", text: "Cek kelengkapan dokumen wajib guru semester ini" },
                { icon: "fa-money-bill-wave", text: "Panduan alokasi RKAS BOS berbasis Rapor Pendidikan" },
                { icon: "fa-microphone", text: "Buatkan draf sambutan rapat evaluasi guru" },
                { icon: "fa-people-group", text: "Strategi pembinaan guru yang belum mencapai target" }
            ];
        } else {
            // Guru (default)
            return [
                { icon: "fa-book-open", text: "Bantu susun Modul Ajar Kurikulum Merdeka" },
                { icon: "fa-screwdriver-wrench", text: "Panduan perbaikan berkas yang ditolak pengawas" },
                { icon: "fa-pen-to-square", text: "Buatkan 5 soal AKM Literasi lengkap dengan rubrik" },
                { icon: "fa-puzzle-piece", text: "Ide asesmen formatif yang menyenangkan di kelas" }
            ];
        }
    },

    /**
     * Render daftar pill pertanyaan cepat
     */
    renderQuickPrompts() {
        const container = document.getElementById("ai-quick-prompts-container");
        if (!container) return;

        // Tampilkan hanya jika riwayat pesan kosong atau hanya ada 1 pesan sambutan
        if (this.messages.length > 2) {
            container.innerHTML = "";
            container.classList.add("hidden");
            return;
        }

        container.classList.remove("hidden");
        const prompts = this.getQuickPromptsForRole();
        let html = `
            <div class="px-3 pt-2 pb-1">
                <p class="text-[11px] font-semibold text-slate-400 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                    <i class="fa-solid fa-bolt-lightning text-amber-500"></i> Pertanyaan Cepat Sekali Klik:
                </p>
                <div class="flex flex-wrap gap-1.5">
        `;

        prompts.forEach((p, idx) => {
            html += `
                <button type="button" onclick="AIAssistant.sendQuickPrompt('${encodeURIComponent(p.text)}')"
                    class="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-slate-700 border border-indigo-200/60 dark:border-slate-700 transition-colors flex items-center gap-1.5 text-left">
                    <i class="fa-solid ${p.icon} text-[10px] text-indigo-500"></i>
                    <span>${p.text}</span>
                </button>
            `;
        });

        html += `
                </div>
            </div>
        `;
        container.innerHTML = html;
    },

    /**
     * Kirim prompt cepat dari pill
     */
    sendQuickPrompt(encodedText) {
        const text = decodeURIComponent(encodedText);
        const input = document.getElementById("ai-chat-input");
        if (input) {
            input.value = text;
            this.handleSend();
        }
    },

    /**
     * Render daftar pesan percakapan
     */
    renderMessages() {
        const container = document.getElementById("ai-chat-messages");
        if (!container) return;

        if (this.messages.length === 0) {
            const currentUser = typeof AuthService !== "undefined" ? AuthService.getUser() : null;
            const nama = currentUser ? currentUser.nama : "Bapak/Ibu";
            const role = currentUser ? currentUser.role : "Pendidik";

            container.innerHTML = `
                <div class="p-6 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center h-full">
                    <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-indigo-500/20 mb-3 animate-bounce">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </div>
                    <h4 class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Halo, ${nama}! 👋</h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                        Saya <strong>PantauBot AI</strong>. Siap membantu Anda dalam hal apapun seputar administrasi sekolah, regulasi Kurikulum Merdeka, penyusunan berkas, atau evaluasi data supervisi.
                    </p>
                </div>
            `;
            return;
        }

        let html = "";
        this.messages.forEach((m, idx) => {
            const isUser = m.role === "user";
            const time = m.time || "";

            if (isUser) {
                html += `
                    <div class="flex justify-end mb-3.5 pl-8">
                        <div class="max-w-[85%] bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-3.5 py-2.5 rounded-2xl rounded-tr-sm shadow-sm text-xs leading-relaxed break-words">
                            <p class="whitespace-pre-wrap">${this.escapeHtml(m.content)}</p>
                            ${time ? `<span class="text-[9px] text-indigo-200 block text-right mt-1 opacity-80">${time}</span>` : ""}
                        </div>
                    </div>
                `;
            } else {
                const formattedContent = this.formatMarkdown(m.content);
                html += `
                    <div class="flex items-start gap-2.5 mb-4 pr-6 group">
                        <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5 shadow-sm">
                            <i class="fa-solid fa-robot"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-200/80 dark:border-slate-700/80 shadow-sm text-xs leading-relaxed break-words prose-ai">
                                ${formattedContent}
                            </div>
                            <div class="flex items-center gap-2 mt-1.5 px-1">
                                ${time ? `<span class="text-[9px] text-slate-400">${time}</span>` : ""}
                                <button type="button" onclick="AIAssistant.copyMessage(${idx})" 
                                    class="text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors" title="Salin teks">
                                    <i class="fa-regular fa-copy"></i> Salin
                                </button>
                                ${m.model ? `<span class="text-[9px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-700/50 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">${m.model}</span>` : ""}
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        if (this.isLoading) {
            html += `
                <div class="flex items-start gap-2.5 mb-4 pr-6 animate-pulse">
                    <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                        <i class="fa-solid fa-spinner fa-spin"></i>
                    </div>
                    <div class="bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3.5 py-2.5 rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-700 shadow-sm text-xs flex items-center gap-2">
                        <span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
                        <span>PantauBot sedang menalar & merumuskan jawaban...</span>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        this.scrollToBottom();
    },

    /**
     * Format Markdown sederhana untuk bubble respon AI
     */
    formatMarkdown(text) {
        if (!text) return "";
        let out = this.escapeHtml(text);

        // Code blocks: ```code```
        out = out.replace(/```([\s\S]*?)```/g, '<pre class="bg-slate-900 text-slate-100 p-2.5 rounded-lg my-2 overflow-x-auto font-mono text-[11px]"><code>$1</code></pre>');

        // Inline code: `code`
        out = out.replace(/`([^`]+)`/g, '<code class="bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded text-[11px] font-mono text-indigo-600 dark:text-indigo-300">$1</code>');

        // Bold: **text**
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');

        // Italic: *text*
        out = out.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');

        // Headers: ###, ##, #
        out = out.replace(/^### (.*$)/gim, '<h5 class="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-2 mb-1">$1</h5>');
        out = out.replace(/^## (.*$)/gim, '<h4 class="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-2.5 mb-1.5">$1</h4>');
        out = out.replace(/^# (.*$)/gim, '<h3 class="text-base font-black text-slate-800 dark:text-slate-100 mt-3 mb-2">$1</h3>');

        // Bullet list lines: - item or * item
        out = out.replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ml-4 list-disc text-xs leading-relaxed my-0.5">$1</li>');

        // Numbered list lines: 1. item
        out = out.replace(/^\s*(\d+)\.\s+(.*)$/gim, '<li class="ml-4 list-decimal text-xs leading-relaxed my-0.5"><span class="font-semibold text-indigo-600 dark:text-indigo-400">$1.</span> $2</li>');

        // Line breaks to <br>
        out = out.replace(/\n/g, '<br>');

        return out;
    },

    escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    /**
     * Salin respon pesan ke clipboard
     */
    copyMessage(index) {
        const msg = this.messages[index];
        if (!msg || !msg.content) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(msg.content).then(() => {
                if (typeof App !== "undefined" && typeof App.showToast === "function") {
                    App.showToast("Teks respon berhasil disalin ke clipboard!", "success");
                }
            }).catch(() => {
                this.fallbackCopy(msg.content);
            });
        } else {
            this.fallbackCopy(msg.content);
        }
    },

    fallbackCopy(text) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
            if (typeof App !== "undefined" && typeof App.showToast === "function") {
                App.showToast("Teks respon berhasil disalin!", "success");
            }
        } catch (e) {}
        document.body.removeChild(ta);
    },

    /**
     * Gulir chat ke posisi paling bawah
     */
    scrollToBottom() {
        const container = document.getElementById("ai-chat-messages");
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    },

    /**
     * Event Listener untuk input teks
     */
    bindEvents() {
        const input = document.getElementById("ai-chat-input");
        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            });
        }
    },

    /**
     * Tangani pengiriman pesan dari pengguna
     */
    async handleSend() {
        const input = document.getElementById("ai-chat-input");
        if (!input) return;

        const text = input.value.trim();
        if (!text || this.isLoading) return;

        input.value = "";
        input.style.height = "auto";

        const now = new Date();
        const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

        // 1. Tambahkan pesan user ke thread
        this.messages.push({
            role: "user",
            content: text,
            time: timeStr
        });

        this.isLoading = true;
        this.renderQuickPrompts();
        this.renderMessages();

        try {
            // Ambil API Key & Model
            const apiKey = (localStorage.getItem(this.STORAGE_KEY_KEY) || "").trim();
            const model = (localStorage.getItem(this.STORAGE_KEY_MODEL) || "openai/gpt-oss-120b").trim();

            // Bangun percakapan lengkap untuk API
            const systemPrompt = this.buildSystemPrompt();
            const apiMessages = [
                { role: "system", content: systemPrompt }
            ];

            // Masukkan 8 pesan terakhir agar memiliki memori percakapan
            const recent = this.messages.slice(-8);
            recent.forEach(m => {
                apiMessages.push({
                    role: m.role === "assistant" ? "assistant" : "user",
                    content: m.content
                });
            });

            let replyText = "";
            let usedModel = model;

            // Percobaan 1: Panggil melalui backend Google Apps Script (Code.gs)
            let gasSuccess = false;
            try {
                if (typeof ApiService !== "undefined") {
                    const gasRes = await ApiService.post({
                        action: "ai_chat",
                        messages: apiMessages,
                        apiKey: apiKey,
                        model: model
                    }, 45000);

                    if (gasRes && gasRes.status === "success" && gasRes.reply) {
                        replyText = gasRes.reply;
                        usedModel = gasRes.model || model;
                        gasSuccess = true;
                    } else if (gasRes && gasRes.message && !gasRes.message.includes("tidak dikenali")) {
                        throw new Error(gasRes.message);
                    }
                }
            } catch (errGas) {
                console.warn("GAS AI call failed, beralih ke direct client fetch:", errGas);
                if (errGas && errGas.message && errGas.message.includes("API Key")) {
                    throw errGas;
                }
            }

            // Percobaan 2: Direct Client Fetch jika backend belum di-deploy atau UrlFetch belum diotorisasi
            if (!gasSuccess) {
                if (!apiKey) {
                    throw new Error("API Key belum diatur. Silakan klik ikon ⚙️ Pengaturan di atas dan masukkan API Key Anda (OpenRouter atau Google Gemini API gratis).");
                }

                if (apiKey.startsWith("AIza")) {
                    // Direct Google Gemini API
                    replyText = await this.callGeminiDirect(apiMessages, apiKey, model);
                    usedModel = model.includes("gemini") ? model : "gemini-1.5-flash";
                } else {
                    // Direct OpenRouter API
                    replyText = await this.callOpenRouterDirect(apiMessages, apiKey, model);
                }
            }

            // Simpan respon AI ke thread
            this.messages.push({
                role: "assistant",
                content: replyText,
                model: usedModel,
                time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
            });

            this.saveChatHistory();

        } catch (err) {
            console.error("AI Assistant Error:", err);
            const errMsg = err.message || "Terjadi kesalahan saat menghubungi server AI.";
            this.messages.push({
                role: "assistant",
                content: `⚠️ **Maaf, gagal memproses permintaan:**\n${errMsg}\n\n*Tips: Klik ikon ⚙️ di pojok kanan atas jendela ini untuk memeriksa atau memasukkan API Key.*`,
                time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
            });
        } finally {
            this.isLoading = false;
            this.renderMessages();
            this.renderQuickPrompts();
        }
    },

    /**
     * Direct Fetch ke OpenRouter API (Fallback jika Code.gs belum siap)
     */
    async callOpenRouterDirect(messages, apiKey, model) {
        const url = "https://openrouter.ai/api/v1/chat/completions";
        const payload = {
            model: model || "openai/gpt-oss-120b",
            messages: messages,
            temperature: 0.6
        };

        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + apiKey,
                "HTTP-Referer": window.location.origin || "https://pantausekolah.app",
                "X-Title": "PantauSekolah - AI Assistant"
            },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            const errJson = await resp.json().catch(() => ({}));
            let msg = `HTTP ${resp.status}`;
            if (errJson.error && errJson.error.message) msg = errJson.error.message;
            throw new Error(`OpenRouter API: ${msg}`);
        }

        const data = await resp.json();
        const candidate = data.choices && data.choices[0] && data.choices[0].message;
        if (!candidate || !candidate.content) {
            throw new Error("Respon dari OpenRouter kosong.");
        }
        return candidate.content.trim();
    },

    /**
     * Direct Fetch ke Google Gemini API jika user menggunakan Gemini Key
     */
    async callGeminiDirect(messages, apiKey, model) {
        const cleanModel = (model || "gemini-1.5-flash").replace("google/", "").replace(":free", "").trim();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

        let contents = [];
        let systemInstruction = "";

        messages.forEach(m => {
            if (m.role === "system") {
                systemInstruction += m.content + "\n";
            } else {
                contents.push({
                    role: m.role === "assistant" ? "model" : "user",
                    parts: [{ text: m.content }]
                });
            }
        });

        const payload = { contents: contents };
        if (systemInstruction.trim()) {
            payload.systemInstruction = {
                parts: [{ text: systemInstruction.trim() }]
            };
        }

        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            const errJson = await resp.json().catch(() => ({}));
            let msg = `HTTP ${resp.status}`;
            if (errJson.error && errJson.error.message) msg = errJson.error.message;
            throw new Error(`Google Gemini API: ${msg}`);
        }

        const data = await resp.json();
        const candidate = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0];
        if (!candidate || !candidate.text) {
            throw new Error("Respon dari Google Gemini kosong.");
        }
        return candidate.text.trim();
    }
};

// Pasang event DOMContentLoaded untuk inisialisasi awal
document.addEventListener("DOMContentLoaded", () => {
    if (typeof AIAssistant !== "undefined" && typeof AIAssistant.init === "function") {
        AIAssistant.init();
    }
});
