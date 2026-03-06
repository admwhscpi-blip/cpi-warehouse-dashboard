/**
 * API TRACK RECORD KARYAWAN v1.0 - SMART WAREHOUSE
 * Mengambil data komplain dan SP dari sheet KOMPLAIN
 */

const SPREADSHEET_ID = "19nL4REfxtHMMlnBeF3X2kqGT-21I3PR_AfIIPC805qI";

function doGet(e) {
    // Enable CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    const action = e.parameter.action || 'getData';

    const success = (data) => ContentService.createTextOutput(JSON.stringify({ status: 'success', data: data })).setMimeType(ContentService.MimeType.JSON);
    const error = (msg) => ContentService.createTextOutput(JSON.stringify({ status: 'error', message: msg })).setMimeType(ContentService.MimeType.JSON);

    try {
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        const sheet = ss.getSheetByName("KOMPLAIN");

        if (!sheet) return error("Sheet 'KOMPLAIN' tidak ditemukan.");

        if (action === 'getData') {
            const data = sheet.getDataRange().getValues();
            data.shift(); // Remove header (Row 1)

            const records = [];
            data.forEach(row => {
                const nik = String(row[2]).trim(); // Kolom C
                const tglSpStr = row[7]; // Kolom H
                const tglSelesaiStr = row[8]; // Kolom I

                if (!nik || nik === "undefined" || nik === "") return;

                // Format tanggal agar mudah dibaca di Frontend (menghindari isu timezone offset)
                let tglSp = null;
                let tglSelesai = null;

                if (tglSpStr instanceof Date) {
                    tglSp = tglSpStr.toISOString();
                } else if (tglSpStr && !isNaN(new Date(tglSpStr).getTime())) {
                    tglSp = new Date(tglSpStr).toISOString();
                }

                if (tglSelesaiStr instanceof Date) {
                    tglSelesai = tglSelesaiStr.toISOString();
                } else if (tglSelesaiStr && !isNaN(new Date(tglSelesaiStr).getTime())) {
                    tglSelesai = new Date(tglSelesaiStr).toISOString();
                }

                records.push({
                    masa_berlaku: row[1] || "",
                    nik: nik,
                    nama: String(row[3]).trim() || "Unknown",
                    vendor: String(row[4]).trim() || "-",
                    bagian: String(row[5]).trim() || "-",
                    ket: String(row[6]).trim() || "-",
                    tglSp: tglSp,
                    tglSelesai: tglSelesai,
                    statusSp: row[9] || "",
                    noteMasa: String(row[10]).trim() || ""
                });
            });

            return success({
                records: records
            });
        }

        return error("Action '" + action + "' tidak didukung.");

    } catch (err) {
        return error(err.toString());
    }
}
