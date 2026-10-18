/**
 * ==========================================================================
 * PantauSekolah - Configuration Constants
 * ==========================================================================
 */

const CONFIG = {
    // URL Google Apps Script Web App
    // (Ganti dengan URL hasil deployment Anda dari panduan backend_gas/PANDUAN_SETUP_GAS.md)
    API_URL: "https://script.google.com/macros/s/AKfycbxbMtHzQMdF0UjXfgWiYquaL40HUZD7RWy1irHGPe6BIti49PfpPMjgXOvEniJZZV2N/exec",

    // Kunci Penyimpanan Sesi di LocalStorage
    SESSION_STORAGE_KEY: "pantausekolah_auth_session",

    // Default Timeout untuk Request (milidetik)
    REQUEST_TIMEOUT_MS: 30000,

    // Timeout khusus untuk Upload Dokumen (milidetik) - 120 detik agar aman untuk Google Drive & Sheets
    UPLOAD_TIMEOUT_MS: 120000
};
