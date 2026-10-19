/**
 * =============================================================================
 * PANTAUSEKOLAH - BACKEND GOOGLE APPS SCRIPT (Code.gs)
 * =============================================================================
 * Fitur:
 * 1. Autentikasi dengan Hashing SHA-256 + Unique Salt per pengguna.
 * 2. User Manager: Pengawas (Admin) mengelola semua user; Kepsek mengelola Guru.
 * 3. Otomatisasi Google Drive:
 *    - Otomatis membuat Folder Utama PantauSekolah.
 *    - Otomatis membuat Folder Sekolah saat sekolah/kepsek didaftarkan.
 *    - Otomatis membuat Subfolder Guru saat guru didaftarkan.
 *    - Pengawas dapat membuat folder baru ke 1 sekolah atau SEMUA sekolah sekaligus.
 * 4. Verifikasi Laporan & Upload Dokumen ke Google Drive.
 * =============================================================================
 */

// NAMA FOLDER ROOT DI GOOGLE DRIVE (akan otomatis dibuat jika belum ada)
const ROOT_FOLDER_NAME = "PantauSekolah_Drive_Storage";

// NAMA-NAMA SHEET DATABASE
const SHEET_USERS = "Users";
const SHEET_SEKOLAH = "Sekolah";
const SHEET_FOLDER_DRIVE = "Folder_Drive";
const SHEET_LAPORAN_KEPSEK = "Laporan_Kepsek";
const SHEET_LAPORAN_GURU = "Laporan_Guru";
const SHEET_AUDIT_LOG = "Audit_Log";

/**
 * Handle POST Request dari Web Application
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: "error", message: "Data payload tidak ditemukan." });
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // Pastikan seluruh sheet dan folder root telah terinisialisasi
    initDatabase();

    switch (action) {
      case "login":
        return handleLogin(data);

      case "get_dashboard_data":
        return handleGetDashboardData(data);

      case "get_users":
        return handleGetUsers(data);

      case "create_user":
        return handleCreateUser(data);

      case "delete_user":
        return handleDeleteUser(data);

      case "get_schools":
        return handleGetSchools();

      case "create_drive_folder":
        return handleCreateDriveFolder(data);

      case "get_drive_folders":
        return handleGetDriveFolders(data);

      case "delete_drive_folder":
        return handleDeleteDriveFolder(data);

      case "verifikasi_laporan":
        return handleVerifikasiLaporan(data);

      case "delete_laporan":
        return handleDeleteLaporan(data);

      case "upload":
        return handleUploadFile(data);

      case "sync_all":
        return handleSyncAll(data);

      case "reset_password":
        return handleResetPassword(data);

      case "delete_default_folder":
        return handleDeleteDefaultFolder(data);

      case "get_audit_logs":
        return handleGetAuditLogs(data);

      case "clear_audit_logs":
        return handleClearAuditLogs(data);

      case "record_log":
        return handleRecordClientLog(data);

      default:
        return jsonResponse({ status: "error", message: "Aksi '" + action + "' tidak dikenali." });
    }
  } catch (err) {
    return jsonResponse({ status: "error", message: "Internal Server Error: " + err.toString() });
  }
}

/**
 * Handle GET Request (Bisa untuk uji coba koneksi)
 */
function doGet(e) {
  return jsonResponse({
    status: "success",
    message: "PantauSekolah API Backend is running.",
    timestamp: new Date().toISOString()
  });
}

// =============================================================================
// 1. DATABASE & GOOGLE DRIVE INITIALIZER
// =============================================================================

function initDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Sheet Users: ID, Username, PasswordHash, Salt, Nama, Role, AsalSekolah, Status, DriveFolderId, DriveFolderUrl, CreatedAt
  ensureSheet(ss, SHEET_USERS, [
    "ID", "Username", "PasswordHash", "Salt", "Nama", "Role", "AsalSekolah", "Status", "DriveFolderId", "DriveFolderUrl", "CreatedAt"
  ]);

  // Default Admin (Pengawas) jika sheet masih kosong
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  if (sheetUsers.getLastRow() <= 1) {
    const salt = generateSalt(8);
    const hash = hashPassword("admin123", salt);
    sheetUsers.appendRow([
      "USR-001", "admin", hash, salt, "Pengawas Utama", "Pengawas", "Dinas Pendidikan", "Aktif", "", "", new Date()
    ]);
  }

  // 2. Sheet Sekolah: ID, NamaSekolah, DriveFolderId, DriveFolderUrl, CreatedAt
  ensureSheet(ss, SHEET_SEKOLAH, [
    "ID", "NamaSekolah", "DriveFolderId", "DriveFolderUrl", "CreatedAt"
  ]);

  // 3. Sheet Folder_Drive: ID, NamaFolder, NamaSekolah, TargetType, DriveFolderId, DriveFolderUrl, CreatedAt
  ensureSheet(ss, SHEET_FOLDER_DRIVE, [
    "ID", "NamaFolder", "NamaSekolah", "TargetType", "DriveFolderId", "DriveFolderUrl", "CreatedAt", "SubCategory"
  ]);

  // 4. Sheet Laporan Kepsek & Guru
  ensureSheet(ss, SHEET_LAPORAN_KEPSEK, [
    "ID", "Tanggal", "Nama", "Kategori", "FileUrl", "Status", "Catatan", "AsalSekolah", "JenisPelaporan", "NamaFile", "PoinPenting"
  ]);
  ensureSheet(ss, SHEET_LAPORAN_GURU, [
    "ID", "Tanggal", "Nama", "Kategori", "FileUrl", "Status", "Catatan", "AsalSekolah", "JenisPelaporan", "NamaFile", "PoinPenting"
  ]);

  // 5. Sheet Audit Log (Rekam Jejak Aktivitas Pengguna untuk Pengawas)
  ensureSheet(ss, SHEET_AUDIT_LOG, [
    "ID", "Timestamp", "Nama", "Username", "Role", "AsalSekolah", "Aksi", "Keterangan", "Detail"
  ]);
}

function ensureSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f1f5f9");
  } else {
    // Migrasi otomatis: jika kolom spreadsheet lama lebih sedikit dari headers terbaru
    try {
      const lastCol = sheet.getLastColumn();
      if (lastCol < headers.length) {
        for (let c = lastCol; c < headers.length; c++) {
          sheet.getRange(1, c + 1).setValue(headers[c]).setFontWeight("bold").setBackground("#f1f5f9");
        }
      }
    } catch (e) {
      Logger.log("Info migrasi kolom sheet " + sheetName + ": " + e.toString());
    }
  }
}

/**
 * Mencatat Aktivitas Pengguna ke Sheet Audit_Log
 */
function recordAuditLog(nama, username, role, asalSekolah, aksi, keterangan, detail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_AUDIT_LOG);
    if (!sheet) {
      ensureSheet(ss, SHEET_AUDIT_LOG, [
        "ID", "Timestamp", "Nama", "Username", "Role", "AsalSekolah", "Aksi", "Keterangan", "Detail"
      ]);
      sheet = ss.getSheetByName(SHEET_AUDIT_LOG);
    }
    const logId = "LOG-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(100 + Math.random() * 900);
    const timestampStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([
      logId,
      timestampStr,
      nama || "-",
      username ? (username.startsWith("@") ? username : "@" + username) : "-",
      role || "-",
      asalSekolah || "-",
      aksi || "Aktivitas",
      keterangan || "-",
      detail || "-"
    ]);
  } catch (err) {
    Logger.log("Gagal mencatat audit log: " + err.toString());
  }
}

/**
 * Mengambil Daftar Audit Log dari Database
 */
function getAuditLogsList(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_AUDIT_LOG);
  if (!sheet) return [];

  const raw = sheet.getDataRange().getValues();
  let logs = [];
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (row[0]) {
      logs.push({
        id: row[0],
        timestamp: row[1] ? (row[1] instanceof Date ? Utilities.formatDate(row[1], "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss") : row[1].toString()) : "-",
        nama: row[2] || "-",
        username: row[3] || "-",
        role: row[4] || "-",
        asalSekolah: row[5] || "-",
        aksi: row[6] || "-",
        keterangan: row[7] || "-",
        detail: row[8] || "-"
      });
    }
  }

  // Urutkan paling baru di atas
  logs.reverse();

  // Batasi 500 log terakhir untuk performa optimal
  if (logs.length > 500) {
    logs = logs.slice(0, 500);
  }

  return logs;
}

/**
 * Mendapatkan atau membuat root folder PantauSekolah di Google Drive
 */
function getOrCreateRootFolder() {
  const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const root = DriveApp.createFolder(ROOT_FOLDER_NAME);
  root.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return root;
}

/**
 * Mendapatkan atau membuat folder sekolah di Google Drive
 */
function getOrCreateSchoolFolder(schoolName) {
  const cleanSchool = (schoolName || "Umum").trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
  const data = sheetSekolah.getDataRange().getValues();

  // Cari di database apakah sudah ada
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toString().toLowerCase() === cleanSchool.toLowerCase()) {
      try {
        const folder = DriveApp.getFolderById(data[i][2]);
        return { folder: folder, id: data[i][2], url: data[i][3] };
      } catch (e) {
        // Jika folder terhapus dari drive, lanjutkan buat baru di bawah
      }
    }
  }

  // Jika belum ada, buat di dalam Root Folder
  const rootFolder = getOrCreateRootFolder();
  const folderName = "[" + cleanSchool + "] - Arsip PantauSekolah";
  const schoolFolder = rootFolder.createFolder(folderName);
  schoolFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Buat subfolder standar: 01_Laporan_Kepsek & 02_Laporan_Guru
  const fKepsek = schoolFolder.createFolder("01_Laporan_Kepsek");
  const fGuru = schoolFolder.createFolder("02_Laporan_Guru");
  fKepsek.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  fGuru.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Catat ke sheet Sekolah
  const newId = "SCH-" + ("000" + (sheetSekolah.getLastRow())).slice(-3);
  const folderId = schoolFolder.getId();
  const folderUrl = schoolFolder.getUrl();
  sheetSekolah.appendRow([newId, cleanSchool, folderId, folderUrl, new Date()]);

  return { folder: schoolFolder, id: folderId, url: folderUrl };
}

// =============================================================================
// 2. SECURITY & HASHING (SHA-256 + Unique Salt)
// =============================================================================

function generateSalt(length) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let salt = "";
  for (let i = 0; i < (length || 8); i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

function hashPassword(password, salt) {
  const rawString = (password || "") + ":" + (salt || "");
  const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawString, Utilities.Charset.UTF_8);
  let hexString = "";
  for (let i = 0; i < signature.length; i++) {
    let byteVal = signature[i];
    if (byteVal < 0) byteVal += 256;
    let byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = "0" + byteHex;
    hexString += byteHex;
  }
  return hexString;
}

// =============================================================================
// 3. AUTENTIKASI (LOGIN)
// =============================================================================

function handleLogin(data) {
  const username = (data.username || "").trim();
  const password = (data.password || "").trim();

  if (!username || !password) {
    return jsonResponse({ status: "error", message: "Username dan Password wajib diisi!" });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const rows = sheetUsers.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const uName = (row[1] || "").toString().trim();
    const storedHash = (row[2] || "").toString().trim();
    let salt = (row[3] || "").toString().trim();
    const nama = row[4];
    const role = row[5];
    const asalSekolah = row[6];
    const status = (row[7] || "Aktif").toString();
    const driveFolderUrl = row[9] || "";

    if (uName.toLowerCase() === username.toLowerCase()) {
      if (status.toLowerCase() === "nonaktif") {
        return jsonResponse({ status: "error", message: "Akun Anda telah dinonaktifkan oleh Pengawas." });
      }

      let isMatch = false;

      // Cek apakah password tersimpan sudah berbentuk hash
      if (salt && storedHash) {
        const computedHash = hashPassword(password, salt);
        if (computedHash === storedHash) {
          isMatch = true;
        }
      } else {
        // Migrasi otomatis jika data lama masih plain text
        if (storedHash === password) {
          isMatch = true;
          salt = generateSalt(8);
          const newHash = hashPassword(password, salt);
          sheetUsers.getRange(i + 1, 3).setValue(newHash);
          sheetUsers.getRange(i + 1, 4).setValue(salt);
        }
      }

      if (isMatch) {
        recordAuditLog(nama, uName, role, asalSekolah, "Login Berhasil", "Pengguna masuk ke sistem", "Peran: " + role + " • Asal Sekolah: " + (asalSekolah || "Dinas"));
        return jsonResponse({
          status: "success",
          nama: nama,
          role: role,
          asal_sekolah: asalSekolah,
          username: uName,
          drive_url: driveFolderUrl
        });
      } else {
        recordAuditLog("-", username, "-", "-", "Login Gagal", "Percobaan masuk dengan kata sandi salah", "Username: @" + username);
        return jsonResponse({ status: "error", message: "Password yang Anda masukkan salah!" });
      }
    }
  }

  recordAuditLog("-", username, "-", "-", "Login Gagal", "Percobaan masuk dengan username tidak terdaftar", "Username: @" + username);
  return jsonResponse({ status: "error", message: "Username tidak ditemukan dalam sistem." });
}

// =============================================================================
// 4. USER MANAGER (Pengawas & Kepala Sekolah)
// =============================================================================

function handleGetUsers(data) {
  const requesterRole = data.role || "";
  const requesterSchool = data.asal_sekolah || "";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const rows = sheetUsers.getDataRange().getValues();

  let userList = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = row[0];
    const username = row[1];
    const nama = row[4];
    const role = row[5];
    const asalSekolah = row[6];
    const status = row[7] || "Aktif";
    const driveUrl = row[9] || "";
    const createdAt = row[10] ? Utilities.formatDate(new Date(row[10]), "Asia/Jakarta", "dd/MM/yyyy HH:mm") : "-";

    // Filtering berdasarkan role peminta:
    // - Pengawas dapat melihat semua user
    // - Kepala Sekolah HANYA dapat melihat Guru dari sekolahnya sendiri
    if (requesterRole === "Pengawas") {
      userList.push({ id, username, nama, role, asalSekolah, status, driveUrl, createdAt });
    } else if (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek") {
      if (role === "Guru" && (asalSekolah || "").toLowerCase() === requesterSchool.toLowerCase()) {
        userList.push({ id, username, nama, role, asalSekolah, status, driveUrl, createdAt });
      }
    }
  }

  return jsonResponse({ status: "success", users: userList });
}

function handleCreateUser(data) {
  const requesterRole = data.currentUserRole;
  const requesterSchool = data.currentUserSchool;

  const username = (data.username || "").trim();
  const password = (data.password || "").trim();
  const nama = (data.nama || "").trim();
  let role = (data.role || "Guru").trim();
  let asalSekolah = (data.asal_sekolah || "").trim();

  if (!username || !password || !nama) {
    return jsonResponse({ status: "error", message: "Nama, Username, dan Password wajib diisi!" });
  }

  // Validasi Hak Akses:
  if (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek") {
    // Kepala sekolah hanya boleh mendaftarkan Guru untuk sekolahnya sendiri
    role = "Guru";
    asalSekolah = requesterSchool;
  } else if (requesterRole !== "Pengawas") {
    return jsonResponse({ status: "error", message: "Anda tidak memiliki izin mendaftarkan pengguna baru." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const rows = sheetUsers.getDataRange().getValues();

  // Cek apakah username sudah dipakai
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] && rows[i][1].toString().toLowerCase() === username.toLowerCase()) {
      return jsonResponse({ status: "error", message: "Username '" + username + "' sudah digunakan. Pilih username lain." });
    }
  }

  // 1. Buat folder Drive otomatis untuk sekolah jika belum ada
  const schoolFolderObj = getOrCreateSchoolFolder(asalSekolah);
  let userDriveFolderId = schoolFolderObj.id;
  let userDriveFolderUrl = schoolFolderObj.url;

  // Jika yang didaftarkan adalah Guru, buatkan subfolder pribadi di folder Laporan Guru
  if (role === "Guru") {
    try {
      const schoolFolder = DriveApp.getFolderById(schoolFolderObj.id);
      const subFolders = schoolFolder.getFoldersByName("02_Laporan_Guru");
      let parentGuruFolder = subFolders.hasNext() ? subFolders.next() : schoolFolder;
      
      const teacherFolder = parentGuruFolder.createFolder("[" + nama + "] - Berkas Guru");
      teacherFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      userDriveFolderId = teacherFolder.getId();
      userDriveFolderUrl = teacherFolder.getUrl();
    } catch (e) {
      // fallback ke folder sekolah
    }
  }

  // 2. Hash Password dengan Salt
  const salt = generateSalt(8);
  const passwordHash = hashPassword(password, salt);

  // 3. Simpan ke database
  const newUserId = "USR-" + ("000" + sheetUsers.getLastRow()).slice(-3);
  sheetUsers.appendRow([
    newUserId, username, passwordHash, salt, nama, role, asalSekolah, "Aktif",
    userDriveFolderId, userDriveFolderUrl, new Date()
  ]);

  recordAuditLog(
    data.currentUserName || "Pengawas",
    data.currentUserUsername || "-",
    requesterRole,
    requesterSchool || "-",
    "Tambah Pengguna",
    "Mendaftarkan pengguna @" + username + " (" + nama + ")",
    "ID: " + newUserId + " • Peran: " + role + " • Asal Sekolah: " + asalSekolah
  );

  return jsonResponse({
    status: "success",
    message: "Pengguna " + nama + " (" + role + ") berhasil didaftarkan!",
    userId: newUserId,
    driveFolderUrl: userDriveFolderUrl
  });
}

function handleDeleteUser(data) {
  const userId = data.userId;
  const requesterRole = data.currentUserRole;

  if (requesterRole !== "Pengawas") {
    return jsonResponse({ status: "error", message: "Hanya Pengawas yang dapat menghapus pengguna." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const rows = sheetUsers.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toString() === userId.toString()) {
      const delUName = rows[i][1] || "-";
      const delNama = rows[i][4] || "-";
      const delRole = rows[i][5] || "-";
      const delSchool = rows[i][6] || "-";

      sheetUsers.deleteRow(i + 1);

      recordAuditLog(
        data.currentUserName || "Pengawas",
        data.currentUserUsername || "-",
        "Pengawas",
        "-",
        "Hapus Pengguna",
        "Menghapus pengguna @" + delUName + " (" + delNama + ")",
        "ID: " + userId + " • Peran: " + delRole + " • Sekolah: " + delSchool
      );

      return jsonResponse({ status: "success", message: "Pengguna berhasil dihapus." });
    }
  }

  return jsonResponse({ status: "error", message: "Pengguna tidak ditemukan." });
}

function handleResetPassword(data) {
  const username = (data.username || "").trim();
  const newPassword = (data.new_password || "").trim();
  const asalSekolah = (data.asal_sekolah || "").trim();
  const requesterRole = data.currentUserRole || "";

  if (!username) {
    return jsonResponse({ status: "error", message: "Username wajib diisi!" });
  }
  if (!newPassword || newPassword.length < 5) {
    return jsonResponse({ status: "error", message: "Password baru minimal terdiri dari 5 karakter!" });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const rows = sheetUsers.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const uName = (row[1] || "").toString().trim();
    const uNama = (row[4] || "").toString().trim();
    const uRole = (row[5] || "").toString().trim();
    const uSekolah = (row[6] || "").toString().trim();
    const uStatus = (row[7] || "Aktif").toString().trim();

    if (uName.toLowerCase() === username.toLowerCase()) {
      if (uStatus.toLowerCase() === "nonaktif") {
        return jsonResponse({ status: "error", message: "Akun ini telah dinonaktifkan oleh Pengawas." });
      }

      // Verifikasi identitas jika bukan Pengawas yang mereset
      if (requesterRole !== "Pengawas" && asalSekolah) {
        const cleanReqSekolah = asalSekolah.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanDbSekolah = uSekolah.toLowerCase().replace(/[^a-z0-9]/g, "");

        if (!cleanDbSekolah.includes(cleanReqSekolah) && !cleanReqSekolah.includes(cleanDbSekolah)) {
          return jsonResponse({
            status: "error",
            message: "Verifikasi gagal: Asal sekolah tidak cocok dengan akun @" + uName + "!"
          });
        }
      }

      // Generate salt baru & hash password baru dengan SHA-256
      const salt = generateSalt(8);
      const newHash = hashPassword(newPassword, salt);

      // Kolom C = Password Hash (index 3), Kolom D = Salt (index 4)
      sheetUsers.getRange(i + 1, 3).setValue(newHash);
      sheetUsers.getRange(i + 1, 4).setValue(salt);

      recordAuditLog(
        uNama || uName,
        uName,
        uRole || "Pengguna",
        uSekolah || "-",
        "Ganti Password",
        "Kata sandi untuk akun @" + uName + " (" + uNama + ") berhasil diperbarui",
        "Diubah oleh: " + (data.currentUserName || uNama) + " (" + (requesterRole || uRole) + ")"
      );

      return jsonResponse({
        status: "success",
        message: "Password untuk akun @" + uName + " berhasil diperbarui!"
      });
    }
  }

  return jsonResponse({ status: "error", message: "Username @" + username + " tidak ditemukan dalam sistem." });
}

// =============================================================================
// 5. MANAJEMEN FOLDER GOOGLE DRIVE (Single & Batch All Schools)
// =============================================================================

/**
 * Mengambil atau mendaftarkan otomatis semua sekolah dari Users & Laporan ke Sheet Sekolah
 */
function getOrRegisterAllSchools(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const sheetKepsek = ss.getSheetByName(SHEET_LAPORAN_KEPSEK);
  const sheetGuru = ss.getSheetByName(SHEET_LAPORAN_GURU);

  const rawSekolah = sheetSekolah ? sheetSekolah.getDataRange().getValues() : [];
  const rawUsers = sheetUsers ? sheetUsers.getDataRange().getValues() : [];
  const rawKepsek = sheetKepsek ? sheetKepsek.getDataRange().getValues() : [];
  const rawGuru = sheetGuru ? sheetGuru.getDataRange().getValues() : [];

  let existingSchoolNames = {};
  let schoolsList = [];

  for (let i = 1; i < rawSekolah.length; i++) {
    const sName = rawSekolah[i][1] ? rawSekolah[i][1].toString().trim() : "";
    if (sName) {
      existingSchoolNames[sName.toLowerCase()] = true;
      schoolsList.push({
        id: rawSekolah[i][0] || ("SCH-" + i),
        nama: sName,
        driveFolderId: rawSekolah[i][2] || "",
        driveFolderUrl: rawSekolah[i][3] || "",
        driveUrl: rawSekolah[i][3] || ""
      });
    }
  }

  // Auto-discovery dari data Pengguna dan Laporan jika belum ada di sheetSekolah
  const scanSources = [
    { rows: rawUsers, col: 6 },
    { rows: rawKepsek, col: 7 },
    { rows: rawGuru, col: 7 }
  ];

  let discoveredNames = {};
  scanSources.forEach(function(src) {
    for (let i = 1; i < src.rows.length; i++) {
      const sch = src.rows[i][src.col] ? src.rows[i][src.col].toString().trim() : "";
      if (sch && sch.toLowerCase() !== "dinas pendidikan" && sch.toLowerCase() !== "dinas") {
        const lower = sch.toLowerCase();
        if (!existingSchoolNames[lower] && !discoveredNames[lower]) {
          discoveredNames[lower] = true;
          try {
            const fObj = getOrCreateSchoolFolder(sch);
            existingSchoolNames[lower] = true;
            schoolsList.push({
              id: "SCH-" + ("000" + (schoolsList.length + 1)).slice(-3),
              nama: sch,
              driveFolderId: fObj.id,
              driveFolderUrl: fObj.url,
              driveUrl: fObj.url
            });
          } catch(e) {
            schoolsList.push({
              id: "SCH-" + ("000" + (schoolsList.length + 1)).slice(-3),
              nama: sch,
              driveFolderId: "",
              driveFolderUrl: "",
              driveUrl: ""
            });
          }
        }
      }
    }
  });

  return schoolsList;
}

function handleGetSchools() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schools = getOrRegisterAllSchools(ss);
  return jsonResponse({ status: "success", schools: schools });
}

function handleCreateDriveFolder(data) {
  const requesterRole = data.currentUserRole;
  const isPengawas = (requesterRole === "Pengawas");
  const isKepsek = (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek");
  if (!isPengawas && !isKepsek) {
    return jsonResponse({ status: "error", message: "Hanya Pengawas dan Kepala Sekolah yang berwenang mengelola folder Drive." });
  }

  const folderName = (data.folderName || "").trim();
  let targetType = data.targetType || "single"; // "single" atau "all"
  let targetSchool = (data.targetSchool || data.currentUserSchool || "").trim();
  let subCategory = data.subCategory || "root"; // "root", "kepsek", "guru"

  // Kepala Sekolah hanya boleh membuat folder di sekolah miliknya sendiri & pada subfolder guru
  if (isKepsek) {
    targetType = "single";
    targetSchool = (data.currentUserSchool || data.targetSchool || "").trim();
    if (!subCategory || subCategory === "root") {
      subCategory = "guru";
    }
  }

  if (!folderName) {
    return jsonResponse({ status: "error", message: "Nama folder wajib diisi!" });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
  const sheetFolderDrive = ss.getSheetByName(SHEET_FOLDER_DRIVE);
  const schoolRows = sheetSekolah.getDataRange().getValues();

  let schoolsToProcess = [];

  if (targetType === "all") {
    for (let i = 1; i < schoolRows.length; i++) {
      if (schoolRows[i][1]) {
        schoolsToProcess.push({
          nama: schoolRows[i][1],
          folderId: schoolRows[i][2]
        });
      }
    }
    if (schoolsToProcess.length === 0) {
      return jsonResponse({ status: "error", message: "Belum ada sekolah yang terdaftar di sistem." });
    }
  } else {
    // Single school
    let found = false;
    for (let i = 1; i < schoolRows.length; i++) {
      if (schoolRows[i][1] && schoolRows[i][1].toString().toLowerCase() === targetSchool.toLowerCase()) {
        schoolsToProcess.push({
          nama: schoolRows[i][1],
          folderId: schoolRows[i][2]
        });
        found = true;
        break;
      }
    }
    if (!found) {
      const newSch = getOrCreateSchoolFolder(targetSchool);
      schoolsToProcess.push({ nama: targetSchool, folderId: newSch.id });
    }
  }

  let createdList = [];

  // Hitung ID awal dari database agar setiap baris sekolah memiliki ID unik
  let maxIdNum = 0;
  const existingFolderRows = sheetFolderDrive.getDataRange().getValues();
  for (let i = 1; i < existingFolderRows.length; i++) {
    const idVal = existingFolderRows[i][0] ? existingFolderRows[i][0].toString() : "";
    const m = idVal.match(/FLD-(\d+)/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > maxIdNum) maxIdNum = num;
    }
  }
  if (maxIdNum < existingFolderRows.length - 1) {
    maxIdNum = existingFolderRows.length - 1;
  }

  schoolsToProcess.forEach(function (sch) {
    try {
      // Jika sebelumnya folder default ini dihapus dan sekarang dibuat kembali, bersihkan marker penghapusan
      const existingRows = sheetFolderDrive.getDataRange().getValues();
      for (let r = existingRows.length - 1; r >= 1; r--) {
        const rowFldName = existingRows[r][1] ? existingRows[r][1].toString() : "";
        const rowSchool = existingRows[r][2] ? existingRows[r][2].toString() : "";
        if (rowFldName.startsWith("__DELETED__:") && rowSchool.toLowerCase() === sch.nama.toLowerCase()) {
          const type = rowFldName.replace("__DELETED__:", "").toLowerCase();
          if (folderName.toLowerCase().includes(type)) {
            sheetFolderDrive.deleteRow(r + 1);
          }
        }
      }

      const parentSchoolFolder = DriveApp.getFolderById(sch.folderId);
      let targetParent = parentSchoolFolder;

      if (subCategory === "kepsek") {
        const sub = parentSchoolFolder.getFoldersByName("01_Laporan_Kepsek");
        if (sub.hasNext()) {
          targetParent = sub.next();
        } else {
          targetParent = parentSchoolFolder.createFolder("01_Laporan_Kepsek");
          targetParent.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        }
      } else if (subCategory === "guru") {
        const sub = parentSchoolFolder.getFoldersByName("02_Laporan_Guru");
        if (sub.hasNext()) {
          targetParent = sub.next();
        } else {
          targetParent = parentSchoolFolder.createFolder("02_Laporan_Guru");
          targetParent.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        }
      }

      const newFolder = targetParent.createFolder(folderName);
      newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      maxIdNum++;
      const newId = "FLD-" + ("000" + maxIdNum).slice(-3);
      sheetFolderDrive.appendRow([
        newId, folderName, sch.nama, targetType, newFolder.getId(), newFolder.getUrl(), new Date(), subCategory
      ]);

      createdList.push({
        id: newId,
        sekolah: sch.nama,
        folderName: folderName,
        url: newFolder.getUrl(),
        subCategory: subCategory
      });
    } catch (e) {
      // Lanjutkan jika ada folder yang error
    }
  });

  if (createdList.length > 0) {
    recordAuditLog(
      data.currentUserName || "Pengawas",
      data.currentUserUsername || "-",
      requesterRole,
      data.currentUserSchool || "-",
      "Tambah Folder",
      "Membuat folder baru '" + folderName + "'",
      "Target: " + (targetType === "all" ? "Semua Sekolah (" + createdList.length + ")" : targetSchool) + " • Subkategori: " + subCategory
    );
  }

  return jsonResponse({
    status: "success",
    message: "Berhasil membuat folder '" + folderName + "' pada " + createdList.length + " sekolah.",
    results: createdList
  });
}

function handleGetDriveFolders(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetFolder = ss.getSheetByName(SHEET_FOLDER_DRIVE);
  const rows = sheetFolder.getDataRange().getValues();

  let folders = [];
  for (let i = 1; i < rows.length; i++) {
    const fId = rows[i][0] ? rows[i][0].toString() : "";
    const fName = rows[i][1] ? rows[i][1].toString() : "";
    if (!fName || fName.startsWith("__DELETED__:") || fId.startsWith("DEL-")) continue;
    folders.push({
      id: rows[i][0],
      namaFolder: rows[i][1],
      namaSekolah: rows[i][2],
      targetType: rows[i][3],
      driveFolderUrl: rows[i][5],
      createdAt: rows[i][6] ? Utilities.formatDate(new Date(rows[i][6]), "Asia/Jakarta", "dd/MM/yyyy HH:mm") : "-",
      subCategory: rows[i][7] || "guru"
    });
  }

  const requesterRole = data ? (data.currentUserRole || data.role || "") : "";
  const userSchool = (data ? (data.currentUserSchool || data.asal_sekolah || "") : "").trim();
  const isPengawas = (requesterRole === "Pengawas");

  if (!isPengawas && userSchool) {
    folders = folders.filter(function(f) {
      const fSchool = (f.namaSekolah || "").trim().toLowerCase();
      if (!fSchool) return false;
      if (fSchool === "semua" || fSchool === "semua sekolah" || fSchool === "all" || f.targetType === "all") return true;
      return fSchool === userSchool.toLowerCase();
    });
  }

  return jsonResponse({ status: "success", folders: folders });
}

function handleDeleteDriveFolder(data) {
  const folderId = data.folderId;
  const targetSchool = (data.schoolName || data.targetSchool || "").trim();
  const requesterRole = data.currentUserRole;
  const requesterSchool = (data.currentUserSchool || data.asal_sekolah || "").trim();
  const isPengawas = (requesterRole === "Pengawas");
  const isKepsek = (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek");

  if (!isPengawas && !isKepsek) {
    return jsonResponse({ status: "error", message: "Hanya Pengawas dan Kepala Sekolah yang berwenang menghapus folder Drive." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetFolder = ss.getSheetByName(SHEET_FOLDER_DRIVE);
  const rows = sheetFolder.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toString() === folderId.toString()) {
      const rowSchool = rows[i][2] ? rows[i][2].toString().trim() : "";
      // Jika diberikan targetSchool, pastikan cocok agar tidak salah hapus baris sekolah lain jika ID pernah terduplikasi
      if (targetSchool && rowSchool && rowSchool.toLowerCase() !== targetSchool.toLowerCase()) {
        continue;
      }

      const subCategory = (rows[i][7] || "guru").toString().toLowerCase();
      // KEPALA SEKOLAH HANYA BOLEH MENGHAPUS FOLDER GURU
      if (!isPengawas && subCategory === "kepsek") {
        return jsonResponse({
          status: "error",
          message: "Kepala Sekolah tidak berwenang menghapus folder Kepala Sekolah. Folder tersebut dilindungi dan hanya dapat dikelola oleh Pengawas."
        });
      }

      if (isKepsek && requesterSchool) {
        if (!rowSchool || rowSchool.toLowerCase() !== requesterSchool.toLowerCase()) {
          return jsonResponse({ status: "error", message: "Anda hanya berwenang menghapus folder milik sekolah Anda." });
        }
      }
      const driveFolderId = rows[i][4];
      try {
        if (driveFolderId) {
          DriveApp.getFolderById(driveFolderId).setTrashed(true);
        }
      } catch (e) {
        // jika folder sudah tidak ada di Drive, lanjutkan hapus dari sheet
      }

      const delFolderName = rows[i][1] || "-";
      sheetFolder.deleteRow(i + 1);

      recordAuditLog(
        data.currentUserName || "Pengawas",
        data.currentUserUsername || "-",
        requesterRole,
        requesterSchool || "-",
        "Hapus Folder",
        "Menghapus folder '" + delFolderName + "'",
        "ID Folder: " + folderId + " • Sekolah: " + rowSchool + " • Subkategori: " + subCategory
      );

      return jsonResponse({ status: "success", message: "Folder berhasil dihapus dari Google Drive dan database." });
    }
  }

  return jsonResponse({ status: "error", message: "Data folder tidak ditemukan." });
}

function handleDeleteDefaultFolder(data) {
  const requesterRole = data.currentUserRole;
  const isPengawas = (requesterRole === "Pengawas");
  const isKepsek = (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek");
  if (!isPengawas && !isKepsek) {
    return jsonResponse({ status: "error", message: "Hanya Pengawas dan Kepala Sekolah yang berwenang mengelola folder." });
  }

  const subCategory = (data.subCategory || data.category || "guru").toString().toLowerCase();
  if (!isPengawas && subCategory === "kepsek") {
    return jsonResponse({
      status: "error",
      message: "Kepala Sekolah tidak berwenang menghapus folder Kepala Sekolah. Folder tersebut dilindungi dan hanya dapat dikelola oleh Pengawas."
    });
  }

  const school = (data.schoolName || data.targetSchool || data.currentUserSchool || "").trim();
  const folderType = (data.folderType || "").trim(); // "Mingguan" atau "Daring"

  if (!school || !folderType) {
    return jsonResponse({ status: "error", message: "Sekolah dan jenis folder wajib ditentukan." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetFolder = ss.getSheetByName(SHEET_FOLDER_DRIVE);
  const delMarker = "__DELETED__:" + folderType;

  // Cek jika sudah pernah dicatat, tidak perlu duplikat
  const rows = sheetFolder.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === delMarker && rows[i][2] && rows[i][2].toString().toLowerCase() === school.toLowerCase()) {
      return jsonResponse({ status: "success", message: "Folder sudah ditandai dihapus." });
    }
  }

  const newId = "DEL-" + ("000" + sheetFolder.getLastRow()).slice(-3);
  sheetFolder.appendRow([
    newId, delMarker, school, "single", "", "", new Date(), subCategory
  ]);

  recordAuditLog(
    data.currentUserName || "Pengawas",
    data.currentUserUsername || "-",
    requesterRole,
    school,
    "Sembunyikan Folder",
    "Menghapus/menyembunyikan folder bawaan " + folderType,
    "Sekolah: " + school + " • Subkategori: " + subCategory
  );

  return jsonResponse({ status: "success", message: "Folder Laporan " + folderType + " berhasil dihapus." });
}

// =============================================================================
// 6. DASHBOARD & AKTIVITAS LAPORAN
// =============================================================================

function handleGetDashboardData(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheetKepsek = ss.getSheetByName(SHEET_LAPORAN_KEPSEK);
  const sheetGuru = ss.getSheetByName(SHEET_LAPORAN_GURU);
  const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);

  const rawKepsek = sheetKepsek ? sheetKepsek.getDataRange().getValues() : [];
  const rawGuru = sheetGuru ? sheetGuru.getDataRange().getValues() : [];
  const rawSekolah = sheetSekolah ? sheetSekolah.getDataRange().getValues() : [];

  let reportsKepsek = [];
  for (let i = 1; i < rawKepsek.length; i++) {
    const row = rawKepsek[i];
    if (row[0]) {
      reportsKepsek.push({
        id: row[0],
        tanggal: row[1] ? Utilities.formatDate(new Date(row[1]), "Asia/Jakarta", "dd/MM/yyyy") : "-",
        nama: row[2],
        kategori: row[3],
        fileUrl: row[4],
        status: row[5],
        catatan: row[6],
        asalSekolah: row[7],
        jenisPelaporan: row[8],
        namaFile: row[9] || "",
        poinPenting: row[10] || "",
        sourceRole: "Kepala Sekolah"
      });
    }
  }

  let reportsGuru = [];
  for (let i = 1; i < rawGuru.length; i++) {
    const row = rawGuru[i];
    if (row[0]) {
      reportsGuru.push({
        id: row[0],
        tanggal: row[1] ? Utilities.formatDate(new Date(row[1]), "Asia/Jakarta", "dd/MM/yyyy") : "-",
        nama: row[2],
        kategori: row[3],
        fileUrl: row[4],
        status: row[5],
        catatan: row[6],
        asalSekolah: row[7],
        jenisPelaporan: row[8],
        namaFile: row[9] || "",
        poinPenting: row[10] || "",
        sourceRole: "Guru"
      });
    }
  }

  let schoolsList = getOrRegisterAllSchools(ss);

  const requesterRole = data ? (data.currentUserRole || data.role || "") : "";
  const userSchool = (data ? (data.asal_sekolah || data.currentUserSchool || "") : "").trim();
  const isPengawas = (requesterRole === "Pengawas");

  // Jika bukan Pengawas (misal Kepala Sekolah atau Guru), filter data sesuai sekolah miliknya
  if (!isPengawas && userSchool) {
    reportsKepsek = reportsKepsek.filter(function(r) { return (r.asalSekolah || "").toLowerCase() === userSchool.toLowerCase(); });
    reportsGuru = reportsGuru.filter(function(r) { return (r.asalSekolah || "").toLowerCase() === userSchool.toLowerCase(); });
    schoolsList = schoolsList.filter(function(s) { return (s.nama || "").toLowerCase() === userSchool.toLowerCase(); });
  }

  let allActivity = reportsKepsek.concat(reportsGuru);
  allActivity.reverse(); // Terbaru di atas

  const sheetFolder = ss.getSheetByName(SHEET_FOLDER_DRIVE);
  const rawFolder = sheetFolder ? sheetFolder.getDataRange().getValues() : [];
  let foldersList = [];
  for (let i = 1; i < rawFolder.length; i++) {
    const r = rawFolder[i];
    if (r[0]) {
      foldersList.push({
        id: r[0],
        namaFolder: r[1],
        namaSekolah: r[2],
        targetType: r[3],
        driveFolderUrl: r[5],
        createdAt: r[6] ? Utilities.formatDate(new Date(r[6]), "Asia/Jakarta", "dd/MM/yyyy") : "-",
        subCategory: r[7] || "guru"
      });
    }
  }

  if (!isPengawas && userSchool) {
    foldersList = foldersList.filter(function(f) {
      const fSchool = (f.namaSekolah || "").trim().toLowerCase();
      if (!fSchool) return false;
      if (fSchool === "semua" || fSchool === "semua sekolah" || fSchool === "all" || f.targetType === "all") return true;
      return fSchool === userSchool.toLowerCase();
    });
  }

  return jsonResponse({
    status: "success",
    reportsKepsek: reportsKepsek,
    reportsGuru: reportsGuru,
    allActivity: allActivity,
    schools: schoolsList,
    folders: foldersList,
    auditLogs: isPengawas ? getAuditLogsList(ss) : []
  });
}

/**
 * Super Fast Master Sync: Membaca seluruh data sekaligus dalam 1 request batch
 */
function handleSyncAll(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheetKepsek = ss.getSheetByName(SHEET_LAPORAN_KEPSEK);
  const sheetGuru = ss.getSheetByName(SHEET_LAPORAN_GURU);
  const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const sheetFolder = ss.getSheetByName(SHEET_FOLDER_DRIVE);

  const rawKepsek = sheetKepsek ? sheetKepsek.getDataRange().getValues() : [];
  const rawGuru = sheetGuru ? sheetGuru.getDataRange().getValues() : [];
  const rawSekolah = sheetSekolah ? sheetSekolah.getDataRange().getValues() : [];
  const rawUsers = sheetUsers ? sheetUsers.getDataRange().getValues() : [];
  const rawFolder = sheetFolder ? sheetFolder.getDataRange().getValues() : [];

  let reportsKepsek = [];
  for (let i = 1; i < rawKepsek.length; i++) {
    const row = rawKepsek[i];
    if (row[0]) {
      reportsKepsek.push({
        id: row[0],
        tanggal: row[1] ? Utilities.formatDate(new Date(row[1]), "Asia/Jakarta", "dd/MM/yyyy") : "-",
        nama: row[2],
        kategori: row[3],
        fileUrl: row[4],
        status: row[5],
        catatan: row[6],
        asalSekolah: row[7],
        jenisPelaporan: row[8],
        namaFile: row[9] || "",
        poinPenting: row[10] || "",
        sourceRole: "Kepala Sekolah"
      });
    }
  }

  let reportsGuru = [];
  for (let i = 1; i < rawGuru.length; i++) {
    const row = rawGuru[i];
    if (row[0]) {
      reportsGuru.push({
        id: row[0],
        tanggal: row[1] ? Utilities.formatDate(new Date(row[1]), "Asia/Jakarta", "dd/MM/yyyy") : "-",
        nama: row[2],
        kategori: row[3],
        fileUrl: row[4],
        status: row[5],
        catatan: row[6],
        asalSekolah: row[7],
        jenisPelaporan: row[8],
        namaFile: row[9] || "",
        poinPenting: row[10] || "",
        sourceRole: "Guru"
      });
    }
  }

  let schoolsList = getOrRegisterAllSchools(ss);

  let allActivity = reportsKepsek.concat(reportsGuru);
  allActivity.reverse();

  let usersList = [];
  for (let i = 1; i < rawUsers.length; i++) {
    const r = rawUsers[i];
    if (r[0]) {
      usersList.push({
        id: r[0],
        username: r[1],
        nama: r[4],
        role: r[5],
        asalSekolah: r[6],
        status: r[7] || "Aktif",
        driveUrl: r[9] || "",
        createdAt: r[10] ? Utilities.formatDate(new Date(r[10]), "Asia/Jakarta", "dd/MM/yyyy") : "-"
      });
    }
  }

  let foldersList = [];
  for (let i = 1; i < rawFolder.length; i++) {
    const r = rawFolder[i];
    const fId = r[0] ? r[0].toString() : "";
    const fName = r[1] ? r[1].toString() : "";
    if (!fName || fName.startsWith("__DELETED__:") || fId.startsWith("DEL-")) continue;
    if (r[0]) {
      foldersList.push({
        id: r[0],
        namaFolder: r[1],
        namaSekolah: r[2],
        targetType: r[3],
        driveFolderUrl: r[5],
        createdAt: r[6] ? Utilities.formatDate(new Date(r[6]), "Asia/Jakarta", "dd/MM/yyyy") : "-",
        subCategory: r[7] || "guru"
      });
    }
  }

  const requesterRole = data ? (data.currentUserRole || data.role || "") : "";
  const userSchool = (data ? (data.asal_sekolah || data.currentUserSchool || "") : "").trim();
  const isPengawas = (requesterRole === "Pengawas");

  // Jika bukan Pengawas (misal Kepala Sekolah atau Guru), filter data sesuai sekolah miliknya
  if (!isPengawas && userSchool) {
    reportsKepsek = reportsKepsek.filter(function(r) { return (r.asalSekolah || "").toLowerCase() === userSchool.toLowerCase(); });
    reportsGuru = reportsGuru.filter(function(r) { return (r.asalSekolah || "").toLowerCase() === userSchool.toLowerCase(); });
    schoolsList = schoolsList.filter(function(s) { return (s.nama || "").toLowerCase() === userSchool.toLowerCase(); });
    foldersList = foldersList.filter(function(f) {
      const fSchool = (f.namaSekolah || "").trim().toLowerCase();
      if (!fSchool) return false;
      if (fSchool === "semua" || fSchool === "semua sekolah" || fSchool === "all" || f.targetType === "all") return true;
      return fSchool === userSchool.toLowerCase();
    });
    if (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek") {
      usersList = usersList.filter(function(u) {
        return u.role === "Guru" && (u.asalSekolah || "").toLowerCase() === userSchool.toLowerCase();
      });
    } else {
      usersList = usersList.filter(function(u) {
        return (u.asalSekolah || "").toLowerCase() === userSchool.toLowerCase();
      });
    }
  }

  allActivity = reportsKepsek.concat(reportsGuru);
  allActivity.reverse();

  return jsonResponse({
    status: "success",
    reportsKepsek: reportsKepsek,
    reportsGuru: reportsGuru,
    allActivity: allActivity,
    schools: schoolsList,
    users: usersList,
    folders: foldersList,
    auditLogs: isPengawas ? getAuditLogsList(ss) : [],
    timestamp: new Date().toISOString()
  });
}

// =============================================================================
// 7. VERIFIKASI LAPORAN
// =============================================================================

function handleVerifikasiLaporan(data) {
  const idLaporan = data.idLaporan;
  const targetSheetName = data.targetSheet;
  const statusVerifikasi = data.statusVerifikasi;
  const catatanVerifikasi = data.catatanVerifikasi;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(targetSheetName);

  if (!sheet) {
    return jsonResponse({ status: "error", message: "Sheet target tidak ditemukan." });
  }

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toString() === idLaporan.toString()) {
      sheet.getRange(i + 1, 6).setValue(statusVerifikasi); // Kolom Status
      sheet.getRange(i + 1, 7).setValue(catatanVerifikasi || "-"); // Kolom Catatan

      recordAuditLog(
        data.currentUserName || "Pengawas",
        data.currentUserUsername || "-",
        data.currentUserRole || "Pengawas",
        data.currentUserSchool || "-",
        "Verifikasi Laporan",
        "Memverifikasi laporan " + idLaporan + " menjadi '" + statusVerifikasi + "'",
        "Pengirim: " + (rows[i][2] || "-") + " • Catatan: " + (catatanVerifikasi || "-") + " • Target: " + targetSheetName
      );

      return jsonResponse({ status: "success", message: "Verifikasi laporan berhasil diperbarui!" });
    }
  }

  return jsonResponse({ status: "error", message: "Data laporan tidak ditemukan." });
}

function handleDeleteLaporan(data) {
  const idLaporan = (data.idLaporan || "").toString().trim();
  const targetSheetName = data.targetSheet;
  const requesterRole = data.currentUserRole || "Guru";
  const requesterName = (data.currentUserName || "").trim();
  const requesterSchool = (data.currentUserSchool || "").trim();

  if (!idLaporan) {
    return jsonResponse({ status: "error", message: "ID Laporan tidak valid." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Tentukan daftar sheet yang akan diperiksa
  let sheetsToCheck = [];
  if (targetSheetName && ss.getSheetByName(targetSheetName)) {
    sheetsToCheck.push(ss.getSheetByName(targetSheetName));
  }
  [SHEET_LAPORAN_GURU, SHEET_LAPORAN_KEPSEK].forEach(name => {
    const s = ss.getSheetByName(name);
    if (s && !sheetsToCheck.includes(s)) sheetsToCheck.push(s);
  });

  for (let s = 0; s < sheetsToCheck.length; s++) {
    const sheet = sheetsToCheck[s];
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toString().trim() === idLaporan) {
        const delNamaPengirim = (rows[i][2] || "").toString().trim();
        const delKategori = rows[i][3] || "-";
        const fileUrl = rows[i][4];
        const delSekolah = (rows[i][7] || "").toString().trim();
        const delNamaFile = rows[i][9] || "";

        // Otorisasi: Pengawas dapat menghapus semua laporan.
        // Semua user role dapat menghapus berkas yang diunggahnya sendiri.
        // Kepala Sekolah juga dapat menghapus laporan guru dari sekolah yang dipimpinnya.
        const isPengawas = (requesterRole === "Pengawas");
        const isOwner = (requesterName && delNamaPengirim.toLowerCase() === requesterName.toLowerCase());
        const isSchoolKepsek = (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek") &&
                               (requesterSchool && delSekolah.toLowerCase() === requesterSchool.toLowerCase());

        if (!isPengawas && !isOwner && !isSchoolKepsek) {
          return jsonResponse({
            status: "error",
            message: "Anda hanya berwenang menghapus berkas laporan yang Anda unggah sendiri."
          });
        }

        // Hapus file dari Google Drive (pindahkan ke sampah)
        try {
          if (fileUrl) {
            let fileId = "";
            const matchD = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
            const matchId = fileUrl.match(/id=([a-zA-Z0-9_-]+)/);
            if (matchD && matchD[1]) fileId = matchD[1];
            else if (matchId && matchId[1]) fileId = matchId[1];

            if (fileId) {
              DriveApp.getFileById(fileId).setTrashed(true);
            }
          }
        } catch (e) {
          // Abaikan jika file tidak ditemukan di Drive
        }

        // Hapus baris dari sheet
        sheet.deleteRow(i + 1);

        // Catat jejak ke Audit Log
        const logActionDesc = isOwner
          ? "Menghapus berkas laporan miliknya sendiri: " + idLaporan + " (" + (delNamaFile || delKategori) + ")"
          : (isPengawas
              ? "Pengawas menghapus berkas laporan: " + idLaporan + " milik " + delNamaPengirim + " (" + (delNamaFile || delKategori) + ")"
              : "Kepala Sekolah menghapus berkas laporan guru: " + idLaporan + " milik " + delNamaPengirim + " (" + (delNamaFile || delKategori) + ")");

        recordAuditLog(
          requesterName || "Pengguna",
          data.currentUserUsername || "-",
          requesterRole || "-",
          requesterSchool || "-",
          "Hapus Laporan",
          logActionDesc,
          "Sekolah: " + delSekolah + " • Berkas: " + (delNamaFile || "-") + " • Kategori: " + delKategori + " • ID: " + idLaporan
        );

        return jsonResponse({
          status: "success",
          message: "Berkas laporan berhasil dihapus dari sistem dan Google Drive!"
        });
      }
    }
  }

  return jsonResponse({ status: "error", message: "Data berkas laporan tidak ditemukan." });
}

// =============================================================================
// 8. UPLOAD FILE KE GOOGLE DRIVE
// =============================================================================

function handleUploadFile(data) {
  const nama = data.nama;
  const role = data.role;
  const asalSekolah = data.asal_sekolah;
  const kategori = data.kategori;
  const filename = data.filename;
  const mimeType = data.mimeType;
  const filebase64 = data.filebase64;

  if (!filebase64 || !filename) {
    return jsonResponse({ status: "error", message: "Berkas tidak lengkap untuk diunggah." });
  }

  const isKepsek = (role === "Kepala Sekolah" || role === "Kepsek");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheetName = isKepsek ? SHEET_LAPORAN_KEPSEK : SHEET_LAPORAN_GURU;
  const sheet = ss.getSheetByName(targetSheetName);

  // Pencegahan Duplikasi: Jika berkas dengan nama yang sama oleh pengirim yang sama di sekolah yang sama sudah tercatat dalam 2 menit terakhir
  if (sheet) {
    const existingRows = sheet.getDataRange().getValues();
    const nowMs = new Date().getTime();
    for (let i = existingRows.length - 1; i >= Math.max(1, existingRows.length - 20); i--) {
      const row = existingRows[i];
      const rId = row[0];
      const rDate = row[1] ? new Date(row[1]).getTime() : 0;
      const rNama = row[2] ? row[2].toString().trim().toLowerCase() : "";
      const rFileUrl = row[4];
      const rSekolah = row[7] ? row[7].toString().trim().toLowerCase() : "";
      const rFilename = row[9] ? row[9].toString().trim().toLowerCase() : "";

      if (
        rNama === (nama || "").trim().toLowerCase() &&
        rSekolah === (asalSekolah || "").trim().toLowerCase() &&
        rFilename === (filename || "").trim().toLowerCase() &&
        (nowMs - rDate) < 120000
      ) {
        return jsonResponse({
          status: "success",
          message: "Berkas laporan telah berhasil disimpan ke Google Drive & Sheets!",
          fileUrl: rFileUrl,
          idLaporan: rId,
          isDuplicatePrevented: true
        });
      }
    }
  }

  // Cari folder tujuan di Google Drive
  const schoolFolderObj = getOrCreateSchoolFolder(asalSekolah);
  const schoolFolder = DriveApp.getFolderById(schoolFolderObj.id);

  let targetFolder = schoolFolder;
  const subFolderName = isKepsek ? "01_Laporan_Kepsek" : "02_Laporan_Guru";
  const subFolders = schoolFolder.getFoldersByName(subFolderName);

  if (subFolders.hasNext()) {
    targetFolder = subFolders.next();
  }

  // Jika ada subfolder spesifik yang sesuai dengan jenisPelaporan, masukkan langsung ke dalamnya
  const reportFolderType = (data.jenisPelaporan || "").trim();
  if (reportFolderType) {
    try {
      const specificFolders = targetFolder.getFoldersByName(reportFolderType);
      if (specificFolders.hasNext()) {
        targetFolder = specificFolders.next();
      }
    } catch (e) {}
  }

  // Pastikan MIME type sesuai dengan jenis berkas (khususnya berkas Office & Image)
  let effectiveMime = (mimeType || "").trim();
  if (!effectiveMime || effectiveMime === "application/octet-stream") {
    const ext = filename.indexOf(".") > -1 ? filename.split(".").pop().toLowerCase() : "";
    const mimeMap = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp"
    };
    effectiveMime = mimeMap[ext] || "application/octet-stream";
  }

  // Decode base64
  const cleanBase64 = filebase64.indexOf(",") > -1 ? filebase64.split(",")[1] : filebase64;
  const decodedBytes = Utilities.base64Decode(cleanBase64);
  const blob = Utilities.newBlob(decodedBytes, effectiveMime, filename);

  const file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileUrl = file.getUrl();

  const prefix = isKepsek ? "LPK-" : "LPG-";
  const newId = prefix + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss");
  const jenisPelaporan = reportFolderType || (kategori.indexOf("Daring") > -1 ? "Daring" : (kategori.indexOf("Mingguan") > -1 ? "Mingguan" : kategori));
  const poinPenting = (data.poinPenting || "").trim();

  sheet.appendRow([
    newId, new Date(), nama, kategori, fileUrl, "Menunggu Verifikasi", "Belum ada catatan", asalSekolah, jenisPelaporan, filename, poinPenting
  ]);

  recordAuditLog(
    nama,
    data.currentUserUsername || "-",
    role,
    asalSekolah,
    "Unggah Laporan",
    "Mengunggah berkas '" + filename + "' (" + jenisPelaporan + ")",
    "ID: " + newId + " • Kategori: " + kategori + " • Format: " + effectiveMime
  );

  return jsonResponse({
    status: "success",
    message: "Berkas berhasil diunggah dan disimpan ke Google Drive!",
    fileUrl: fileUrl,
    idLaporan: newId
  });
}

// =============================================================================
// 9. AUDIT LOG (REKAM JEJAK AKTIVITAS PENGGUNA)
// =============================================================================

function handleGetAuditLogs(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logs = getAuditLogsList(ss);
  return jsonResponse({
    status: "success",
    logs: logs
  });
}

function handleClearAuditLogs(data) {
  const requesterRole = data.currentUserRole;
  if (requesterRole !== "Pengawas") {
    return jsonResponse({ status: "error", message: "Hanya Pengawas yang berwenang membersihkan audit log." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_AUDIT_LOG);
  if (sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
  }

  recordAuditLog(
    data.currentUserName || "Pengawas",
    data.currentUserUsername || "-",
    "Pengawas",
    "-",
    "Bersihkan Audit Log",
    "Pengawas membersihkan seluruh riwayat audit log sistem",
    "Waktu pembersihan: " + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss")
  );

  return jsonResponse({
    status: "success",
    message: "Seluruh riwayat audit log berhasil dibersihkan!"
  });
}

function handleRecordClientLog(data) {
  const nama = data.nama || data.currentUserName || "-";
  const username = data.username || data.currentUserUsername || "-";
  const role = data.role || data.currentUserRole || "-";
  const asalSekolah = data.asal_sekolah || data.currentUserSchool || "-";
  const aksi = data.aksi || "Aktivitas";
  const keterangan = data.keterangan || "-";
  const detail = data.detail || "-";

  recordAuditLog(nama, username, role, asalSekolah, aksi, keterangan, detail);

  return jsonResponse({
    status: "success",
    message: "Audit log berhasil dicatat."
  });
}

// =============================================================================
// HELPER: RESPONSE JSON
// =============================================================================

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
