/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: SMART WAREHOUSE ACTION & IMPROVEMENT ENGINE
 * Cloudinary Account: https://res.cloudinary.com/doxv3khr7/image/upload
 * ==============================================================================
 *
 * PETUNJUK PENYIAPAN GOOGLE SPREADSHEET:
 * 1. Buat Google Spreadsheet baru.
 * 2. Beri nama Sheet pertama: "ACTIONS".
 * 3. Buat Header di Baris 1 dengan urutan Kolom A s/d T berikut:
 *
 * [A] ID_ACTION
 * [B] TANGGAL_DIBUAT
 * [C] AREA (RM / BK / CPO / RENTAL)
 * [D] SUB_AREA_LOKASI (Kalijaga / Gebang / Samping / Detail)
 * [E] NAMA_TUGAS
 * [F] DETAIL_INSTRUKSI
 * [G] PIC (Andi / Budi / Deni / Siti / Eko / Rian)
 * [H] DUE_DATE (YYYY-MM-DD)
 * [I] PROGRESS_PERSEN (0% - 100%)
 * [J] TAHAP_1_PERSIAPAN (TRUE / FALSE)
 * [K] TAHAP_2_PELAKSANAAN (TRUE / FALSE)
 * [L] TAHAP_3_FINISHING (TRUE / FALSE)
 * [M] TAHAP_4_AREA_CLEAN (TRUE / FALSE)
 * [N] TAHAP_5_HASIL_TARGET (TRUE / FALSE)
 * [O] STATUS (OPEN / ON_PROGRESS / COMPLETED / VERIFIED / OVERDUE)
 * [P] URL_FOTO_BEFORE (https://res.cloudinary.com/doxv3khr7/image/upload/...)
 * [Q] URL_FOTO_AFTER (https://res.cloudinary.com/doxv3khr7/image/upload/...)
 * [R] WAKTU_SUBMIT_PIC
 * [S] WAKTU_VERIFIKASI_SPV
 * [T] CATATAN_SPV
 *
 * 4. Buka menu Extensions (Ekstensi) > Apps Script.
 * 5. Paste script ini dan Deploy as Web App (akses "Anyone").
 */

const SHEET_NAME = "ACTIONS"; // Sesuaikan dengan nama sheet di spreadsheet

const SPREADSHEET_ID = "1KQspDwzGXp9alhBaPcTHVVzWVbV6jnTg";

function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function doGet(e) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

    // Jika ini adalah request sync dari GET (karena redirect 302 POST)
    if (e.parameter && e.parameter.action === "sync" && e.parameter.data) {
      const postData = JSON.parse(decodeURIComponent(e.parameter.data));
      return processSyncData(postData, sheet);
    }

    // Default GET return all data
    const data = sheet.getDataRange().getValues();
    const actions = [];
    if (data.length <= 1)
      return createJsonResponse({ status: "success", data: [] });

    data.slice(1).forEach((r) => {
      actions.push({
        id: r[0],
        title: r[4],
        problemFinding: r[5],
        improvementPlan: r[6],
        desc: r[7],
        area: r[2],
        subRental: r[3],
        pic: r[8],
        dueDate: r[9],
        checklist: [
          { text: "Langkah 1", done: r[11] === true || r[11] === "TRUE" },
          { text: "Langkah 2", done: r[12] === true || r[12] === "TRUE" },
          { text: "Langkah 3", done: r[13] === true || r[13] === "TRUE" },
          { text: "Langkah 4", done: r[14] === true || r[14] === "TRUE" },
          { text: "Langkah 5", done: r[15] === true || r[15] === "TRUE" },
        ],
        status: r[16],
        beforeImg: r[17] || "",
        afterImg: r[18] || "",
        submittedAt: r[19] || "",
        verifiedAt: r[20] || "",
        notes: r[21] || "",
      });
    });

    return createJsonResponse({ status: "success", data: actions });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

    return processSyncData(postData, sheet);
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

// Helper untuk memproses data masuk baik dari GET maupun POST
function processSyncData(postData, sheet) {
  try {
    const actionType = postData.actionType; // 'CREATE_ACTION' | 'PIC_UPDATE' | 'SPV_VERIFY'

    if (actionType === "CREATE_ACTION") {
      // SPV ONLY CREATE ACTION
      const act = postData.action;
      const newRow = [
        act.id,
        Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss"),
        act.area,
        act.subRental || act.subLocation || "",
        act.title, // NAMA_TUGAS
        act.problemFinding || "", // TEMUAN MASALAH
        act.improvementPlan || "", // RENCANA IMPROVEMENT
        act.detailLokasi || "", // DETAIL TITIK LOKASI
        act.pic, // PIC
        act.dueDate,
        0, // Progress 0%
        false, // Tahap 1
        false, // Tahap 2
        false, // Tahap 3
        false, // Tahap 4
        false, // Tahap 5
        "OPEN", // Status
        act.cloudinaryBeforeUrl || act.beforeImg || "", // Foto Before
        "", // Foto After
        "", // Waktu Submit
        "", // Waktu Verifikasi
        "", // Notes
      ];
      sheet.appendRow(newRow);
      return createJsonResponse({
        status: "success",
        message: "Action created by SPV",
      });
    }

    if (actionType === "PIC_UPDATE") {
      // PIC UPDATE PROGRESS & SUBMIT
      const actId = postData.id;
      const checklist = postData.checklist || [];
      const afterUrl = postData.cloudinaryAfterUrl || postData.afterImg || "";
      const isSubmit = postData.isSubmit || false;

      const data = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == actId) {
          rowIndex = i + 1; // 1-indexed
          break;
        }
      }

      if (rowIndex !== -1) {
        // Calculate progress
        const doneCount = checklist.filter((c) => c.done).length;
        const pct = Math.round((doneCount / 5) * 100);

        sheet.getRange(rowIndex, 11).setValue(pct); // Kolom K: Progress
        sheet
          .getRange(rowIndex, 12)
          .setValue(checklist[0] ? checklist[0].done : false); // L
        sheet
          .getRange(rowIndex, 13)
          .setValue(checklist[1] ? checklist[1].done : false); // M
        sheet
          .getRange(rowIndex, 14)
          .setValue(checklist[2] ? checklist[2].done : false); // N
        sheet
          .getRange(rowIndex, 15)
          .setValue(checklist[3] ? checklist[3].done : false); // O
        sheet
          .getRange(rowIndex, 16)
          .setValue(checklist[4] ? checklist[4].done : false); // P

        if (afterUrl) sheet.getRange(rowIndex, 19).setValue(afterUrl); // S: After Photo

        if (isSubmit || pct === 100) {
          sheet.getRange(rowIndex, 17).setValue("COMPLETED"); // Q: Status
          sheet
            .getRange(rowIndex, 20)
            .setValue(
              Utilities.formatDate(
                new Date(),
                "Asia/Jakarta",
                "yyyy-MM-dd HH:mm:ss",
              ),
            ); // T: Waktu Submit
        } else if (pct > 0) {
          sheet.getRange(rowIndex, 17).setValue("ON_PROGRESS");
        }

        return createJsonResponse({
          status: "success",
          message: "Progress updated by PIC",
        });
      }
      return createJsonResponse({
        status: "error",
        message: "Action ID not found",
      });
    }

    if (actionType === "SPV_VERIFY") {
      // SPV VERIFY & CLOSE ACTION
      const actId = postData.id;
      const data = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == actId) {
          rowIndex = i + 1;
          break;
        }
      }

      if (rowIndex !== -1) {
        sheet.getRange(rowIndex, 17).setValue("VERIFIED"); // Q: Status
        sheet
          .getRange(rowIndex, 21)
          .setValue(
            Utilities.formatDate(
              new Date(),
              "Asia/Jakarta",
              "yyyy-MM-dd HH:mm:ss",
            ),
          ); // U: Waktu Verifikasi
        sheet
          .getRange(rowIndex, 22)
          .setValue(postData.notes || "Disetujui SPV"); // V: Catatan
        return createJsonResponse({
          status: "success",
          message: "Action verified by SPV",
        });
      }
      return createJsonResponse({
        status: "error",
        message: "Action ID not found",
      });
    }

    return createJsonResponse({
      status: "error",
      message: "Invalid action type",
    });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
