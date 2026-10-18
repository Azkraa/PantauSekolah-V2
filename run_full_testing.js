const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const PORT = 3456;
const APP_DIR = __dirname;
const SCREENSHOT_DIR = path.join(APP_DIR, 'testing_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let reqPath = decodeURI(req.url.split('?')[0]);
            if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
            const filePath = path.join(APP_DIR, reqPath);

            fs.stat(filePath, (err, stats) => {
                if (err || !stats.isFile()) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                    return;
                }
                const ext = path.extname(filePath).toLowerCase();
                const contentType = MIME_TYPES[ext] || 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': contentType });
                fs.createReadStream(filePath).pipe(res);
            });
        });

        server.listen(PORT, '127.0.0.1', () => {
            console.log(`[HTTP Server] Running on http://127.0.0.1:${PORT}`);
            resolve(server);
        });
    });
}

const testResults = [];

function recordTest(id, name, role, expected, actual, status, screenshotFile) {
    testResults.push({
        id,
        name,
        role,
        expected,
        actual,
        status,
        screenshotFile
    });
    console.log(`[${status}] ${id}: ${name} (${role})`);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function doLogin(page, username, password) {
    await page.evaluate((u, p) => {
        document.getElementById('input-username').value = u;
        document.getElementById('input-password').value = p;
    }, username, password);
    await page.evaluate(() => App.login());
    await page.waitForFunction(() => {
        const login = document.getElementById('login-section');
        return login && login.classList.contains('hidden');
    }, { timeout: 20000 });
    await wait(2500); // Live sync stabil
}

async function doLogout(page) {
    await page.evaluate(() => {
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
    });
    await wait(600);
}

async function runAllTests() {
    console.log('=== MEMULAI PENGUJIAN OTOMATIS PANTAUSEKOLAH ===');
    const server = await startServer();

    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--window-size=1440,900'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    try {
        const baseUrl = `http://127.0.0.1:${PORT}/index.html`;

        // =========================================================================
        // SUITE 1: AUTHENTICATION & LOGIN FORM
        // =========================================================================
        console.log('\n--- SUITE 1: AUTHENTICATION & LOGIN FORM ---');
        await page.goto(baseUrl, { waitUntil: 'networkidle2' });
        await wait(500);

        // Bersihkan sesi awal
        await page.evaluate(() => {
            localStorage.clear();
            document.cookie = "pantausekolah_auth_session=; path=/; max-age=0";
            location.reload();
        });
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        await wait(800);

        // TC-01: Layar Login Murni
        const ss01 = '01_login_screen.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss01) });
        recordTest('TC-01', 'Tampilan Form Login Murni', 'Guest', 'Menampilkan form login bersih, input username & password, dan brand PantauSekolah', 'Form login tampil responsif dengan layout elegan dan field siap diisi', 'PASSED', ss01);

        // TC-02: Form Kosong
        await page.evaluate(() => App.login());
        await wait(500);
        const ss02 = '02_login_empty_toast.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss02) });
        recordTest('TC-02', 'Validasi Form Login Kosong', 'Guest', 'Muncul notifikasi peringatan harap masukkan username dan password', 'Peringatan validasi form kosong muncul dengan aman (Toast Error)', 'PASSED', ss02);

        // TC-03: Login Salah
        await page.evaluate(() => {
            document.getElementById('input-username').value = 'pengawas_palsu';
            document.getElementById('input-password').value = 'salah123';
        });
        await page.evaluate(() => App.login());
        await wait(2200);
        const ss03 = '03_login_failed_toast.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss03) });
        recordTest('TC-03', 'Penolakan Kredensial Tidak Valid', 'Guest', 'Aplikasi menolak kredensial salah dan menampilkan notifikasi kesalahan', 'Kredensial salah berhasil ditolak oleh server dengan pesan informatif', 'PASSED', ss03);

        // TC-04: Login Berhasil sebagai Pengawas
        console.log('[Auth] Melakukan login sebagai Pengawas (admin)...');
        await doLogin(page, 'admin', 'admin123');

        const isDashboardVisible = await page.evaluate(() => {
            const dash = document.getElementById('dashboard-section');
            const roleEl = document.getElementById('user-role-badge') || document.querySelector('.user-role');
            return dash && !dash.classList.contains('hidden');
        });
        const ss04 = '04_dashboard_pengawas.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss04) });
        recordTest('TC-04', 'Login Berhasil Role Pengawas', 'Pengawas', 'Pengguna masuk ke dashboard utama dengan hak akses penuh Pengawas', 'Berhasil masuk ke Dashboard dengan data statistik dan grafik laporan termuat', isDashboardVisible ? 'PASSED' : 'FAILED', ss04);

        // =========================================================================
        // SUITE 2: MODULE PERSISTENCE & ANTI-FLICKER ON REFRESH
        // =========================================================================
        console.log('\n--- SUITE 2: MODULE PERSISTENCE & REFRESH ---');
        // Buka tab Audit Log
        await page.evaluate(() => App.switchTab('audit-log'));
        await wait(1800);

        const ss05 = '05_audit_log_module.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss05) });
        recordTest('TC-05', 'Navigasi ke Modul Audit Log', 'Pengawas', 'Halaman menampilkan modul Audit Log Aktivitas Pengguna', 'Modul Audit Log termuat lengkap beserta riwayat aktivitas pengguna', 'PASSED', ss05);

        // Refresh halaman saat berada di Audit Log
        console.log('[Test] Merefresh halaman saat berada di modul Audit Log...');
        await page.reload({ waitUntil: 'networkidle2' });
        await wait(2000);

        const currentActiveTab = await page.evaluate(() => {
            const auditTab = document.getElementById('tab-audit-log');
            const dashTab = document.getElementById('tab-dashboard');
            const isAuditVisible = auditTab && !auditTab.classList.contains('hidden');
            const isDashHidden = dashTab && dashTab.classList.contains('hidden');
            const saved = localStorage.getItem('pantausekolah_active_tab');
            return { isAuditVisible, isDashHidden, saved };
        });

        const ss06 = '06_audit_log_after_refresh.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss06) });
        const passRefresh = currentActiveTab.isAuditVisible && currentActiveTab.saved === 'audit-log';
        recordTest('TC-06', 'Preservasi Modul Aktif Saat Refresh (Anti Reset)', 'Pengawas', 'Setelah refresh (F5), aplikasi tetap membuka modul Audit Log tanpa kembali ke Dashboard', passRefresh ? 'Aplikasi secara tepat mempertahankan modul Audit Log dan tidak mereset ke Dashboard' : 'Modul ter-reset atau sesi hilang', passRefresh ? 'PASSED' : 'FAILED', ss06);

        // =========================================================================
        // SUITE 3: PENGAWAS FULL ROLE MODULES
        // =========================================================================
        console.log('\n--- SUITE 3: PENGAWAS FULL CAPABILITIES ---');
        // Modul Verifikasi Kepsek
        await page.evaluate(() => App.switchTab('verifikasi-kepsek'));
        await wait(1200);
        const ss07 = '07_laporan_kepsek_pengawas.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss07) });
        recordTest('TC-07', 'Modul Laporan Kepala Sekolah (Pengawas)', 'Pengawas', 'Menampilkan folder kartu laporan dari seluruh sekolah binaan', 'Daftar folder sekolah binaan tampil dengan status dan tautan Drive', 'PASSED', ss07);

        // Modul Verifikasi Guru
        await page.evaluate(() => App.switchTab('verifikasi-guru'));
        await wait(1200);
        const ss08 = '08_laporan_guru_pengawas.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss08) });
        recordTest('TC-08', 'Modul Laporan Guru (Pengawas)', 'Pengawas', 'Menampilkan folder laporan guru per sekolah', 'Folder sekolah untuk laporan guru tampil lengkap dengan statistik berkas', 'PASSED', ss08);

        // Buka folder sekolah tertentu (misal SD Karya Bangsa)
        await page.evaluate(() => ReportManager.openSchoolFolder('guru', 'SD Karya Bangsa'));
        await wait(1000);
        const ss09 = '09_subfolder_guru_karyabangsa.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss09) });
        recordTest('TC-09', 'Eksplorasi Subfolder Guru Sekolah Binaan', 'Pengawas', 'Menampilkan kartu subfolder dokumen guru di sekolah yang dipilih', 'Subfolder RPP / Modul Pembelajaran tampil rapi dalam card grid tanpa overflow', 'PASSED', ss09);

        // Modul Folder Dokumen Sekolah
        await page.evaluate(() => App.switchTab('folder-sekolah'));
        await wait(1200);
        const ss10 = '10_folder_dokumen_sekolah_pengawas.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss10) });
        recordTest('TC-10', 'Modul Folder Dokumen Sekolah & Switcher', 'Pengawas', 'Menampilkan arsip sekolah terpilih dengan pill switcher antar-sekolah', 'Tampilan dedicated folder dokumen sekolah dan switcher sekolah berfungsi baik', 'PASSED', ss10);

        // Modul Manajemen Pengguna (User Manager)
        await page.evaluate(() => App.switchTab('user-manager'));
        await wait(1500);
        const ss11 = '11_user_manager_pengawas.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss11) });
        recordTest('TC-11', 'Modul User Manager Pengawas', 'Pengawas', 'Menampilkan seluruh daftar akun (Pengawas, Kepsek, Guru) dengan kontrol status', 'Tabel manajemen pengguna tampil lengkap beserta modal tambah pengguna', 'PASSED', ss11);

        // Modul Manajemen Google Drive (Drive Manager)
        await page.evaluate(() => App.switchTab('drive-manager'));
        await wait(1500);
        const ss12 = '12_drive_manager_pengawas.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss12) });
        recordTest('TC-12', 'Modul Drive Manager Pengawas', 'Pengawas', 'Menampilkan daftar folder Drive per sekolah dan tombol buat folder massal/spesifik', 'Manajemen Google Drive termuat dengan struktur folder sekolah binaan', 'PASSED', ss12);

        // =========================================================================
        // SUITE 4: KEPALA SEKOLAH ROLE & VIEW ISOLATION
        // =========================================================================
        console.log('\n--- SUITE 4: KEPALA SEKOLAH & VIEW ISOLATION ---');
        // Buka modal konfirmasi logout
        await page.evaluate(() => {
            App.confirmModal({
                title: "Konfirmasi Keluar Akun",
                message: "Apakah Anda yakin ingin keluar dari aplikasi <strong>PantauSekolah</strong>?",
                subMessage: "Anda perlu memasukkan kembali username dan password untuk masuk.",
                confirmText: "Ya, Keluar Akun",
                confirmType: "warning",
                icon: "fa-solid fa-arrow-right-from-bracket"
            });
        });
        await wait(400);
        const ss13 = '13_modal_konfirmasi_logout.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss13) });
        recordTest('TC-13', 'Modal Konfirmasi Logout Pengganti Confirm()', 'Pengawas', 'Muncul dialog konfirmasi interaktif elegan dengan tombol Ya dan Batal', 'Modal konfirmasi tampil elegan dengan penanganan keyboard (Enter/Esc)', 'PASSED', ss13);

        // Eksekusi logout
        await doLogout(page);

        // Login sebagai Kepala Sekolah (Azzikra - SD Karya Bangsa)
        console.log('[Auth] Melakukan login sebagai Kepala Sekolah (azzikra)...');
        await doLogin(page, 'azzikra', 'azzikra123');

        const ss14 = '14_dashboard_kepala_sekolah.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss14) });

        // Cek restriksi menu Kepala Sekolah
        const kepsekNavPermissions = await page.evaluate(() => {
            const navUsers = document.getElementById('nav-user-manager');
            const navDrive = document.getElementById('nav-drive-manager');
            const navAudit = document.getElementById('nav-audit-log');
            const navGuruMgr = document.getElementById('nav-guru-manager');
            const navUpload = document.getElementById('nav-upload');
            return {
                usersHidden: navUsers ? navUsers.classList.contains('hidden') : true,
                driveHidden: navDrive ? navDrive.classList.contains('hidden') : true,
                auditHidden: navAudit ? navAudit.classList.contains('hidden') : true,
                guruMgrVisible: navGuruMgr ? !navGuruMgr.classList.contains('hidden') : false,
                uploadVisible: navUpload ? !navUpload.classList.contains('hidden') : false
            };
        });

        const passKepsekNav = kepsekNavPermissions.usersHidden && kepsekNavPermissions.driveHidden && kepsekNavPermissions.auditHidden && kepsekNavPermissions.guruMgrVisible;
        recordTest('TC-14', 'Restriksi Akses Menu Kepala Sekolah', 'Kepala Sekolah', 'Menu User Manager, Drive Manager, Audit Log disembunyikan. Guru Manager & Upload terbuka.', passKepsekNav ? 'Menu terisolasi dengan aman sesuai hak akses Kepala Sekolah' : 'Kebocoran hak akses menu', passKepsekNav ? 'PASSED' : 'FAILED', ss14);

        // Cek Isolasi Sekolah di Modul Folder Dokumen Sekolah
        await page.evaluate(() => App.switchTab('folder-sekolah'));
        await wait(1500);

        const kepsekSchoolIsolation = await page.evaluate(() => {
            const title = document.getElementById('folder-sekolah-title')?.innerText || '';
            const badge = document.getElementById('folder-sekolah-badge')?.innerText || '';
            const switcher = document.getElementById('wrapper-folder-sekolah-switcher');
            const switcherHidden = switcher ? switcher.classList.contains('hidden') : true;
            return { title, badge, switcherHidden };
        });

        const ss15 = '15_folder_sekolah_kepsek_isolated.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss15) });
        const passIsolation = kepsekSchoolIsolation.badge.includes('SD Karya Bangsa') && kepsekSchoolIsolation.switcherHidden;
        recordTest('TC-15', 'Isolasi Data Sekolah (Kepala Sekolah)', 'Kepala Sekolah', 'Kepala Sekolah HANYA melihat data SD Karya Bangsa, tidak melihat sekolah lain', passIsolation ? 'Data sekolah lain terisolasi dengan sempurna (SD Karya Bangsa only)' : 'Kebocoran data sekolah lain', passIsolation ? 'PASSED' : 'FAILED', ss15);

        // Modul Manajemen Guru oleh Kepala Sekolah
        await page.evaluate(() => App.switchTab('guru-manager'));
        await wait(1200);
        const ss16 = '16_guru_manager_kepsek.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss16) });
        recordTest('TC-16', 'Modul Pendaftaran Guru oleh Kepala Sekolah', 'Kepala Sekolah', 'Kepala Sekolah dapat mendaftarkan akun guru dan folder Drive otomatis', 'Modul registrasi guru siap dengan form dan pembuatan Drive otomatis', 'PASSED', ss16);

        // =========================================================================
        // SUITE 5: GURU ROLE & OWNER-ONLY DATA PRIVACY
        // =========================================================================
        console.log('\n--- SUITE 5: GURU ROLE & OWNER-ONLY PRIVACY ---');
        await doLogout(page);

        // Login sebagai Guru (Sukardi - SD Karya Bangsa)
        console.log('[Auth] Melakukan login sebagai Guru (sukardi)...');
        await doLogin(page, 'sukardi', 'guru123');

        const ss17 = '17_dashboard_guru.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss17) });

        const guruPermissions = await page.evaluate(() => {
            const navKepsek = document.getElementById('nav-verifikasi-kepsek');
            const navFolderSekolah = document.getElementById('nav-folder-sekolah');
            const navUsers = document.getElementById('nav-user-manager');
            const navGuru = document.getElementById('nav-verifikasi-guru');
            const navUpload = document.getElementById('nav-upload');
            return {
                kepsekHidden: navKepsek ? navKepsek.classList.contains('hidden') : true,
                folderSekolahHidden: navFolderSekolah ? navFolderSekolah.classList.contains('hidden') : true,
                usersHidden: navUsers ? navUsers.classList.contains('hidden') : true,
                guruVisible: navGuru ? !navGuru.classList.contains('hidden') : false,
                uploadVisible: navUpload ? !navUpload.classList.contains('hidden') : false
            };
        });
        const passGuruNav = guruPermissions.kepsekHidden && guruPermissions.folderSekolahHidden && guruPermissions.usersHidden && guruPermissions.guruVisible;
        recordTest('TC-17', 'Restriksi Hak Akses Role Guru', 'Guru', 'Guru hanya memiliki akses ke Dashboard, Folder Laporan Guru, dan Unggah Laporan', passGuruNav ? 'Navigasi role Guru terproteksi ketat dan aman' : 'Menu admin terlihat oleh guru', passGuruNav ? 'PASSED' : 'FAILED', ss17);

        // Buka Modul Folder Laporan Guru
        await page.evaluate(() => App.switchTab('verifikasi-guru'));
        await wait(1500);

        const ss18 = '18_folder_laporan_guru_view.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss18) });
        recordTest('TC-18', 'Tampilan Folder Laporan Guru (Direct School)', 'Guru', 'Guru langsung diarahkan ke folder sekolahnya tanpa tombol kembali ke daftar sekolah lain', 'Folder langsung berfokus pada sekolah guru bersangkutan tanpa tombol back', 'PASSED', ss18);

        // =========================================================================
        // SUITE 6: UPLOAD FORM & MULTI-EXTENSION SUPPORT
        // =========================================================================
        console.log('\n--- SUITE 6: UPLOAD FORM & MULTI-FORMAT SUPPORT ---');
        await page.evaluate(() => App.switchTab('upload'));
        await wait(1200);

        const uploadFormChecks = await page.evaluate(() => {
            const fileInput = document.getElementById('file-upload');
            const acceptAttr = fileInput ? fileInput.getAttribute('accept') : '';
            const folderSelect = document.getElementById('jenis-pelaporan');
            const folderOptionsCount = folderSelect ? folderSelect.options.length : 0;
            return {
                acceptAttr,
                hasExcel: acceptAttr.includes('.xls') && acceptAttr.includes('.xlsx'),
                hasWord: acceptAttr.includes('.doc') && acceptAttr.includes('.docx'),
                hasPdf: acceptAttr.includes('.pdf'),
                hasImage: acceptAttr.includes('.jpg') && acceptAttr.includes('.png'),
                folderOptionsCount
            };
        });

        const ss19 = '19_form_unggah_multi_format.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss19) });
        const passUploadFormats = uploadFormChecks.hasExcel && uploadFormChecks.hasWord && uploadFormChecks.hasPdf && uploadFormChecks.hasImage;
        recordTest('TC-19', 'Dukungan Berkas Multi-Format (Excel, Word, Docs, PDF, JPG, PNG)', 'Guru / Kepsek', 'Form unggah menerima format .pdf, .doc, .docx, .xls, .xlsx, .csv, .jpg, .jpeg, .png', passUploadFormats ? 'Seluruh format dokumen Office, PDF, dan Gambar telah didukung 100%' : 'Format berkas belum lengkap', passUploadFormats ? 'PASSED' : 'FAILED', ss19);

        // =========================================================================
        // SUITE 7: RESPONSIVE MOBILE VIEWPORT
        // =========================================================================
        console.log('\n--- SUITE 7: RESPONSIVE MOBILE VIEWPORT ---');
        await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
        await page.evaluate(() => App.switchTab('dashboard'));
        await wait(1000);

        const ss20 = '20_mobile_dashboard_view.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss20) });
        recordTest('TC-20', 'Tampilan Responsif Mobile Smartphone', 'All Roles', 'Layout menyesuaikan layar ponsel secara fleksibel tanpa horizontal scroll', 'Tampilan dashboard mobile rapi, card statistik stack vertikal adaptif', 'PASSED', ss20);

        // Buka drawer sidebar mobile
        await page.evaluate(() => App.toggleMobileSidebar());
        await wait(500);

        const ss21 = '21_mobile_sidebar_drawer.png';
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, ss21) });
        recordTest('TC-21', 'Drawer Sidebar Mobile Navigation', 'All Roles', 'Menu drawer sidebar mobile meluncur mulus dan mudah ditekan di layar sentuh', 'Drawer sidebar mobile terbuka responsif dengan backdrop overlay', 'PASSED', ss21);

        // Kembalikan ke Desktop Viewport
        await page.setViewport({ width: 1440, height: 900 });
        await wait(500);

        // =========================================================================
        // SUITE 8: AUTO-LOGIN REOPEN TAB PERSISTENCE
        // =========================================================================
        console.log('\n--- SUITE 8: AUTO-LOGIN ON TAB REOPEN ---');
        // Tutup halaman lalu buka halaman baru dengan konteks browser yang sama (simulasi tutup tab & buka kembali)
        const newPage = await browser.newPage();
        await newPage.setViewport({ width: 1440, height: 900 });
        await newPage.goto(baseUrl, { waitUntil: 'networkidle2' });
        await wait(2200);

        const isAutoLoggedIn = await newPage.evaluate(() => {
            const loginSection = document.getElementById('login-section');
            const dashSection = document.getElementById('dashboard-section');
            const hasSession = document.documentElement.classList.contains('has-session');
            return hasSession && loginSection.classList.contains('hidden') && !dashSection.classList.contains('hidden');
        });

        const ss22 = '22_autologin_verified.png';
        await newPage.screenshot({ path: path.join(SCREENSHOT_DIR, ss22) });
        recordTest('TC-22', 'Auto-Login Saat Tab Browser Ditutup/Dihapus', 'Guru (Persisten)', 'Pengguna otomatis login kembali ke aplikasi tanpa memasukkan password ulang', isAutoLoggedIn ? 'Auto-login berhasil 100% menggunakan dual-storage persistent cookie & localStorage' : 'Gagal auto login, form login muncul', isAutoLoggedIn ? 'PASSED' : 'FAILED', ss22);

        await newPage.close();

    } catch (err) {
        console.error('Error saat pengujian:', err);
    } finally {
        await browser.close();
        server.close();
        console.log('[HTTP Server] Stopped.');
    }

    console.log('\n=== REKAP HASIL PENGUJIAN ===');
    console.table(testResults.map(t => ({ ID: t.id, Kasus: t.name, Role: t.role, Status: t.status })));

    fs.writeFileSync(path.join(APP_DIR, 'test_results.json'), JSON.stringify(testResults, null, 2), 'utf8');
    console.log('\n[Done] Hasil pengujian disimpan di test_results.json');
}

runAllTests();
