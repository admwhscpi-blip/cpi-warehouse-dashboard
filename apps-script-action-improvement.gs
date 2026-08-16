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

const SHEET_NAME = "ACTIONS";
const CLOUDINARY_BASE_URL = "https://res.cloudinary.com/doxv3khr7/image/upload";

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

    // Jika ini adalah request sync dari GET (karena redirect 302 POST)
    if (e.parameter && e.parameter.action === "sync" && e.parameter.data) {
      const postData = JSON.parse(decodeURIComponent(e.parameter.data));
      return processSyncData(postData, sheet);
    }

    // Jika GET biasa (fetch semua data)
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return createJsonResponse({ status: "success", data: [] });
    }

    const headers = data[0];
    const rows = data.slice(1);

    const actions = rows.map((r) => {
      return {
        id: r[0],
        createdAt: r[1],
        area: r[2],
        subRental: r[3],
        title: r[4],
        desc: r[5],
        pic: r[6],
        dueDate:
          r[7] instanceof Date
            ? Utilities.formatDate(
                r[7],
                Session.getScriptTimeZone(),
                "yyyy-MM-dd",
              )
            : r[7],
        pct: r[8],
        checklist: [
          { text: "Persiapan", done: r[9] === true || r[9] === "TRUE" },
          { text: "Pelaksanaan", done: r[10] === true || r[10] === "TRUE" },
          { text: "Finishing", done: r[11] === true || r[11] === "TRUE" },
          {
            text: "Area sudah clean",
            done: r[12] === true || r[12] === "TRUE",
          },
          {
            text: "Hasil sesuai target",
            done: r[13] === true || r[13] === "TRUE",
          },
        ],
        status: r[14],
        beforeImg: r[15] || "",
        afterImg: r[16] || "",
        submittedAt: r[17] || "",
        verifiedAt: r[18] || "",
        notes: r[19] || "",
      };
    });

    return createJsonResponse({ status: "success", data: actions });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
        new Date().toISOString(),
        act.area,
        act.subRental || act.subLocation || "",
        act.title,
        act.desc || "",
        act.pic,
        act.dueDate,
        0, // Progress 0%
        false,
        false,
        false,
        false,
        false, // 5 stages
        "OPEN",
        act.cloudinaryBeforeUrl || act.beforeImg || "",
        "", // After photo empty initially
        "", // Submit time empty
        "", // Verify time empty
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

        sheet.getRange(rowIndex, 9).setValue(pct); // Kolom I: Progress
        sheet
          .getRange(rowIndex, 10)
          .setValue(checklist[0] ? checklist[0].done : false); // J
        sheet
          .getRange(rowIndex, 11)
          .setValue(checklist[1] ? checklist[1].done : false); // K
        sheet
          .getRange(rowIndex, 12)
          .setValue(checklist[2] ? checklist[2].done : false); // L
        sheet
          .getRange(rowIndex, 13)
          .setValue(checklist[3] ? checklist[3].done : false); // M
        sheet
          .getRange(rowIndex, 14)
          .setValue(checklist[4] ? checklist[4].done : false); // N

        if (afterUrl) sheet.getRange(rowIndex, 17).setValue(afterUrl); // Q: After Photo

        if (isSubmit || pct === 100) {
          sheet.getRange(rowIndex, 15).setValue("COMPLETED"); // O: Status
          sheet.getRange(rowIndex, 18).setValue(new Date().toISOString()); // R: Waktu Submit
        } else if (pct > 0) {
          sheet.getRange(rowIndex, 15).setValue("ON_PROGRESS");
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
        sheet.getRange(rowIndex, 15).setValue("VERIFIED"); // O: Status
        sheet.getRange(rowIndex, 19).setValue(new Date().toISOString()); // S: Waktu Verifikasi
        sheet
          .getRange(rowIndex, 20)
          .setValue(postData.notes || "Disetujui SPV"); // T: Catatan
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
