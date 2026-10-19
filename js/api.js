/**
 * ==========================================================================
 * PantauSekolah - API Service
 * ==========================================================================
 */

const ApiService = {
    /**
     * Kirim POST Request ke Google Apps Script Web App
     */
    async post(payload, customTimeoutMs) {
        // Otomatis sertakan konteks pengguna aktif untuk audit log backend
        if (typeof AuthService !== "undefined" && typeof AuthService.getUser === "function") {
            const currentUser = AuthService.getUser();
            if (currentUser) {
                if (!payload.currentUserName) payload.currentUserName = currentUser.nama;
                if (!payload.currentUserUsername) payload.currentUserUsername = currentUser.username;
                if (!payload.currentUserRole) payload.currentUserRole = currentUser.role;
                if (!payload.currentUserSchool) payload.currentUserSchool = currentUser.asal_sekolah;
            }
        }

        const effectiveTimeout = customTimeoutMs || (payload && payload._timeoutMs) || CONFIG.REQUEST_TIMEOUT_MS;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

        const targetUrl = (typeof CONFIG !== "undefined" && CONFIG.API_URL) ? CONFIG.API_URL.trim() : "";
        if (!targetUrl) {
            clearTimeout(timeoutId);
            throw new Error("Konfigurasi API_URL belum diatur di js/config.js.");
        }

        try {
            const response = await fetch(targetUrl, {
                method: "POST",
                credentials: "omit", // Hindari redirect multi-login Google Account yang memicu 404
                redirect: "follow",
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Server API tidak ditemukan (HTTP 404). Pastikan Web App Google Apps Script telah di-deploy dengan akses 'Anyone' dan URL di js/config.js berakhiran '/exec'.`);
                }
                throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === "AbortError") {
                throw new Error("Permintaan ke server melebihi batas waktu (Timeout). Berkas sedang diproses di latar belakang.");
            }
            console.error(`API Request Error [Action: ${payload?.action || 'unknown'}, URL: ${targetUrl}]:`, error);
            throw error;
        }
    }
};
