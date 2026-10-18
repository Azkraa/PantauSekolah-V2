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

        try {
            const response = await fetch(CONFIG.API_URL, {
                method: "POST",
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === "AbortError") {
                throw new Error("Permintaan ke server melebihi batas waktu (Timeout). Berkas sedang diproses di latar belakang.");
            }
            console.error("API Request Error:", error);
            throw error;
        }
    }
};
