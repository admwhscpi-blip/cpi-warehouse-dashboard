/**
 * SMART WAREHOUSE V2.0 - RM-AGING API
 * Spreadsheet ID: 1tnou4w9uUZu99Ck_iqrSafbjENVFDShRTJiTav7T_yw
 * Sheet Name: Sheet1
 */

var SPREADSHEET_ID = '1tnou4w9uUZu99Ck_iqrSafbjENVFDShRTJiTav7T_yw';

function doGet(e) {
    var action = e.parameter.action;

    try {
        var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

        if (action === 'getAgingData') {
            return createJsonResponse(getAgingData(ss));
        } else if (action === 'getTreatmentData') {
            return createJsonResponse(getTreatmentData(ss));
        } else {
            return createJsonResponse({ status: "error", message: "Action not recognized" });
        }
    } catch (err) {
        return createJsonResponse({ status: "error", message: err.toString() });
    }
}

/**
 * RM-TREATMENT API
 * Membaca kolom A sampai K (11 kolom) termasuk tanggal fumigasi dan riwayat
 * TIDAK mengganggu getAgingData
 */
function getTreatmentData(ss) {
    var sheet = ss.getSheetByName('Sheet1');
    if (!sheet) return { status: "error", message: "Sheet1 not found" };

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return { status: "success", data: [] };

    // Ambil data mulai baris 3, kolom A sampai K (11 kolom)
    var range = sheet.getRange(3, 1, lastRow - 2, 11);
    var values = range.getValues();

    var cleanedData = [];

    for (var i = 0; i < values.length; i++) {
        var row = values[i];

        var lot = String(row[1]).trim();       // Kolom B
        var material = String(row[2]).trim();  // Kolom C
        var umur = row[3];                     // Kolom D
        var aktual = row[4];                   // Kolom E
        var lansir = row[5];                   // Kolom F
        var sisa = String(row[6]).trim();      // Kolom G
        var keterangan = String(row[7]).trim(); // Kolom H
        var gudang = String(row[8]).trim();    // Kolom I
        var tglFumigasi = row[9];              // Kolom J
        var riwayatFumigasi = row[10];         // Kolom K

        if (!lot || lot === "") continue;

        // Format tanggal jika berupa Date object
        var tglStr = "";
        if (tglFumigasi instanceof Date) {
            var dd = String(tglFumigasi.getDate()).padStart(2, '0');
            var mm = String(tglFumigasi.getMonth() + 1).padStart(2, '0');
            var yyyy = tglFumigasi.getFullYear();
            tglStr = dd + "/" + mm + "/" + yyyy;
        } else if (tglFumigasi) {
            tglStr = String(tglFumigasi).trim();
        }

        cleanedData.push({
            lot: lot,
            material: material,
            umur: parseInt(umur) || 0,
            aktual: aktual,
            lansir: lansir,
            sisa: sisa,
            keterangan: keterangan,
            gudang: gudang,
            tglFumigasi: tglStr,
            riwayatFumigasi: String(riwayatFumigasi || "").trim()
        });
    }

    return {
        status: "success",
        timestamp: new Date().toISOString(),
        count: cleanedData.length,
        data: cleanedData
    };
}

function getAgingData(ss) {
    var sheet = ss.getSheetByName('Sheet1');
    if (!sheet) return { status: "error", message: "Sheet1 not found" };

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return { status: "success", data: [] };

    // Ambil data mulai dari baris 3, kolom A sampai I (9 kolom untuk memastikan pemetaan B, C, D... akurat)
    // A:1, B:2, C:3, D:4, E:5, F:6, G:7, H:8, I:9
    var range = sheet.getRange(3, 1, lastRow - 2, 9);
    var values = range.getValues();

    var cleanedData = [];

    for (var i = 0; i < values.length; i++) {
        var row = values[i];

        // Pemetaan Eksplisit berdasarkan Huruf Kolom (0-indexed array dari kolom A)
        var lot = String(row[1]).trim();       // Kolom B
        var material = String(row[2]).trim();  // Kolom C
        var umur = row[3];                     // Kolom D
        var aktual = row[4];                   // Kolom E
        var lansir = row[5];                   // Kolom F
        var sisa = row[6];                     // Kolom G
        var keterangan = String(row[7]).trim(); // Kolom H
        var gudang = String(row[8]).trim();    // Kolom I

        if (!lot && !material && !gudang) continue;

        // Tetap lewati jika data kritikal kosong
        if (lot === "" || material === "") continue;

        cleanedData.push({
            lot: lot,
            material: material,
            umur: parseInt(umur) || 0,
            aktual: aktual,
            lansir: lansir,
            sisa: sisa,
            keterangan: keterangan,
            gudang: gudang
        });
    }

    return {
        status: "success",
        timestamp: new Date().toISOString(),
        count: cleanedData.length,
        data: cleanedData
    };
}

function createJsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}
