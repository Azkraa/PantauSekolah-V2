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

// DEFAULT API KEY & MODEL UNTUK KECERDASAN BUATAN (AI ASSISTANT & LAPORAN DINAS)
const DEFAULT_AI_MODEL = "openai/gpt-oss-120b";

function getDefaultAiApiKey() {
  const enc = "c2stb3ItdjEtYzlhNWYzMmMwOWZiMjNmNzgzZDcyZTFiODkzYWYxNGYxNzQwNDVmMWEzODc1YmQ0NDc3OWM3ZGQ0ZmI1MThmZA==";
  try {
    return Utilities.newBlob(Utilities.base64Decode(enc)).getDataAsString();
  } catch (e) {
    return "";
  }
}

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

      case "create_users_batch":
        return handleCreateUsersBatch(data);

      case "update_user":
        return handleUpdateUser(data);

      case "delete_user":
        return handleDeleteUser(data);

      case "delete_school":
      case "delete_entire_school":
        return handleDeleteSchool(data);

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

      case "update_laporan":
        return handleUpdateLaporan(data);

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

      case "generate_dinas_report_ai":
        return handleGenerateDinasReportAI(data);

      case "ai_chat":
        return handleAiChat(data);

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
 * Membersihkan duplikasi baris nama sekolah pada sheet Sekolah (Self-Healing)
 */
function cleanDuplicateSchoolRows(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
  if (!sheetSekolah) return;

  const data = sheetSekolah.getDataRange().getValues();
  if (data.length <= 2) return;

  const seen = {};
  const rowsToDelete = [];

  for (let i = 1; i < data.length; i++) {
    const sName = data[i][1] ? data[i][1].toString().trim() : "";
    if (!sName) continue;
    const lower = sName.toLowerCase();
    const folderId = data[i][2] ? data[i][2].toString().trim() : "";

    if (seen[lower]) {
      const prev = seen[lower];
      // Jika baris sebelumnya kosong folderId tapi baris ini punya, salin folderId ke baris sebelumnya
      if (!prev.hasFolder && folderId) {
        sheetSekolah.getRange(prev.row, 3, 1, 2).setValues([[folderId, data[i][3] || ""]]);
        prev.hasFolder = true;
      }
      rowsToDelete.push(i + 1);
    } else {
      seen[lower] = { row: i + 1, hasFolder: !!folderId };
    }
  }

  // Hapus dari indeks terbesar ke terkecil
  for (let r = rowsToDelete.length - 1; r >= 0; r--) {
    sheetSekolah.deleteRow(rowsToDelete[r]);
  }
}

/**
 * Membersihkan folder duplikat di sheet Folder_Drive (Self-Healing)
 */
function cleanDuplicateFolderDriveRows(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetFolder = ss.getSheetByName(SHEET_FOLDER_DRIVE);
  if (!sheetFolder) return;

  const data = sheetFolder.getDataRange().getValues();
  if (data.length <= 2) return;

  const seen = {};
  const rowsToDelete = [];

  for (let i = 1; i < data.length; i++) {
    const fId = data[i][0] ? data[i][0].toString().trim() : "";
    const fName = data[i][1] ? data[i][1].toString().trim() : "";
    const sName = data[i][2] ? data[i][2].toString().trim() : "";
    const subCat = (data[i][7] || "guru").toString().trim().toLowerCase();

    if (!fName || fName.startsWith("__DELETED__:") || fId.startsWith("DEL-")) continue;

    const key = fName.toLowerCase() + "|||" + sName.toLowerCase() + "|||" + subCat;
    if (seen[key]) {
      rowsToDelete.push(i + 1);
    } else {
      seen[key] = i + 1;
    }
  }

  for (let r = rowsToDelete.length - 1; r >= 0; r--) {
    sheetFolder.deleteRow(rowsToDelete[r]);
  }
}

/**
 * Mendapatkan atau membuat folder sekolah di Google Drive
 */
function getOrCreateSchoolFolder(schoolName) {
  const cleanSchool = (schoolName || "Umum").trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
  const data = sheetSekolah.getDataRange().getValues();

  let existingRowIndex = -1;

  // Cari di database apakah sudah ada
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toString().trim().toLowerCase() === cleanSchool.toLowerCase()) {
      existingRowIndex = i + 1;
      if (data[i][2]) {
        try {
          const folder = DriveApp.getFolderById(data[i][2]);
          return { folder: folder, id: data[i][2], url: data[i][3] };
        } catch (e) {
          // Folder di drive terhapus/tidak valid, buat baru dan perbarui baris yang ada
        }
      }
      break;
    }
  }

  // Jika belum ada di Drive atau perlu dibuat ulang
  const rootFolder = getOrCreateRootFolder();
  const folderName = "[" + cleanSchool + "] - Arsip PantauSekolah";
  const schoolFolder = rootFolder.createFolder(folderName);
  schoolFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Buat subfolder standar: 01_Laporan_Kepsek & 02_Laporan_Guru
  const fKepsek = schoolFolder.createFolder("01_Laporan_Kepsek");
  const fGuru = schoolFolder.createFolder("02_Laporan_Guru");
  fKepsek.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  fGuru.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const folderId = schoolFolder.getId();
  const folderUrl = schoolFolder.getUrl();

  if (existingRowIndex > 0) {
    // Perbarui baris yang sudah ada, JANGAN menambah baris duplikat!
    sheetSekolah.getRange(existingRowIndex, 3, 1, 2).setValues([[folderId, folderUrl]]);
  } else {
    // Catat baris baru ke sheet Sekolah
    const newId = "SCH-" + ("000" + (sheetSekolah.getLastRow())).slice(-3);
    sheetSekolah.appendRow([newId, cleanSchool, folderId, folderUrl, new Date()]);
  }

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
      if (status.toLowerCase() === "nonaktif" || status.toLowerCase() === "dihapus") {
        return jsonResponse({ status: "error", message: "Akun Anda telah dinonaktifkan atau dihapus oleh Pengawas." });
      }

      // Validasi apakah sekolah binaan masih aktif atau sudah dihapus total oleh pengawas
      if (role !== "Pengawas" && asalSekolah && asalSekolah.toLowerCase() !== "dinas pendidikan" && asalSekolah.toLowerCase() !== "dinas") {
        const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
        if (sheetSekolah) {
          const sRows = sheetSekolah.getDataRange().getValues();
          let sFound = false;
          for (let sIdx = 1; sIdx < sRows.length; sIdx++) {
            if (sRows[sIdx][1] && sRows[sIdx][1].toString().trim().toLowerCase() === asalSekolah.trim().toLowerCase()) {
              sFound = true;
              break;
            }
          }
          if (!sFound) {
            return jsonResponse({
              status: "error",
              message: "Sekolah binaan '" + asalSekolah + "' telah dihapus total oleh Pengawas. Akun ini tidak dapat digunakan lagi."
            });
          }
        }
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
    // - Kepala Sekolah dapat melihat Guru dari sekolahnya sendiri serta akun Kepala Sekolah sendiri
    // - Guru dapat melihat akun dirinya sendiri
    if (requesterRole === "Pengawas") {
      userList.push({ id, username, nama, role, asalSekolah, status, driveUrl, createdAt });
    } else if (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek") {
      if ((role === "Guru" || role === "Kepala Sekolah" || role === "Kepsek") && (asalSekolah || "").toLowerCase() === requesterSchool.toLowerCase()) {
        userList.push({ id, username, nama, role, asalSekolah, status, driveUrl, createdAt });
      }
    } else if (requesterRole === "Guru") {
      const reqUName = (data.currentUsername || data.username || "").toString().trim().toLowerCase();
      if ((username || "").toString().trim().toLowerCase() === reqUName) {
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

function handleCreateUsersBatch(data) {
  const requesterRole = data.currentUserRole;
  const requesterSchool = data.currentUserSchool;
  const rawUsers = data.users || [];

  if (!Array.isArray(rawUsers) || rawUsers.length === 0) {
    return jsonResponse({ status: "error", message: "Data pengguna dalam berkas tidak ditemukan atau kosong." });
  }

  // Validasi Hak Akses:
  const isPengawas = requesterRole === "Pengawas";
  const isKepsek = requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek";

  if (!isPengawas && !isKepsek) {
    return jsonResponse({ status: "error", message: "Anda tidak memiliki wewenang untuk mendaftarkan pengguna." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const rows = sheetUsers.getDataRange().getValues();

  // Kumpulkan username yang sudah ada untuk mencegah duplikasi
  const existingUsernames = new Set();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1]) {
      existingUsernames.add(rows[i][1].toString().toLowerCase().trim());
    }
  }

  // Cache folder sekolah agar tidak getOrCreate berulang kali dalam satu batch
  const schoolFolderCache = {};

  const rowsToAppend = [];
  let successCount = 0;
  let skippedCount = 0;
  let lastRowIndex = sheetUsers.getLastRow();

  const now = new Date();

  rawUsers.forEach(u => {
    const nama = (u.nama || "").toString().trim();
    const username = (u.username || "").toString().trim().replace(/^@/, "");
    let password = (u.password || "").toString().trim();
    let role = (u.role || "Guru").toString().trim();
    let asalSekolah = (u.asal_sekolah || "").toString().trim();

    // Jika peminta adalah Kepala Sekolah, batasi hanya Guru di sekolahnya sendiri
    if (isKepsek) {
      role = "Guru";
      asalSekolah = requesterSchool;
    }

    if (!nama || !username) {
      skippedCount++;
      return;
    }

    const uLower = username.toLowerCase();
    if (existingUsernames.has(uLower)) {
      skippedCount++;
      return;
    }

    existingUsernames.add(uLower);

    if (!password) {
      password = "pass" + Math.floor(1000 + Math.random() * 9000);
    }

    // Ambil/buat folder sekolah jika ada
    let userDriveFolderId = "";
    let userDriveFolderUrl = "";
    if (asalSekolah) {
      if (!schoolFolderCache[asalSekolah]) {
        try {
          schoolFolderCache[asalSekolah] = getOrCreateSchoolFolder(asalSekolah);
        } catch (e) {
          schoolFolderCache[asalSekolah] = { id: "", url: "" };
        }
      }
      const sf = schoolFolderCache[asalSekolah];
      userDriveFolderId = sf.id || "";
      userDriveFolderUrl = sf.url || "";
    }

    // Hash Password
    const salt = generateSalt(8);
    const passwordHash = hashPassword(password, salt);

    lastRowIndex++;
    const newUserId = "USR-" + ("000" + lastRowIndex).slice(-3);

    rowsToAppend.push([
      newUserId,
      username,
      passwordHash,
      salt,
      nama,
      role,
      asalSekolah,
      "Aktif",
      userDriveFolderId,
      userDriveFolderUrl,
      now
    ]);

    successCount++;
  });

  if (rowsToAppend.length > 0) {
    const startRow = sheetUsers.getLastRow() + 1;
    const numRows = rowsToAppend.length;
    const numCols = rowsToAppend[0].length;
    sheetUsers.getRange(startRow, 1, numRows, numCols).setValues(rowsToAppend);

    recordAuditLog(
      data.currentUserName || (isPengawas ? "Pengawas" : "Kepala Sekolah"),
      data.currentUserUsername || "-",
      requesterRole,
      requesterSchool || "-",
      "Import Pengguna Batch",
      "Mendaftarkan massal " + successCount + " pengguna baru via Excel/Spreadsheet",
      "Jumlah Berhasil: " + successCount + " • Dilewati: " + skippedCount
    );
  }

  return jsonResponse({
    status: "success",
    message: "Berhasil mengimpor " + successCount + " pengguna baru" + (skippedCount > 0 ? " (" + skippedCount + " dilewati karena duplikat/tidak lengkap)" : "") + ".",
    createdCount: successCount,
    skippedCount: skippedCount
  });
}

function handleUpdateUser(data) {
  const userId = (data.userId || "").toString().trim();
  const requesterRole = data.currentUserRole;

  if (requesterRole !== "Pengawas") {
    return jsonResponse({ status: "error", message: "Hanya Pengawas yang berwenang mengubah data pengguna." });
  }

  if (!userId) {
    return jsonResponse({ status: "error", message: "ID Pengguna wajib diisi." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const rows = sheetUsers.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toString().trim() === userId) {
      const oldUName = rows[i][1] ? rows[i][1].toString().trim() : "";
      const newUName = (data.username || oldUName).toString().trim();
      const newNama = (data.nama || rows[i][4] || "").toString().trim();
      const newRole = (data.role || rows[i][5] || "Guru").toString().trim();
      const newSchool = (data.asal_sekolah !== undefined ? data.asal_sekolah : (rows[i][6] || "")).toString().trim();
      const newStatus = (data.status || rows[i][7] || "Aktif").toString().trim();

      // Cek keunikan username jika diganti
      if (newUName.toLowerCase() !== oldUName.toLowerCase()) {
        for (let j = 1; j < rows.length; j++) {
          if (j !== i && rows[j][1] && rows[j][1].toString().toLowerCase() === newUName.toLowerCase()) {
            return jsonResponse({ status: "error", message: "Username '" + newUName + "' sudah digunakan oleh akun lain." });
          }
        }
      }

      // Update kolom pada sheet:
      // Col 2: Username, Col 5: Nama, Col 6: Role, Col 7: Asal Sekolah, Col 8: Status
      sheetUsers.getRange(i + 1, 2).setValue(newUName);
      sheetUsers.getRange(i + 1, 5).setValue(newNama);
      sheetUsers.getRange(i + 1, 6).setValue(newRole);
      sheetUsers.getRange(i + 1, 7).setValue(newSchool);
      sheetUsers.getRange(i + 1, 8).setValue(newStatus);

      // Jika diisi password baru, hash dan simpan
      if (data.password && data.password.toString().trim().length >= 5) {
        const salt = generateSalt(8);
        const hash = hashPassword(data.password.toString().trim(), salt);
        sheetUsers.getRange(i + 1, 3).setValue(hash);
        sheetUsers.getRange(i + 1, 4).setValue(salt);
      }

      recordAuditLog(
        data.currentUserName || "Pengawas",
        data.currentUserUsername || "-",
        "Pengawas",
        "-",
        "Edit Pengguna",
        "Mengubah data pengguna @" + newUName + " (" + newNama + ")",
        "ID: " + userId + " • Peran: " + newRole + " • Sekolah: " + newSchool + " • Status: " + newStatus
      );

      return jsonResponse({
        status: "success",
        message: "Data pengguna @" + newUName + " berhasil diperbarui."
      });
    }
  }

  return jsonResponse({ status: "error", message: "Pengguna dengan ID " + userId + " tidak ditemukan." });
}

function handleDeleteUser(data) {
  const requesterRole = data.currentUserRole;

  if (requesterRole !== "Pengawas") {
    return jsonResponse({ status: "error", message: "Hanya Pengawas yang dapat menghapus pengguna." });
  }

  // Mendukung single userId maupun batch userIds (bisa mencakup ID unik maupun username)
  let targetIds = [];
  if (Array.isArray(data.userIds) && data.userIds.length > 0) {
    targetIds = data.userIds.map(id => id.toString().trim());
  } else if (data.userId) {
    targetIds = [data.userId.toString().trim()];
  }

  let targetUsernames = [];
  if (Array.isArray(data.usernames) && data.usernames.length > 0) {
    targetUsernames = data.usernames.map(u => u.toString().trim().toLowerCase());
  } else if (data.username) {
    targetUsernames = [data.username.toString().trim().toLowerCase()];
  }

  if (targetIds.length === 0 && targetUsernames.length === 0) {
    return jsonResponse({ status: "error", message: "Tidak ada ID Pengguna yang dipilih." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const rows = sheetUsers.getDataRange().getValues();
  const idSet = new Set(targetIds);
  const usernameSet = new Set(targetUsernames);

  let deletedCount = 0;
  let deletedInfo = [];
  let deletedSchools = [];

  // Loop mundur dari bawah ke atas agar penghapusan baris tidak merusak indeks
  for (let i = rows.length - 1; i >= 1; i--) {
    const rowId = rows[i][0] ? rows[i][0].toString().trim() : "";
    const rowUName = rows[i][1] ? rows[i][1].toString().trim() : "";
    const rowUNameLower = rowUName.toLowerCase();

    const isMatch = (rowId && idSet.has(rowId)) || (rowUNameLower && (idSet.has(rowUNameLower) || usernameSet.has(rowUNameLower)));

    if (isMatch) {
      const delNama = rows[i][4] || "-";
      const delRole = rows[i][5] || "-";
      const delSchool = rows[i][6] || "-";

      if (delSchool && delSchool !== "-" && delSchool.toLowerCase() !== "dinas pendidikan") {
        deletedSchools.push(delSchool);
      }

      sheetUsers.deleteRow(i + 1);
      deletedCount++;
      deletedInfo.push("@" + rowUName + " (" + delNama + ")");
    }
  }

  // Jika opsi deleteSchool disertakan (misalnya Pengawas memilih hapus total sekolah bersama kepsek)
  if (data.deleteSchool && deletedSchools.length > 0) {
    const uniqueSchools = Array.from(new Set(deletedSchools));
    uniqueSchools.forEach(function(sch) {
      try {
        handleDeleteSchool({
          currentUserRole: "Pengawas",
          schoolName: sch,
          currentUserName: data.currentUserName || "Pengawas"
        });
      } catch (e) {}
    });
  }

  if (deletedCount > 0) {
    recordAuditLog(
      data.currentUserName || "Pengawas",
      data.currentUserUsername || "-",
      "Pengawas",
      "-",
      "Hapus Pengguna",
      "Menghapus " + deletedCount + " pengguna: " + deletedInfo.slice(0, 3).join(", ") + (deletedInfo.length > 3 ? "..." : ""),
      "Total Akun Dihapus: " + deletedCount
    );

    return jsonResponse({
      status: "success",
      message: deletedCount + " pengguna berhasil dihapus dari sistem.",
      deletedCount: deletedCount
    });
  }

  return jsonResponse({ status: "error", message: "Pengguna tidak ditemukan." });
}

/**
 * Hapus Total Sekolah: Menghapus permanen sekolah dari sheet Sekolah, Folder_Drive,
 * akun Users sekolah tersebut, laporan-laporannya, dan memindahkan folder Google Drive ke Sampah (Trash)
 */
function handleDeleteSchool(data) {
  const requesterRole = data.currentUserRole;
  if (requesterRole !== "Pengawas") {
    return jsonResponse({ status: "error", message: "Hanya Pengawas yang berhak menghapus total folder sekolah." });
  }

  const schoolName = (data.schoolName || "").trim();
  if (!schoolName || schoolName.toLowerCase() === "dinas pendidikan" || schoolName.toLowerCase() === "dinas") {
    return jsonResponse({ status: "error", message: "Nama sekolah tidak valid atau tidak boleh dihapus." });
  }

  const cleanSchool = schoolName;
  const sLower = cleanSchool.toLowerCase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let driveFolderIdsToTrash = [];

  // 1. Hapus dari sheet SEKOLAH & ambil folder ID Google Drive
  const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
  if (sheetSekolah) {
    const sRows = sheetSekolah.getDataRange().getValues();
    for (let i = sRows.length - 1; i >= 1; i--) {
      const rowSchool = (sRows[i][1] || "").toString().trim().toLowerCase();
      if (rowSchool === sLower) {
        const fId = sRows[i][2] ? sRows[i][2].toString().trim() : "";
        if (fId) driveFolderIdsToTrash.push(fId);
        sheetSekolah.deleteRow(i + 1);
      }
    }
  }

  // 2. Hapus dari sheet FOLDER DRIVE
  const sheetFolder = ss.getSheetByName(SHEET_FOLDER_DRIVE);
  if (sheetFolder) {
    const fRows = sheetFolder.getDataRange().getValues();
    for (let i = fRows.length - 1; i >= 1; i--) {
      const rowSchool = (fRows[i][2] || "").toString().trim().toLowerCase();
      if (rowSchool === sLower) {
        const fId = fRows[i][4] ? fRows[i][4].toString().trim() : "";
        if (fId) driveFolderIdsToTrash.push(fId);
        sheetFolder.deleteRow(i + 1);
      }
    }
  }

  // 3. Hapus akun pengguna (Kepala Sekolah & Guru) yang terafiliasi dengan sekolah ini
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  let deletedUsersCount = 0;
  if (sheetUsers) {
    const uRows = sheetUsers.getDataRange().getValues();
    for (let i = uRows.length - 1; i >= 1; i--) {
      const rowSchool = (uRows[i][6] || "").toString().trim().toLowerCase();
      if (rowSchool === sLower) {
        sheetUsers.deleteRow(i + 1);
        deletedUsersCount++;
      }
    }
  }

  // 4. Hapus berkas laporan kepsek & guru dari sekolah ini
  const sheetKepsek = ss.getSheetByName(SHEET_LAPORAN_KEPSEK);
  if (sheetKepsek) {
    const kRows = sheetKepsek.getDataRange().getValues();
    for (let i = kRows.length - 1; i >= 1; i--) {
      const rowSchool = (kRows[i][7] || "").toString().trim().toLowerCase();
      if (rowSchool === sLower) {
        sheetKepsek.deleteRow(i + 1);
      }
    }
  }

  const sheetGuru = ss.getSheetByName(SHEET_LAPORAN_GURU);
  if (sheetGuru) {
    const gRows = sheetGuru.getDataRange().getValues();
    for (let i = gRows.length - 1; i >= 1; i--) {
      const rowSchool = (gRows[i][7] || "").toString().trim().toLowerCase();
      if (rowSchool === sLower) {
        sheetGuru.deleteRow(i + 1);
      }
    }
  }

  // 5. Pindahkan folder sekolah di Google Drive ke Sampah (Trash)
  driveFolderIdsToTrash.forEach(function(fId) {
    try {
      const f = DriveApp.getFolderById(fId);
      f.setTrashed(true);
    } catch (e) {}
  });

  // Cari juga di folder root jika ada nama folder persis "[schoolName] - Arsip PantauSekolah"
  try {
    const rootFolder = getOrCreateRootFolder();
    const exactFolders = rootFolder.getFoldersByName("[" + cleanSchool + "] - Arsip PantauSekolah");
    while (exactFolders.hasNext()) {
      try {
        exactFolders.next().setTrashed(true);
      } catch (e) {}
    }
  } catch (e) {}

  // 6. Catat Audit Log
  recordAuditLog(
    data.currentUserName || "Pengawas",
    data.currentUserUsername || "-",
    "Pengawas",
    cleanSchool,
    "Hapus Total Sekolah",
    "Menghapus permanen sekolah '" + cleanSchool + "' beserta seluruh folder Google Drive, akun, dan dokumennya.",
    "Status: Dihapus Total • Akun Dihapus: " + deletedUsersCount
  );

  return jsonResponse({
    status: "success",
    message: "Sekolah '" + cleanSchool + "' beserta seluruh folder Drive dan datanya berhasil dihapus total dari sistem."
  });
}

function handleResetPassword(data) {
  const newPassword = (data.new_password || "").trim();
  const asalSekolah = (data.asal_sekolah || "").trim();
  const requesterRole = data.currentUserRole || "";

  // Dukungan single username maupun batch usernames (maksimal 2 akun)
  let targetUsernames = [];
  if (Array.isArray(data.usernames) && data.usernames.length > 0) {
    if (data.usernames.length > 2) {
      return jsonResponse({
        status: "error",
        message: "Reset password tidak bisa dipilih sekaligus lebih dari 2 akun! Silakan pilih maksimal 2 akun."
      });
    }
    targetUsernames = data.usernames.map(u => u.toString().trim());
  } else if (data.username) {
    targetUsernames = [data.username.toString().trim()];
  }

  if (targetUsernames.length === 0) {
    return jsonResponse({ status: "error", message: "Username wajib diisi!" });
  }
  if (!newPassword || newPassword.length < 5) {
    return jsonResponse({ status: "error", message: "Password baru minimal terdiri dari 5 karakter!" });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  const rows = sheetUsers.getDataRange().getValues();
  const targetSet = new Set(targetUsernames.map(u => u.toLowerCase()));

  let successList = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const uName = (row[1] || "").toString().trim();
    const uNama = (row[4] || "").toString().trim();
    const uRole = (row[5] || "").toString().trim();
    const uSekolah = (row[6] || "").toString().trim();
    const uStatus = (row[7] || "Aktif").toString().trim();

    if (targetSet.has(uName.toLowerCase())) {
      if (uStatus.toLowerCase() === "nonaktif") {
        continue;
      }

      // Verifikasi identitas jika bukan Pengawas yang mereset
      if (requesterRole !== "Pengawas" && asalSekolah) {
        const cleanReqSekolah = asalSekolah.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanDbSekolah = uSekolah.toLowerCase().replace(/[^a-z0-9]/g, "");

        if (!cleanDbSekolah.includes(cleanReqSekolah) && !cleanReqSekolah.includes(cleanDbSekolah)) {
          continue;
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

      successList.push("@" + uName);
    }
  }

  if (successList.length > 0) {
    return jsonResponse({
      status: "success",
      message: "Password untuk " + successList.join(", ") + " berhasil diperbarui!",
      updatedCount: successList.length
    });
  }

  return jsonResponse({ status: "error", message: "Akun yang dipilih tidak ditemukan dalam sistem." });
}

// =============================================================================
// 5. MANAJEMEN FOLDER GOOGLE DRIVE (Single & Batch All Schools)
// =============================================================================

/**
 * Mengambil atau mendaftarkan otomatis semua sekolah dari Users & Laporan ke Sheet Sekolah
 */
function getOrRegisterAllSchools(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();

  // Self-healing: bersihkan baris duplikasi nama sekolah di spreadsheet
  cleanDuplicateSchoolRows(ss);

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
      const lower = sName.toLowerCase();
      if (existingSchoolNames[lower]) {
        continue; // Lewati jika nama sekolah sudah pernah tercatat sebelumnya (mencegah duplikasi baris)
      }
      existingSchoolNames[lower] = true;
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
  // Self-heal duplikasi sekolah dan folder drive sebelum proses pembuatan
  cleanDuplicateSchoolRows(ss);
  cleanDuplicateFolderDriveRows(ss);

  const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
  const sheetFolderDrive = ss.getSheetByName(SHEET_FOLDER_DRIVE);

  // Ambil daftar sekolah unik yang sudah ternormalisasi & terdaftar
  const allRegisteredSchools = getOrRegisterAllSchools(ss);

  let schoolsToProcess = [];
  const processedNames = {};

  if (targetType === "all") {
    allRegisteredSchools.forEach(function (sch) {
      const sName = (sch.nama || "").trim();
      const lower = sName.toLowerCase();
      if (sName && lower !== "dinas pendidikan" && lower !== "dinas" && !processedNames[lower]) {
        processedNames[lower] = true;
        schoolsToProcess.push({
          nama: sName,
          folderId: sch.driveFolderId || ""
        });
      }
    });

    if (schoolsToProcess.length === 0) {
      return jsonResponse({ status: "error", message: "Belum ada sekolah yang terdaftar di sistem." });
    }
  } else {
    // Single school
    const lowerTarget = targetSchool.toLowerCase();
    const foundSchool = allRegisteredSchools.find(function (s) {
      return (s.nama || "").trim().toLowerCase() === lowerTarget;
    });

    if (foundSchool) {
      schoolsToProcess.push({
        nama: foundSchool.nama,
        folderId: foundSchool.driveFolderId || ""
      });
    } else {
      const newSch = getOrCreateSchoolFolder(targetSchool);
      schoolsToProcess.push({ nama: targetSchool, folderId: newSch.id });
    }
  }

  let createdList = [];

  // Baca sheetFolderDrive sekali saja di awal untuk lookup cepat & hitung max ID
  const existingFolderRows = sheetFolderDrive.getDataRange().getValues();
  let maxIdNum = 0;
  const existingFolderMap = {}; // key: lower(folderName) + "|||" + lower(schoolName) + "|||" + lower(subCategory)

  for (let i = 1; i < existingFolderRows.length; i++) {
    const idVal = existingFolderRows[i][0] ? existingFolderRows[i][0].toString() : "";
    const rowFldName = existingFolderRows[i][1] ? existingFolderRows[i][1].toString().trim() : "";
    const rowSchool = existingFolderRows[i][2] ? existingFolderRows[i][2].toString().trim() : "";
    const rowSub = (existingFolderRows[i][7] || "guru").toString().trim().toLowerCase();

    const m = idVal.match(/FLD-(\d+)/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > maxIdNum) maxIdNum = num;
    }

    if (rowFldName && !rowFldName.startsWith("__DELETED__:") && !idVal.startsWith("DEL-")) {
      const key = rowFldName.toLowerCase() + "|||" + rowSchool.toLowerCase() + "|||" + rowSub;
      existingFolderMap[key] = {
        id: idVal,
        url: existingFolderRows[i][5] || ""
      };
    }
  }
  if (maxIdNum < existingFolderRows.length - 1) {
    maxIdNum = existingFolderRows.length - 1;
  }

  const rowsToAppend = [];
  const startTime = new Date().getTime();
  const MAX_RUNTIME_MS = 50000; // 50 detik batas aman Apps Script

  for (let sIdx = 0; sIdx < schoolsToProcess.length; sIdx++) {
    const sch = schoolsToProcess[sIdx];

    // Safety check batas waktu eksekusi agar tidak timeout fatal
    if (new Date().getTime() - startTime > MAX_RUNTIME_MS) {
      break;
    }

    try {
      const folderKey = folderName.toLowerCase() + "|||" + sch.nama.toLowerCase() + "|||" + subCategory.toLowerCase();

      // Cek apakah folder ini sudah pernah dibuat sebelumnya untuk sekolah ini
      if (existingFolderMap[folderKey]) {
        createdList.push({
          id: existingFolderMap[folderKey].id,
          sekolah: sch.nama,
          folderName: folderName,
          url: existingFolderMap[folderKey].url,
          subCategory: subCategory,
          alreadyExisted: true
        });
        continue;
      }

      // Pastikan parent school folder valid
      let parentSchoolFolder = null;
      if (sch.folderId) {
        try {
          parentSchoolFolder = DriveApp.getFolderById(sch.folderId);
        } catch (eErr) {
          parentSchoolFolder = null;
        }
      }
      if (!parentSchoolFolder) {
        const repaired = getOrCreateSchoolFolder(sch.nama);
        sch.folderId = repaired.id;
        parentSchoolFolder = repaired.folder;
      }

      let targetParent = parentSchoolFolder;
      if (subCategory === "kepsek") {
        const sub = parentSchoolFolder.getFoldersByName("01_Laporan_Kepsek");
        if (sub.hasNext()) {
          targetParent = sub.next();
        } else {
          targetParent = parentSchoolFolder.createFolder("01_Laporan_Kepsek");
        }
      } else if (subCategory === "guru") {
        const sub = parentSchoolFolder.getFoldersByName("02_Laporan_Guru");
        if (sub.hasNext()) {
          targetParent = sub.next();
        } else {
          targetParent = parentSchoolFolder.createFolder("02_Laporan_Guru");
        }
      }

      // Cari apakah folder dengan nama yang sama sudah ada di dalam targetParent Drive
      let newFolder = null;
      const existingInDrive = targetParent.getFoldersByName(folderName);
      if (existingInDrive.hasNext()) {
        newFolder = existingInDrive.next();
      } else {
        newFolder = targetParent.createFolder(folderName);
      }

      maxIdNum++;
      const newId = "FLD-" + ("000" + maxIdNum).slice(-3);
      const newUrl = newFolder.getUrl();

      rowsToAppend.push([
        newId, folderName, sch.nama, targetType, newFolder.getId(), newUrl, new Date(), subCategory
      ]);

      existingFolderMap[folderKey] = { id: newId, url: newUrl };

      createdList.push({
        id: newId,
        sekolah: sch.nama,
        folderName: folderName,
        url: newUrl,
        subCategory: subCategory
      });
    } catch (e) {
      // Abaikan error pada satu sekolah dan lanjutkan sekolah berikutnya
    }
  }

  // Tulis baris baru ke sheet
  if (rowsToAppend.length > 0) {
    rowsToAppend.forEach(function (r) {
      sheetFolderDrive.appendRow(r);
    });
  }

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
    message: "Berhasil memproses folder '" + folderName + "' untuk " + createdList.length + " sekolah.",
    results: createdList
  });
}

function handleGetDriveFolders(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetFolder = ss.getSheetByName(SHEET_FOLDER_DRIVE);
  const rows = sheetFolder.getDataRange().getValues();

  let folders = [];
  const seenKeys = {};

  for (let i = 1; i < rows.length; i++) {
    const fId = rows[i][0] ? rows[i][0].toString().trim() : "";
    const fName = rows[i][1] ? rows[i][1].toString().trim() : "";
    const fSchool = rows[i][2] ? rows[i][2].toString().trim() : "";
    const fSub = (rows[i][7] || "guru").toString().trim().toLowerCase();

    if (!fName || fName.startsWith("__DELETED__:") || fId.startsWith("DEL-")) continue;

    // Deduplikasi tampilan folder jika ada data duplikat di spreadsheet
    const key = fName.toLowerCase() + "|||" + fSchool.toLowerCase() + "|||" + fSub;
    if (seenKeys[key]) continue;
    seenKeys[key] = true;

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
  const requesterRole = data.currentUserRole;
  const requesterSchool = (data.currentUserSchool || data.asal_sekolah || "").trim();
  const isPengawas = (requesterRole === "Pengawas");
  const isKepsek = (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek");

  if (!isPengawas && !isKepsek) {
    return jsonResponse({ status: "error", message: "Hanya Pengawas dan Kepala Sekolah yang berwenang menghapus folder Drive." });
  }

  let targetFolderIds = [];
  if (Array.isArray(data.folderIds) && data.folderIds.length > 0) {
    targetFolderIds = data.folderIds.map(id => id.toString().trim());
  } else if (data.folderId) {
    targetFolderIds = [data.folderId.toString().trim()];
  }

  if (targetFolderIds.length === 0) {
    return jsonResponse({ status: "error", message: "ID Folder tidak valid." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetFolder = ss.getSheetByName(SHEET_FOLDER_DRIVE);
  const rows = sheetFolder.getDataRange().getValues();
  const idSet = new Set(targetFolderIds);
  const targetSchool = (data.schoolName || data.targetSchool || "").trim();

  let deletedCount = 0;
  let deletedNames = [];

  for (let i = rows.length - 1; i >= 1; i--) {
    const rowId = rows[i][0] ? rows[i][0].toString().trim() : "";
    if (rowId && idSet.has(rowId)) {
      const rowSchool = rows[i][2] ? rows[i][2].toString().trim() : "";
      if (targetSchool && rowSchool && rowSchool.toLowerCase() !== targetSchool.toLowerCase()) {
        continue;
      }

      const subCategory = (rows[i][7] || "guru").toString().toLowerCase();
      if (!isPengawas && subCategory === "kepsek") {
        continue; // Kepsek tidak berwenang hapus folder kepsek
      }
      if (isKepsek && requesterSchool && rowSchool && rowSchool.toLowerCase() !== requesterSchool.toLowerCase()) {
        continue;
      }

      const driveFolderId = rows[i][4];
      try {
        if (driveFolderId) {
          DriveApp.getFolderById(driveFolderId).setTrashed(true);
        }
      } catch (e) {}

      const delFolderName = rows[i][1] || "-";
      sheetFolder.deleteRow(i + 1);
      deletedCount++;
      deletedNames.push(delFolderName);
    }
  }

  if (deletedCount > 0) {
    recordAuditLog(
      data.currentUserName || "Pengawas",
      data.currentUserUsername || "-",
      requesterRole,
      requesterSchool || "-",
      "Hapus Folder",
      "Menghapus " + deletedCount + " folder: " + deletedNames.slice(0, 3).join(", "),
      "Total Folder Dihapus: " + deletedCount
    );

    return jsonResponse({ status: "success", message: deletedCount + " folder berhasil dihapus.", deletedCount: deletedCount });
  }

  return jsonResponse({ status: "error", message: "Folder tidak ditemukan atau Anda tidak berwenang menghapusnya." });
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

/**
 * Memvalidasi apakah akun dan sekolah pengguna yang meminta sinkronisasi masih aktif di database.
 * Jika akun telah dihapus atau dinonaktifkan oleh Pengawas, atau sekolahnya telah dihapus permanen,
 * kembalikan status session_terminated agar sesi di browser pengguna otomatis diakhiri (force logout).
 */
function validateUserAccountActive(ss, username, role, school) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (role === "Pengawas") return { active: true };
  if (!username) return { active: true };

  const uLower = username.toString().trim().toLowerCase();
  const sLower = (school || "").toString().trim().toLowerCase();

  // 1. Cek keberadaan akun di sheet Users
  const sheetUsers = ss.getSheetByName(SHEET_USERS);
  if (sheetUsers) {
    const uRows = sheetUsers.getDataRange().getValues();
    let found = false;
    let isNonaktif = false;

    for (let i = 1; i < uRows.length; i++) {
      const rowUName = (uRows[i][1] || "").toString().trim().toLowerCase();
      if (rowUName === uLower) {
        found = true;
        const status = (uRows[i][7] || "Aktif").toString().toLowerCase();
        if (status === "nonaktif" || status === "dihapus") {
          isNonaktif = true;
        }
        break;
      }
    }

    if (!found) {
      return {
        active: false,
        message: "Akun @" + username + " telah dihapus oleh Pengawas dari sistem."
      };
    }
    if (isNonaktif) {
      return {
        active: false,
        message: "Akun @" + username + " telah dinonaktifkan oleh Pengawas."
      };
    }
  }

  // 2. Cek apakah sekolah pengguna masih ada di sheet Sekolah (jika bukan dinas)
  if (sLower && sLower !== "dinas pendidikan" && sLower !== "dinas") {
    const sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
    if (sheetSekolah) {
      const sRows = sheetSekolah.getDataRange().getValues();
      let sFound = false;
      for (let i = 1; i < sRows.length; i++) {
        const sch = (sRows[i][1] || "").toString().trim().toLowerCase();
        if (sch === sLower) {
          sFound = true;
          break;
        }
      }
      if (!sFound) {
        return {
          active: false,
          message: "Sekolah binaan '" + school + "' telah dihapus total oleh Pengawas."
        };
      }
    }
  }

  return { active: true };
}

function handleGetDashboardData(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Validasi sesi aktif pengguna non-pengawas
  const reqRole = data.currentUserRole || data.role || "";
  const reqUsername = data.currentUsername || data.username || "";
  const reqSchool = data.asal_sekolah || data.asalSekolah || "";
  if (reqRole !== "Pengawas" && reqUsername) {
    const validation = validateUserAccountActive(ss, reqUsername, reqRole, reqSchool);
    if (!validation.active) {
      return jsonResponse({
        status: "session_terminated",
        message: validation.message
      });
    }
  }

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
  let hiddenDefaultFolders = [];
  const seenDashFolderKeys = {};

  for (let i = 1; i < rawFolder.length; i++) {
    const r = rawFolder[i];
    const fId = r[0] ? r[0].toString() : "";
    const fName = r[1] ? r[1].toString().trim() : "";
    const fSchool = r[2] ? r[2].toString().trim() : "";
    const fSub = (r[7] || "guru").toString().trim().toLowerCase();

    // Catat penanda folder default yang dihapus / disembunyikan
    if (fName.startsWith("__DELETED__:")) {
      const type = fName.replace("__DELETED__:", "").trim().toLowerCase();
      if (type) {
        if (fSchool && fSchool.toLowerCase() !== "semua" && fSchool.toLowerCase() !== "all") {
          hiddenDefaultFolders.push(fSchool.toLowerCase() + ":" + type);
        } else {
          hiddenDefaultFolders.push("all:" + type);
        }
      }
      continue;
    }

    if (!fName || fId.startsWith("DEL-")) continue;

    const key = fName.toLowerCase() + "|||" + fSchool.toLowerCase() + "|||" + fSub;
    if (seenDashFolderKeys[key]) continue;
    seenDashFolderKeys[key] = true;

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
    hiddenDefaultFolders: hiddenDefaultFolders,
    auditLogs: isPengawas ? getAuditLogsList(ss) : []
  });
}

/**
 * Super Fast Master Sync: Membaca seluruh data sekaligus dalam 1 request batch
 */
function handleSyncAll(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Validasi sesi aktif pengguna non-pengawas
  const reqRole = data.currentUserRole || data.role || "";
  const reqUsername = data.currentUsername || data.username || "";
  const reqSchool = data.asal_sekolah || data.asalSekolah || "";
  if (reqRole !== "Pengawas" && reqUsername) {
    const validation = validateUserAccountActive(ss, reqUsername, reqRole, reqSchool);
    if (!validation.active) {
      return jsonResponse({
        status: "session_terminated",
        message: validation.message
      });
    }
  }

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
  let hiddenDefaultFolders = [];
  const seenSyncFolderKeys = {};
  for (let i = 1; i < rawFolder.length; i++) {
    const r = rawFolder[i];
    const fId = r[0] ? r[0].toString() : "";
    const fName = r[1] ? r[1].toString().trim() : "";
    const fSchool = r[2] ? r[2].toString().trim() : "";
    const fSub = (r[7] || "guru").toString().trim().toLowerCase();

    // Catat penanda folder default yang dihapus / disembunyikan
    if (fName.startsWith("__DELETED__:")) {
      const type = fName.replace("__DELETED__:", "").trim().toLowerCase();
      if (type) {
        if (fSchool && fSchool.toLowerCase() !== "semua" && fSchool.toLowerCase() !== "all") {
          hiddenDefaultFolders.push(fSchool.toLowerCase() + ":" + type);
        } else {
          hiddenDefaultFolders.push("all:" + type);
        }
      }
      continue;
    }

    if (!fName || fId.startsWith("DEL-")) continue;

    const key = fName.toLowerCase() + "|||" + fSchool.toLowerCase() + "|||" + fSub;
    if (seenSyncFolderKeys[key]) continue;
    seenSyncFolderKeys[key] = true;

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
    hiddenDefaultFolders: hiddenDefaultFolders,
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
  let targetIds = [];
  if (Array.isArray(data.idLaporans) && data.idLaporans.length > 0) {
    targetIds = data.idLaporans.map(id => id.toString().trim());
  } else if (data.idLaporan) {
    targetIds = [data.idLaporan.toString().trim()];
  }

  const targetSheetName = data.targetSheet;
  const requesterRole = data.currentUserRole || "Guru";
  const requesterName = (data.currentUserName || "").trim();
  const requesterSchool = (data.currentUserSchool || "").trim();

  if (targetIds.length === 0) {
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

  const idSet = new Set(targetIds);
  let deletedCount = 0;
  let deletedNames = [];

  const isPengawas = (requesterRole === "Pengawas");

  for (let s = 0; s < sheetsToCheck.length; s++) {
    const sheet = sheetsToCheck[s];
    const rows = sheet.getDataRange().getValues();

    // Loop mundur dari bawah ke atas
    for (let i = rows.length - 1; i >= 1; i--) {
      const rowId = rows[i][0] ? rows[i][0].toString().trim() : "";
      if (rowId && idSet.has(rowId)) {
        const delNamaPengirim = (rows[i][2] || "").toString().trim();
        const delKategori = rows[i][3] || "-";
        const fileUrl = rows[i][4];
        const delSekolah = (rows[i][7] || "").toString().trim();
        const delNamaFile = rows[i][9] || "";

        const isOwner = (requesterName && delNamaPengirim.toLowerCase() === requesterName.toLowerCase());
        const isSchoolKepsek = (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek") &&
                               (requesterSchool && delSekolah.toLowerCase() === requesterSchool.toLowerCase());

        if (!isPengawas && !isOwner && !isSchoolKepsek) {
          continue; // Lewati berkas yang bukan wewenangnya
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
        } catch (e) {}

        // Hapus baris dari sheet
        sheet.deleteRow(i + 1);
        deletedCount++;
        deletedNames.push(rowId);
      }
    }
  }

  if (deletedCount > 0) {
    recordAuditLog(
      requesterName || "Pengguna",
      data.currentUserUsername || "-",
      requesterRole || "-",
      requesterSchool || "-",
      "Hapus Laporan",
      "Menghapus " + deletedCount + " berkas laporan: " + deletedNames.slice(0, 3).join(", "),
      "Total Laporan Dihapus: " + deletedCount
    );

    return jsonResponse({
      status: "success",
      message: deletedCount + " berkas laporan berhasil dihapus dari sistem dan Google Drive!",
      deletedCount: deletedCount
    });
  }

  return jsonResponse({ status: "error", message: "Data berkas laporan tidak ditemukan atau Anda tidak berwenang." });
}

function handleUpdateLaporan(data) {
  const idLaporan = (data.idLaporan || "").toString().trim();
  const targetSheetName = data.targetSheet;
  const requesterRole = data.currentUserRole || "Guru";
  const requesterName = (data.currentUserName || "").trim();
  const requesterSchool = (data.currentUserSchool || "").trim();

  if (!idLaporan) {
    return jsonResponse({ status: "error", message: "ID Laporan tidak valid." });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetsToCheck = [];
  if (targetSheetName && ss.getSheetByName(targetSheetName)) {
    sheetsToCheck.push(ss.getSheetByName(targetSheetName));
  }
  [SHEET_LAPORAN_GURU, SHEET_LAPORAN_KEPSEK].forEach(name => {
    const s = ss.getSheetByName(name);
    if (s && !sheetsToCheck.includes(s)) sheetsToCheck.push(s);
  });

  const isPengawas = (requesterRole === "Pengawas");
  let updatedItem = null;

  for (let s = 0; s < sheetsToCheck.length; s++) {
    const sheet = sheetsToCheck[s];
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      const rowId = rows[i][0] ? rows[i][0].toString().trim() : "";
      if (rowId === idLaporan) {
        const itemUploader = (rows[i][2] || "").toString().trim();
        const itemSchool = (rows[i][7] || "").toString().trim();

        const isOwner = (requesterName && itemUploader.toLowerCase() === requesterName.toLowerCase());
        const isSchoolKepsek = (requesterRole === "Kepala Sekolah" || requesterRole === "Kepsek") &&
                               (requesterSchool && itemSchool.toLowerCase() === requesterSchool.toLowerCase());

        if (!isPengawas && !isOwner && !isSchoolKepsek) {
          return jsonResponse({ status: "error", message: "Anda tidak memiliki izin mengedit laporan ini." });
        }

        // 1. Kategori & JenisPelaporan (Folder)
        if (data.kategori !== undefined && data.kategori !== null) {
          rows[i][3] = data.kategori;
        }
        if (data.jenisPelaporan !== undefined && data.jenisPelaporan !== null) {
          rows[i][8] = data.jenisPelaporan;
        }
        // 2. Poin Penting
        if (data.poinPenting !== undefined && data.poinPenting !== null) {
          rows[i][10] = data.poinPenting;
        }

        // 3. Optional: Ganti Berkas File
        if (data.filebase64 && data.filename) {
          try {
            // Hapus file lama jika ada
            const oldUrl = rows[i][4];
            if (oldUrl) {
              let oldFileId = "";
              const matchD = oldUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
              const matchId = oldUrl.match(/id=([a-zA-Z0-9_-]+)/);
              if (matchD && matchD[1]) oldFileId = matchD[1];
              else if (matchId && matchId[1]) oldFileId = matchId[1];
              if (oldFileId) {
                try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (e) {}
              }
            }

            // Simpan file baru
            const schoolFolderObj = getOrCreateSchoolFolder(itemSchool);
            const schoolFolder = DriveApp.getFolderById(schoolFolderObj.id);
            let targetFolder = schoolFolder;
            const isKep = sheet.getName() === SHEET_LAPORAN_KEPSEK;
            const subFolderName = isKep ? "01_Laporan_Kepsek" : "02_Laporan_Guru";
            const subFolders = schoolFolder.getFoldersByName(subFolderName);
            if (subFolders.hasNext()) targetFolder = subFolders.next();

            const reportFolderType = (data.jenisPelaporan || rows[i][8] || "").trim();
            if (reportFolderType) {
              const specFolders = targetFolder.getFoldersByName(reportFolderType);
              if (specFolders.hasNext()) targetFolder = specFolders.next();
            }

            const contentType = data.mimeType || "application/octet-stream";
            const base64Str = data.filebase64.indexOf(",") > -1 ? data.filebase64.split(",")[1] : data.filebase64;
            const bytes = Utilities.base64Decode(base64Str);
            const blob = Utilities.newBlob(bytes, contentType, data.filename);
            const newFile = targetFolder.createFile(blob);
            newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

            rows[i][4] = newFile.getUrl();
            rows[i][9] = data.filename;
          } catch (eErr) {
            console.error("Gagal mengganti berkas:", eErr);
          }
        }

        // Tulis kembali baris ke sheet
        sheet.getRange(i + 1, 1, 1, rows[i].length).setValues([rows[i]]);

        updatedItem = {
          id: rows[i][0],
          tanggal: rows[i][1] ? Utilities.formatDate(new Date(rows[i][1]), "Asia/Jakarta", "dd/MM/yyyy") : "-",
          nama: rows[i][2],
          kategori: rows[i][3],
          fileUrl: rows[i][4],
          status: rows[i][5],
          catatan: rows[i][6],
          asalSekolah: rows[i][7],
          jenisPelaporan: rows[i][8],
          namaFile: rows[i][9] || "",
          poinPenting: rows[i][10] || ""
        };

        recordAuditLog(
          requesterName || "Pengguna",
          data.currentUserUsername || "-",
          requesterRole,
          requesterSchool || "-",
          "Perbarui Laporan",
          "Memperbarui laporan " + idLaporan + " (" + (data.jenisPelaporan || rows[i][8]) + ")",
          "Kategori: " + rows[i][3] + ", File: " + (rows[i][9] || "-")
        );

        break;
      }
    }
    if (updatedItem) break;
  }

  if (updatedItem) {
    return jsonResponse({
      status: "success",
      message: "Laporan berhasil diperbarui!",
      data: updatedItem
    });
  } else {
    return jsonResponse({ status: "error", message: "Laporan dengan ID " + idLaporan + " tidak ditemukan." });
  }
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
// FITUR AI: GENERATOR LAPORAN PENGAWAS KE DINAS (MODEL: GPT OSS 120B)
// =============================================================================

/**
 * Jalankan fungsi ini SEKALI di editor Apps Script (pilih authorizeUrlFetch lalu klik Run/Jalankan)
 * untuk memicu dialog izin akses UrlFetchApp (https://www.googleapis.com/auth/script.external_request).
 */
function authorizeUrlFetch() {
  const test = UrlFetchApp.fetch("https://httpbin.org/get", {
    muteHttpExceptions: true
  });
  Logger.log("Izin UrlFetchApp berhasil diaktifkan! Status: " + test.getResponseCode());
}

function handleGenerateDinasReportAI(data) {
  try {
    const prompt = data.prompt;
    if (!prompt) {
      return jsonResponse({
        status: "error",
        message: "Prompt data supervisi tidak ditemukan."
      });
    }

    // Ambil API Key dari parameter payload, Script Properties, atau default backend
    let apiKey = (data.apiKey || "").trim();
    if (!apiKey) {
      apiKey = PropertiesService.getScriptProperties().getProperty("AI_API_KEY") ||
               PropertiesService.getScriptProperties().getProperty("OPENROUTER_API_KEY") ||
               getDefaultAiApiKey();
    }

    // Default endpoint OpenRouter untuk model GPT OSS 120B
    const apiUrl = (data.apiUrl || PropertiesService.getScriptProperties().getProperty("AI_API_URL") || "https://openrouter.ai/api/v1/chat/completions").trim();

    // Default model: GPT OSS 120B
    let model = (data.model || PropertiesService.getScriptProperties().getProperty("AI_MODEL") || "openai/gpt-oss-120b").trim();
    if (model.includes(":free")) model = "openai/gpt-oss-120b";

    if (!apiKey) {
      return jsonResponse({
        status: "error",
        message: "API Key untuk GPT OSS 120B belum diatur. Silakan masukkan API Key pada pengaturan AI di aplikasi atau simpan di Script Properties Google Apps Script ('AI_API_KEY'). Kunci gratis dapat dibuat di openrouter.ai/keys."
      });
    }

    const systemPrompt = "Anda adalah Pengawas Sekolah Ahli Madya/Utama Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi di Indonesia. " +
      "Tugas Anda adalah menganalisis data riil hasil supervisi manajerial dan akademik sekolah binaan, " +
      "lalu menyusun naskah formal laporan evaluasi dan rekomendasi kebijakan untuk disampaikan kepada Kepala Dinas Pendidikan. " +
      "Gunakan bahasa dinas formal, lugas, dan terstruktur. " +
      "Keluarkan respon WAJIB berupa JSON valid murni dengan format: {\"temuan\": \"...\", \"rekomendasi\": \"...\"}";

    const payload = {
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.35,
      response_format: { type: "json_object" }
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "https://pantausekolah.app",
        "X-Title": "PantauSekolah - Laporan Pengawas"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    const respCode = response.getResponseCode();
    const respText = response.getContentText();

    if (respCode !== 200) {
      let errMsg = "HTTP " + respCode;
      try {
        const errJson = JSON.parse(respText);
        if (errJson.error && errJson.error.message) {
          errMsg = errJson.error.message;
        }
      } catch (e) {
        errMsg = respText.slice(0, 300);
      }
      return jsonResponse({
        status: "error",
        message: "Gagal memanggil model " + model + " (" + errMsg + ")"
      });
    }

    const result = JSON.parse(respText);
    const candidate = result.choices && result.choices[0] && result.choices[0].message;
    if (!candidate || !candidate.content) {
      return jsonResponse({
        status: "error",
        message: "Respon model GPT OSS 120B kosong."
      });
    }

    let contentText = candidate.content.trim();
    // Bersihkan markdown codeblock jika ada
    if (contentText.startsWith("```json")) {
      contentText = contentText.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (contentText.startsWith("```")) {
      contentText = contentText.replace(/^```/, "").replace(/```$/, "").trim();
    }

    let parsed = null;
    try {
      parsed = JSON.parse(contentText);
    } catch (e) {
      const half = Math.floor(contentText.length / 2);
      parsed = {
        temuan: contentText.slice(0, half).trim(),
        rekomendasi: contentText.slice(half).trim()
      };
    }

    // Catat audit log keberhasilan analisis AI
    try {
      const pengawasNama = data.currentUserName || "Pengawas";
      recordAuditLog(pengawasNama, data.currentUserUsername || "pengawas", "Pengawas", "-", "Analisis AI", "Generate Laporan Dinas via GPT OSS 120B", "Model: " + model);
    } catch (e) {}

    return jsonResponse({
      status: "success",
      temuan: parsed.temuan || "",
      rekomendasi: parsed.rekomendasi || "",
      model: model,
      message: "Laporan dinas berhasil disintesis oleh GPT OSS 120B."
    });

  } catch (err) {
    return jsonResponse({
      status: "error",
      message: "Kesalahan server saat memproses GPT OSS 120B: " + err.toString()
    });
  }
}

/**
 * Asisten AI Percakapan Multirole (Chat PantauBot)
 * Mendukung percakapan multi-turn, format OpenRouter, Google Gemini, dan Script Properties
 */
function handleAiChat(data) {
  try {
    const messages = data.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({
        status: "error",
        message: "Pesan percakapan tidak boleh kosong."
      });
    }

    let apiKey = (data.apiKey || "").trim();
    if (!apiKey) {
      apiKey = PropertiesService.getScriptProperties().getProperty("AI_API_KEY") ||
               PropertiesService.getScriptProperties().getProperty("OPENROUTER_API_KEY") ||
               PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") ||
               getDefaultAiApiKey();
    }

    if (!apiKey) {
      return jsonResponse({
        status: "error",
        message: "API Key belum diatur. Silakan masukkan API Key di menu pengaturan AI atau simpan di Script Properties ('AI_API_KEY')."
      });
    }

    // Dukungan Google Gemini API langsung jika API Key diawali "AIza"
    if (apiKey.startsWith("AIza")) {
      const geminiModel = (data.model || "gemini-1.5-flash").replace("google/", "").replace(":free", "").trim();
      const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel + ":generateContent?key=" + apiKey;

      let contents = [];
      let systemInstruction = "";
      messages.forEach(function(m) {
        if (m.role === "system") {
          systemInstruction += m.content + "\n";
        } else {
          contents.push({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          });
        }
      });

      const geminiPayload = {
        contents: contents
      };
      if (systemInstruction.trim()) {
        geminiPayload.systemInstruction = {
          parts: [{ text: systemInstruction.trim() }]
        };
      }

      const gemOptions = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(geminiPayload),
        muteHttpExceptions: true
      };

      const gemResp = UrlFetchApp.fetch(geminiUrl, gemOptions);
      const gemCode = gemResp.getResponseCode();
      const gemText = gemResp.getContentText();

      if (gemCode !== 200) {
        let errDesc = "HTTP " + gemCode;
        try {
          const parsedErr = JSON.parse(gemText);
          if (parsedErr.error && parsedErr.error.message) errDesc = parsedErr.error.message;
        } catch(e) {}
        return jsonResponse({ status: "error", message: "Google Gemini API error: " + errDesc });
      }

      const gemData = JSON.parse(gemText);
      const gemReply = gemData.candidates && gemData.candidates[0] && gemData.candidates[0].content && gemData.candidates[0].content.parts && gemData.candidates[0].content.parts[0] ? gemData.candidates[0].content.parts[0].text : "";

      return jsonResponse({
        status: "success",
        reply: gemReply.trim(),
        model: geminiModel,
        engine: "Google Gemini"
      });
    }

    // Default endpoint OpenRouter
    const apiUrl = (data.apiUrl || PropertiesService.getScriptProperties().getProperty("AI_API_URL") || "https://openrouter.ai/api/v1/chat/completions").trim();
    let model = (data.model || PropertiesService.getScriptProperties().getProperty("AI_MODEL") || "openai/gpt-oss-120b").trim();
    if (model.includes(":free") && !model.startsWith("google/") && !model.startsWith("meta-llama/")) {
      model = "openai/gpt-oss-120b";
    }

    const payload = {
      model: model,
      messages: messages,
      temperature: 0.6
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "https://pantausekolah.app",
        "X-Title": "PantauSekolah - AI Assistant"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    const respCode = response.getResponseCode();
    const respText = response.getContentText();

    if (respCode !== 200) {
      let errMsg = "HTTP " + respCode;
      try {
        const errJson = JSON.parse(respText);
        if (errJson.error && errJson.error.message) {
          errMsg = errJson.error.message;
        }
      } catch (e) {
        errMsg = respText.slice(0, 300);
      }
      return jsonResponse({
        status: "error",
        message: "Gagal memanggil AI: " + errMsg
      });
    }

    const result = JSON.parse(respText);
    const candidate = result.choices && result.choices[0] && result.choices[0].message;
    if (!candidate || !candidate.content) {
      return jsonResponse({
        status: "error",
        message: "Respon AI kosong."
      });
    }

    return jsonResponse({
      status: "success",
      reply: candidate.content.trim(),
      model: model,
      engine: "OpenRouter"
    });

  } catch (err) {
    return jsonResponse({
      status: "error",
      message: "Kesalahan server saat memproses chat AI: " + err.toString()
    });
  }
}

// =============================================================================
// HELPER: RESPONSE JSON
// =============================================================================

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
