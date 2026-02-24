/**
 * SMART WAREHOUSE V2.0 - OUTSTANDING RM (FIXED COLUMN MAPPING)
 * -----------------------------------------------
 * Spreadsheet ID: 1Ze745HDK0KAob9bwzOleux1NzHwU_5yRmnYKxjQ34Cc
 * Sheet Name: PENEMPATAN BONGKARAN
 * 
 * COLUMN MAP (from Row 43):
 *   D  = Combined text (NoPolisi + Date + Status)  [col 4]
 *   F  = Material (short/partial)                   [col 6]
 *   G  = Netto per truck (individual tonnage)       [col 7]
 *   H  = Jenis Truck                                [col 8]
 *   I  = Aging Status                               [col 9]
 *   J  = (color bar / indicator)                    [col 10]
 *   K  = Description (Unique) = Full Material Name  [col 11]
 *   L  = Jumlah Truck (count, formula)              [col 12]
 *   M  = Total Netto (sum, formula)                 [col 13]
 *   N  = ARRIVAL DATE                               [col 14]
 *   O  = ARRIVAL TIME                               [col 15]
 * -----------------------------------------------
 */

function doGet(e) {
    const cb = e.parameter.callback;
    const data = getOutstandingData();
    const json = JSON.stringify(data);

    if (cb) {
        return ContentService.createTextOutput(cb + "(" + json + ")")
            .setMimeType(ContentService.MimeType.JAVASCRIPT);
    } else {
        return ContentService.createTextOutput(json)
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function getOutstandingData() {
    const SPREADSHEET_ID = '1Ze745HDK0KAob9bwzOleux1NzHwU_5yRmnYKxjQ34Cc';
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("PENEMPATAN BONGKARAN");

    if (!sheet) return { error: "Sheet 'PENEMPATAN BONGKARAN' tidak ditemukan" };

    // 1. DATA ACUAN PENEMPATAN (Baris 13-26, Kolom D-K)
    const rangeAcuan = sheet.getRange(13, 4, 14, 8).getValues();
    const placement = rangeAcuan.filter(r => r[0] != "").map(r => ({
        acuan: String(r[0]),
        grade: String(r[1]),
        option1: { gudang: String(r[2]), lot: String(r[3]), qty: r[4] },
        option2: { gudang: String(r[5]), lot: String(r[6]), qty: r[7] }
    }));

    // 2. DATA MONITORING OUTSTANDING (Baris 43+, Kolom D-O = 12 columns)
    //    Range: col 4 (D) to col 15 (O) = 12 columns
    const lastRow = sheet.getLastRow();
    const dataEndRow = Math.min(lastRow, 200); // Safety cap
    const numRows = dataEndRow - 43 + 1;
    if (numRows <= 0) return { placement: placement, monitoring: [], lastUpdate: new Date().toLocaleString() };

    const monRange = sheet.getRange(43, 4, numRows, 12);
    const rangeMonitoring = monRange.getValues();          // For numeric/formula values
    const rangeDisplay = monRange.getDisplayValues();      // For exact text (dates/times as shown)
    // Index map (0-based from col D):
    //   0 = D (combined text)
    //   1 = E (date/empty)
    //   2 = F (material short)
    //   3 = G (netto per truck)
    //   4 = H (jenis truck)
    //   5 = I (aging status)
    //   6 = J (indicator)
    //   7 = K (description unique / full material)
    //   8 = L (jumlah truck)
    //   9 = M (total netto)
    //  10 = N (arrival date)
    //  11 = O (arrival time)

    let lastMaterial = "";  // To carry forward material name for child rows

    const monitoring = [];

    for (let idx = 0; idx < rangeMonitoring.length; idx++) {
        const r = rangeMonitoring[idx];

        // Skip completely empty rows
        const colD = String(r[0] || "").trim();
        const colH = String(r[4] || "").trim();
        const colI = String(r[5] || "").trim();
        if (colD === "" && colH === "" && colI === "") continue;

        // === MATERIAL ===
        // Primary: Column K (Description Unique - full material name)
        // Fallback: Column F (short/partial material name)
        let material = String(r[7] || "").trim();   // Col K
        if (material === "") {
            material = String(r[2] || "").trim();     // Col F as fallback
        }
        // If still empty, inherit from last known material (hierarchical structure)
        if (material !== "") {
            lastMaterial = material;
        } else {
            material = lastMaterial;
        }

        // === NETTO / TONNAGE ===
        // ALWAYS use Column G (individual truck netto per row)
        let netto = r[3];  // Col G = individual tonnage
        if (typeof netto !== 'number') {
            netto = parseFloat(netto) || 0;
        }

        // === SEQUENCE ===
        // Extract from Column D - try to get a sequence number
        // Col D typically contains: "B 9308 UEK 23.02.2026 To be scaled..."
        // OR it might just be a number (for individual truck tonnage rows)
        let sequence = colD;

        // If Col D looks like a plate + date string, try to extract from it
        // Some patterns: The sequence might be embedded or it could be a pure number
        // For tonnage-only rows, Col D IS the tonnage (e.g., "8.8", "10.06")
        // For summary rows, Col D has "B 9308 UEK 23.02.2026 ..."

        // Also check: the Jumlah Truck (Col L) > 0 means it's a summary row
        const jumlahTruck = r[8] || 0;

        // === TRUCK TYPE ===
        const truckType = String(r[4] || "").trim();  // Col H

        // === AGING STATUS ===
        const agingStatus = String(r[5] || "").trim();  // Col I

        // === DATES & TIMES ===
        // Use getDisplayValues() to get EXACT text as shown in spreadsheet.
        // This completely avoids timezone conversion bugs with Date objects.
        const disp = rangeDisplay[idx];

        // Arrival Date (Col N) - use display value directly
        let arrivalDate = String(disp[10] || "").trim();

        // Arrival Time (Col O) - use display value directly
        // Display format may be "H:mm:ss" or "HH:mm:ss" or "HH:mm"
        let arrivalTime = String(disp[11] || "").trim();
        // Normalize time: "0:05:08" → "00:05", "11:33:00" → "11:33"
        if (arrivalTime) {
            const timeParts = arrivalTime.split(':');
            if (timeParts.length >= 2) {
                let h = parseInt(timeParts[0]) || 0;
                let m = parseInt(timeParts[1]) || 0;
                arrivalTime = (h < 10 ? "0" + h : String(h)) + ":" + (m < 10 ? "0" + m : String(m));
            }
        }

        // === TGL MASUK / JAM MASUK (extract from Col D or use Arrival fields) ===
        let tglMasuk = arrivalDate;
        let jamMasuk = arrivalTime;

        // If arrivalDate is empty, try to extract date from Col D text
        if (!tglMasuk || tglMasuk.trim() === "" || tglMasuk === "0" || tglMasuk === "00.00.0000") {
            const dateMatch = colD.match(/(\d{2})[\./](\d{2})[\./](\d{4})/);
            if (dateMatch) {
                tglMasuk = dateMatch[0];
            }
        }

        // If Col E has a date display value
        let colEdisp = String(disp[1] || "").trim();
        if (colEdisp && (!tglMasuk || tglMasuk.trim() === "")) {
            tglMasuk = colEdisp;
        }

        monitoring.push({
            sequence: sequence,
            tglMasuk: tglMasuk,
            material: material,
            netto: netto,
            truckType: truckType,
            agingStatus: agingStatus,
            jamMasuk: jamMasuk,
            arrivalDate: arrivalDate,
            arrivalTime: arrivalTime,
            jumlahTruck: jumlahTruck
        });
    }

    return {
        placement: placement,
        monitoring: monitoring,
        lastUpdate: new Date().toLocaleString()
    };
}
