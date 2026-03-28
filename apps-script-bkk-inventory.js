// =====================================================================
// GOOGLE APPS SCRIPT - BKK INTEGRATED TURBO V11.5 (FIXED LOGIC)
// + TAMBAHAN: ACTION getInventoryData UNTUK BKK INVENTORY MASTER DATA
// =====================================================================
//
// PERUBAHAN DARI VERSI SEBELUMNYA:
// - Hanya MENAMBAHKAN else if (action === "getInventoryData") di doGet()
// - Hanya MENAMBAHKAN function getInventoryData()
// - TIDAK ADA PERUBAHAN pada fungsi downtime, outstanding, atau lainnya
//
// CARA UPDATE:
// 1. Buka Google Apps Script yang sudah ada
// 2. GANTI SELURUH ISI SCRIPT dengan kode di bawah ini
// 3. Deploy ulang (Deployment Baru / Update Deployment)
// 4. Copy URL dan paste di bkk-inventory.html
// =====================================================================

function doGet(e) {
    var action = e.parameter.action || "getData";
    var ssId = "17rIBNXdJOQkuizl_gJ5jGid7oqiEfJdWxUgPtz-i3As";

    try {
        if (action === "getDowntimeQuery") {
            return getDowntimeQuery(ssId, e);
        }
        else if (action === "getBKKCommandCenterData") {
            return getBKKCommandCenterData(ssId, e);
        }
        else if (action === "debugRaw") {
            return debugRawData(ssId, e);
        }
        // ============ TAMBAHAN BARU: BKK INVENTORY ============
        else if (action === "getInventoryData") {
            return getInventoryData(ssId, e);
        }
        // ============ TAMBAHAN BARU: SO BKK DATA ============
        else if (action === "getSOBKKData") {
            return getSOBKKData(ssId, e);
        }
        // ============ TAMBAHAN BARU: TES WS DATA ============
        else if (action === "getTesWSData") {
            return getTesWSData(ssId, e);
        }
        // =======================================================
        else {
            return getOutstandingBKKTurbo(ssId, e);
        }
    } catch (err) {
        return createOutput({ error: err.toString(), status: "error" }, e);
    }
}

// =====================================================================
// FUNGSI BARU: GET INVENTORY DATA DARI SHEET "CARD STOCK"
// Membaca kolom B:V mulai baris 4
// Kolom: TANGGAL | STOCK(BK01-BK06) | PENERIMAAN(BK01-BK06) | USAGE(BK01-BK06) | SO JENIS BK | SO QTY
// =====================================================================
function getInventoryData(ssId, e) {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("CARD STOCK");

    if (!sheet) {
        return createOutput({
            success: false,
            error: "Sheet 'CARD STOCK' tidak ditemukan!"
        }, e);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 4) {
        return createOutput({
            success: true,
            data: [],
            count: 0,
            timestamp: new Date().toISOString()
        }, e);
    }

    // Range: B4:V{lastRow} → kolom 2 (B), 21 kolom (B sampai V)
    var dataRange = sheet.getRange(4, 2, lastRow - 3, 21);
    var values = dataRange.getValues();

    var formattedData = [];

    for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var dateCell = row[0]; // Kolom B = TANGGAL

        // Lewati baris jika tanggal kosong
        if (!dateCell || dateCell === "") continue;

        var dateString = "";
        if (dateCell instanceof Date) {
            if (isNaN(dateCell.getTime())) continue;
            // Format dd/mm/yyyy
            var dd = dateCell.getDate();
            var mm = dateCell.getMonth() + 1;
            var yy = dateCell.getFullYear();
            dateString = (dd < 10 ? "0" + dd : dd) + "/" + (mm < 10 ? "0" + mm : mm) + "/" + yy;
        } else {
            dateString = String(dateCell);
        }

        // Helper: bersihkan nilai sel (hapus "kg", spasi, dll)
        var cleanVal = function (val) {
            if (val === null || val === undefined || val === "") return "";
            if (typeof val === "number") return val;
            var s = String(val).trim();
            // Hapus suffix "kg" atau "Kg" atau "KG"
            s = s.replace(/\s*kg\s*$/i, "").trim();
            if (s === "" || s === "-") return "";
            // Coba parse sebagai angka
            var num = parseFloat(s.replace(/,/g, ""));
            return isNaN(num) ? s : num;
        };

        formattedData.push({
            tanggal: dateString,
            // STOCK: kolom C-H (index 1-6)
            stockBk01: cleanVal(row[1]),
            stockBk02: cleanVal(row[2]),
            stockBk03: cleanVal(row[3]),
            stockBk04: cleanVal(row[4]),
            stockBk05: cleanVal(row[5]),
            stockBk06: cleanVal(row[6]),
            // PENERIMAAN: kolom I-N (index 7-12)
            penerimaanBk01: cleanVal(row[7]),
            penerimaanBk02: cleanVal(row[8]),
            penerimaanBk03: cleanVal(row[9]),
            penerimaanBk04: cleanVal(row[10]),
            penerimaanBk05: cleanVal(row[11]),
            penerimaanBk06: cleanVal(row[12]),
            // USAGE: kolom O-T (index 13-18)
            usageBk01: cleanVal(row[13]),
            usageBk02: cleanVal(row[14]),
            usageBk03: cleanVal(row[15]),
            usageBk04: cleanVal(row[16]),
            usageBk05: cleanVal(row[17]),
            usageBk06: cleanVal(row[18]),
            // SO: kolom U-V (index 19-20)
            soJenis: cleanVal(row[19]),
            soQty: cleanVal(row[20])
        });
    }

    return createOutput({
        success: true,
        data: formattedData,
        count: formattedData.length,
        timestamp: new Date().toISOString()
    }, e);
}

// =====================================================================
// FUNGSI BARU: GET SO BKK DATA DARI SHEET "SO BKK"
// Membaca kolom A:N mulai baris 5
// Kolom: NO | NAMA MATERIAL | GUDANG | NAMA KAPAL | AWAL | AKHIR | UMUR |
//        TANGGAL OPNAME | PENERIMAAN | STOCK AKHIR | PROSENTASE | KETERANGAN STATUS | DOKUMENTASI | KETERANGAN
// =====================================================================
function getSOBKKData(ssId, e) {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("SO BKK");

    if (!sheet) {
        return createOutput({
            success: false,
            error: "Sheet 'SO BKK' tidak ditemukan!"
        }, e);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 5) {
        return createOutput({
            success: true,
            data: [],
            count: 0,
            timestamp: new Date().toISOString()
        }, e);
    }

    // Range: A5:N{lastRow} → kolom 1 (A), 14 kolom (A sampai N)
    var dataRange = sheet.getRange(5, 1, lastRow - 4, 14);
    var values = dataRange.getValues();

    var formattedData = [];

    // Helper: format tanggal
    var formatDateCell = function (val) {
        if (!val || val === "") return "";
        if (val instanceof Date) {
            if (isNaN(val.getTime())) return "";
            var dd = val.getDate();
            var mm = val.getMonth() + 1;
            var yy = val.getFullYear();
            return (dd < 10 ? "0" + dd : dd) + "/" + (mm < 10 ? "0" + mm : mm) + "/" + yy;
        }
        return String(val).trim();
    };

    // Helper: parse angka
    var parseNum = function (val) {
        if (val === null || val === undefined || val === "") return 0;
        if (typeof val === "number") return val;
        var s = String(val).trim().replace(/,/g, "");
        var num = parseFloat(s);
        return isNaN(num) ? 0 : num;
    };

    // Helper: parse persentase
    var parsePct = function (val) {
        if (val === null || val === undefined || val === "") return 0;
        if (typeof val === "number") {
            // Jika sudah dalam format desimal (misal 0.0104 = 1.04%)
            if (val < 1) return val * 100;
            return val;
        }
        var s = String(val).trim().replace(/%/g, "").replace(/,/g, ".");
        var num = parseFloat(s);
        return isNaN(num) ? 0 : num;
    };

    for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var no = row[0]; // Kolom A = NO

        // Lewati baris kosong (ada blank rows di antara data)
        if (!no || no === "") continue;

        formattedData.push({
            no: no,
            namaMaterial: String(row[1] || "").trim(),     // B: NAMA MATERIAL
            gudang: String(row[2] || "").trim(),           // C: GUDANG
            namaKapal: String(row[3] || "").trim(),        // D: NAMA KAPAL
            periodeAwal: formatDateCell(row[4]),            // E: AWAL
            periodeAkhir: formatDateCell(row[5]),           // F: AKHIR
            umur: parseNum(row[6]),                         // G: UMUR (hari)
            tanggalOpname: formatDateCell(row[7]),          // H: TANGGAL OPNAME
            penerimaan: parseNum(row[8]),                   // I: PENERIMAAN
            stockAkhir: parseNum(row[9]),                   // J: STOCK AKHIR
            prosentase: parsePct(row[10]),                  // K: PROSENTASE
            keteranganStatus: String(row[11] || "").trim(), // L: KETERANGAN STATUS (SUSUT/OVERFISIK)
            dokumentasi: String(row[12] || "").trim(),      // M: DOKUMENTASI
            keterangan: String(row[13] || "").trim()        // N: KETERANGAN
        });
    }

    return createOutput({
        success: true,
        data: formattedData,
        count: formattedData.length,
        timestamp: new Date().toISOString()
    }, e);
}

// =====================================================================
// FUNGSI BARU: GET TES WS DATA DARI SHEET "TES WS"
// Membaca kolom B:O mulai baris 3
// Kolom: TANGGAL | JENIS TIMBANGAN | JAMA SCALE | AREA | METODE |
//        KAPASITAS | STANDAR | AKTUAL | SISTEM | SELISIH KG |
//        DEVIASI PERSENTASI | STATUS | KETERANGA | KESIMPULAN
// =====================================================================
function getTesWSData(ssId, e) {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("TES WS");

    if (!sheet) {
        return createOutput({
            success: false,
            error: "Sheet 'TES WS' tidak ditemukan!"
        }, e);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
        return createOutput({
            success: true,
            data: [],
            count: 0,
            timestamp: new Date().toISOString()
        }, e);
    }

    // Range: B3:O{lastRow} → kolom 2 (B), 14 kolom (B sampai O)
    var dataRange = sheet.getRange(3, 2, lastRow - 2, 14);
    var values = dataRange.getValues();

    var formattedData = [];

    // Helper: format tanggal
    var formatDateCell = function (val) {
        if (!val || val === "") return "";
        if (val instanceof Date) {
            if (isNaN(val.getTime())) return "";
            var dd = val.getDate();
            var mm = val.getMonth() + 1;
            var yy = val.getFullYear();
            return (dd < 10 ? "0" + dd : dd) + "/" + (mm < 10 ? "0" + mm : mm) + "/" + yy;
        }
        return String(val).trim();
    };

    // Helper: parse angka (hapus "kg", "Kg", koma, spasi, handle #ERROR!)
    var parseNumWS = function (val) {
        if (val === null || val === undefined || val === "") return 0;
        if (typeof val === "number") return val;
        var s = String(val).trim();
        // Handle #ERROR!, #REF!, #VALUE! dll
        if (s.indexOf("#") === 0) return 0;
        // Hapus suffix kg/Kg/KG
        s = s.replace(/\s*kg\s*$/i, "").trim();
        if (s === "" || s === "-") return 0;
        // Handle format angka Indonesia: 3.213 atau 3,213
        // Jika ada titik dan koma, titik = ribuan, koma = desimal
        var hasDot = s.indexOf(".") !== -1;
        var hasComma = s.indexOf(",") !== -1;
        if (hasDot && hasComma) {
            var lastDot = s.lastIndexOf(".");
            var lastComma = s.lastIndexOf(",");
            if (lastComma > lastDot) {
                s = s.replace(/\./g, "").replace(",", ".");
            } else {
                s = s.replace(/,/g, "");
            }
        } else if (hasComma && !hasDot) {
            var parts = s.split(",");
            if (parts.length === 2 && parts[1].length === 3) {
                s = s.replace(/,/g, "");
            } else {
                s = s.replace(",", ".");
            }
        } else if (hasDot && !hasComma) {
            var dotParts = s.split(".");
            if (dotParts.length === 2 && dotParts[1].length === 3 && dotParts[0].length >= 2) {
                s = s.replace(/\./g, "");
            } else if (dotParts.length > 2) {
                s = s.replace(/\./g, "");
            }
        }
        var num = parseFloat(s);
        return isNaN(num) ? 0 : num;
    };

    // Helper: parse persentase
    var parsePctWS = function (val) {
        if (val === null || val === undefined || val === "") return 0;
        if (typeof val === "number") {
            // Jika sudah dalam format desimal (misal 0.1662 = 16.62%)
            if (Math.abs(val) < 1) return val * 100;
            return val;
        }
        var s = String(val).trim();
        if (s.indexOf("#") === 0) return 0;
        s = s.replace(/%/g, "").replace(/,/g, ".").trim();
        if (s === "" || s === "-") return 0;
        var num = parseFloat(s);
        return isNaN(num) ? 0 : num;
    };

    for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var dateCell = row[0]; // Kolom B = TANGGAL

        // Lewati baris kosong
        if (!dateCell || dateCell === "") continue;

        var standarVal = row[6]; // Kolom H = STANDAR
        var standarStr = String(standarVal || "").trim();
        var isStandarError = standarStr.indexOf("#") === 0;

        formattedData.push({
            tanggal: formatDateCell(dateCell),              // B: TANGGAL
            jenisTimbangan: String(row[1] || "").trim(),    // C: JENIS TIMBANGAN
            jamaScale: String(row[2] || "").trim(),         // D: JAMA SCALE
            area: String(row[3] || "").trim(),              // E: AREA
            metode: String(row[4] || "").trim(),            // F: METODE
            kapasitas: parseNumWS(row[5]),                  // G: KAPASITAS
            standar: isStandarError ? 0 : parseNumWS(row[6]), // H: STANDAR (handle #ERROR!)
            standarRaw: standarStr,                          // H: raw value for display
            aktual: parseNumWS(row[7]),                     // I: AKTUAL
            sistem: parseNumWS(row[8]),                     // J: SISTEM
            selisihKg: parseNumWS(row[9]),                  // K: SELISIH KG
            deviasiPersentasi: parsePctWS(row[10]),         // L: DEVIASI PERSENTASI
            status: String(row[11] || "").trim(),           // M: STATUS
            keterangan: String(row[12] || "").trim(),       // N: KETERANGA
            kesimpulan: String(row[13] || "").trim()        // O: KESIMPULAN
        });
    }

    return createOutput({
        success: true,
        data: formattedData,
        count: formattedData.length,
        timestamp: new Date().toISOString()
    }, e);
}


// =====================================================================
// ====== SEMUA FUNGSI LAMA DI BAWAH INI TIDAK ADA YANG DIUBAH ========
// =====================================================================

/**
 * DEBUG: Dump raw cell values, types, and headers from DOWNTIME sheet
 */
function debugRawData(ssId, e) {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("DOWNTIME");
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    var headerRange = sheet.getRange(1, 1, Math.min(5, lastRow), Math.min(lastCol, 25));
    var headers = headerRange.getValues();

    var sampleStart = 5;
    var sampleCount = Math.min(5, lastRow - sampleStart + 1);
    var sampleRows = [];
    if (sampleCount > 0) {
        var rawSample = sheet.getRange(sampleStart, 1, sampleCount, Math.min(lastCol, 25)).getValues();
        for (var i = 0; i < rawSample.length; i++) {
            var row = [];
            for (var j = 0; j < rawSample[i].length; j++) {
                var cell = rawSample[i][j];
                row.push({
                    col: j,
                    val: cell instanceof Date ? cell.toISOString() : String(cell),
                    type: cell instanceof Date ? "Date" : typeof cell
                });
            }
            sampleRows.push(row);
        }
    }

    return createOutput({
        lastRow: lastRow,
        lastCol: lastCol,
        headers: headers.map(function (r) { return r.map(String); }),
        sampleRows: sampleRows
    }, e);
}

/**
 * ROBUST DATE PARSER (V7.4 ORIGINAL)
 */
function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        return val;
    }
    var s = val.toString().trim();
    if (!s || s === "-" || s === "0") return null;
    var m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (m1) {
        var day = parseInt(m1[1], 10);
        var mon = parseInt(m1[2], 10);
        var yr = parseInt(m1[3], 10);
        if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31 && yr >= 2000) {
            return new Date(yr, mon - 1, day);
        }
    }
    var m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m2) {
        var yr2 = parseInt(m2[1], 10);
        var mon2 = parseInt(m2[2], 10);
        var day2 = parseInt(m2[3], 10);
        if (mon2 >= 1 && mon2 <= 12 && day2 >= 1 && day2 <= 31 && yr2 >= 2000) {
            return new Date(yr2, mon2 - 1, day2);
        }
    }
    var num = parseFloat(s);
    if (!isNaN(num) && num > 40000 && num < 60000) {
        var epoch = new Date(1899, 11, 30);
        epoch.setDate(epoch.getDate() + num);
        return epoch;
    }
    var d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) return d;
    return null;
}

/**
 * ROBUST NETTO PARSER (V7.4 ORIGINAL)
 */
function parseNetto(val) {
    if (val === null || val === undefined || val === "" || val === "-") return 0;
    if (typeof val === "number") return val;
    var s = val.toString().trim().replace(/\s/g, "");
    if (!s) return 0;
    var hasDot = s.indexOf(".") !== -1;
    var hasComma = s.indexOf(",") !== -1;
    if (hasDot && hasComma) {
        var lastDot = s.lastIndexOf(".");
        var lastComma = s.lastIndexOf(",");
        if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
        else s = s.replace(/,/g, "");
    } else if (hasComma && !hasDot) {
        var parts = s.split(",");
        if (parts.length === 2 && parts[1].length === 3) s = s.replace(/,/g, "");
        else s = s.replace(",", ".");
    } else if (hasDot && !hasComma) {
        var dotParts = s.split(".");
        if (dotParts.length === 2 && dotParts[1].length === 3 && dotParts[0].length >= 2) s = s.replace(/\./g, "");
        else if (dotParts.length > 2) s = s.replace(/\./g, "");
    }
    var result = parseFloat(s);
    return isNaN(result) ? 0 : result;
}

/**
 * ROBUST TIME/DURATION PARSER (V12.5)
 */
function parseTime(t) {
    if (t === null || t === undefined || t === "" || t === "-" || t === "0" || t === 0) return 0;

    if (t instanceof Date) {
        if (isNaN(t.getTime())) return 0;
        return (t.getHours() * 60) + t.getMinutes() + (t.getSeconds() / 60);
    }

    if (typeof t === "number") {
        if (t > 0 && t <= 1) return t * 1440;
        return t;
    }

    var str = t.toString().trim();
    if (!str) return 0;
    if (str.indexOf(":") !== -1) {
        var parts = str.split(":");
        var h = parseFloat(parts[0]) || 0;
        var m = parseFloat(parts[1]) || 0;
        var s = parts.length > 2 ? (parseFloat(parts[2]) || 0) : 0;
        return (h * 60) + m + (s / 60);
    }

    var num = parseFloat(str.replace(",", "."));
    return isNaN(num) ? 0 : num;
}

function getDowntimeQuery(ssId, e) {
    return createOutput(fetchDowntimeData(ssId, e), e);
}

function fetchDowntimeData(ssId, e) {
    var ss = SpreadsheetApp.openById(ssId);

    var targetMonth = parseInt(e.parameter.month);
    var targetYear = parseInt(e.parameter.year);
    var matFilter = (e.parameter.material || "").toUpperCase();

    var isFebMix = (targetYear === 2026 && targetMonth === 2);
    var isMarch26Plus = (targetYear > 2026) || (targetYear === 2026 && targetMonth >= 3);

    var rawData = [];

    if (isFebMix) {
        var oldSheet = ss.getSheetByName("DOWNTIME");
        var newSheet = ss.getSheetByName("DT NEW");

        if (oldSheet && oldSheet.getLastRow() > 4) {
            var oldRows = oldSheet.getRange(5, 1, oldSheet.getLastRow() - 4, 25).getValues();
            for (var oi = 0; oi < oldRows.length; oi++) {
                var od = parseDate(oldRows[oi][0]);
                if (od && od.getFullYear() === 2026 && (od.getMonth() + 1) === 2 && od.getDate() <= 16) {
                    oldRows[oi]._source = 'old';
                    rawData.push(oldRows[oi]);
                }
            }
        }
        if (newSheet && newSheet.getLastRow() > 3) {
            var newRows = newSheet.getRange(4, 1, newSheet.getLastRow() - 3, 25).getValues();
            for (var ni = 0; ni < newRows.length; ni++) {
                var nd = parseDate(newRows[ni][0]);
                if (nd && nd.getFullYear() === 2026 && (nd.getMonth() + 1) === 2 && nd.getDate() >= 19) {
                    newRows[ni]._source = 'new';
                    rawData.push(newRows[ni]);
                }
            }
        }
    } else {
        var isNewFormatSheet = isMarch26Plus || (targetYear === 2026 && targetMonth >= 3);
        var sheetName = isNewFormatSheet ? "DT NEW" : "DOWNTIME";
        var sheet = ss.getSheetByName(sheetName);

        if (!sheet) return createOutput({ data: [], materials: [], status: "error", message: "Sheet " + sheetName + " not found" }, e);

        var lastRow = sheet.getLastRow();
        var startRow = isNewFormatSheet ? 4 : 5;
        var totalRowsToScan = Math.max(0, lastRow - startRow + 1);

        if (totalRowsToScan <= 0) return createOutput({ data: [], materials: [], status: "empty_sheet" }, e);

        rawData = sheet.getRange(startRow, 1, totalRowsToScan, 25).getValues();
        var tagSrc = isNewFormatSheet ? 'new' : 'old';
        for (var ti = 0; ti < rawData.length; ti++) { rawData[ti]._source = tagSrc; }
    }
    var dailyAgg = {};
    var materials = new Set();

    var materialNetto = {};
    var intakeTruckTypes = {};
    var i71TotalNetto = 0;
    var i71TotalMan = 0;
    var i71TotalQC = 0;
    var i71TruckCount = 0;
    var i71MaterialNetto = {};
    var i71ActiveTotalGenerated = 0;
    var i71MinSpeed = 9999;
    var i71MaxSpeed = 0;
    var i71TotalSpeedSum = 0;
    var i71SpeedValidCount = 0;
    var intakeSubTypes = {};
    var i71DailyDetail = {};
    var workerStats = {};

    var directTotalNetto = 0;
    var directTotalTrucks = 0;
    var directDailyAgg = {};
    var directMaterialNetto = {};
    var directTruckTypes = {};

    var totalIdleNew = 0;
    var totalOffNew = 0;
    var intake71Trucks = [];

    var i71Total_dP = 0;
    var i71Total_dTready = 0;
    var i71Total_dB = 0;
    var i71Total_dQ = 0;
    var i71Total_dM = 0;
    var i71Total_dF = 0;

    var ssTZ = ss.getSpreadsheetTimeZone();

    var getShiftAt = function (epoch) {
        var hh = new Date(epoch).getHours();
        if (hh >= 7 && hh < 15) return "1";
        if (hh >= 15 && hh < 23) return "2";
        return "3";
    };

    var distributeMinutes = function (startE, endE, collectors) {
        if (startE >= endE) return;
        var cur = startE;
        while (cur < endE) {
            var d_obj = new Date(cur);
            var hh = d_obj.getHours();
            var shiftId = "1";
            var nextBoundary = 0;
            if (hh >= 7 && hh < 15) {
                shiftId = "1";
                nextBoundary = new Date(d_obj.getFullYear(), d_obj.getMonth(), d_obj.getDate(), 15, 0, 0).getTime();
            } else if (hh >= 15 && hh < 23) {
                shiftId = "2";
                nextBoundary = new Date(d_obj.getFullYear(), d_obj.getMonth(), d_obj.getDate(), 23, 0, 0).getTime();
            } else {
                shiftId = "3";
                if (hh >= 23) nextBoundary = new Date(d_obj.getFullYear(), d_obj.getMonth(), d_obj.getDate() + 1, 7, 0, 0).getTime();
                else nextBoundary = new Date(d_obj.getFullYear(), d_obj.getMonth(), d_obj.getDate(), 7, 0, 0).getTime();
            }
            var chunkEnd = Math.min(endE, nextBoundary);
            var mins = (chunkEnd - cur) / 60000;
            collectors[shiftId] = (collectors[shiftId] || 0) + mins;
            cur = chunkEnd;
        }
    };

    var lastValidFinish = null;

    for (var i = 0; i < rawData.length; i++) {
        var rowDate, type, rowNetto, rawMat, truckType, actualShift, rowWorkers;
        var startTs, endTs, mStart, mEnd, qStart, qEnd;

        var isNewFormat = isMarch26Plus || (rawData[i]._source === 'new');
        var isMarch26 = isMarch26Plus || (rawData[i]._source === 'new');

        if (isNewFormat) {
            rowDate = parseDate(rawData[i][0]);
            type = (rawData[i][1] || "").toString().toUpperCase();
            actualShift = (rawData[i][4] || "").toString();
            truckType = (rawData[i][6] || "").toString().trim().toUpperCase() || "UNKNOWN";
            rowNetto = parseNetto(rawData[i][8]);
            rawMat = (rawData[i][9] || "").toString().trim().toUpperCase();

            if (isMarch26) {
                startTs = rawData[i][11];
                var tReady = rawData[i][12];
                mStart = rawData[i][13];
                qStart = rawData[i][14];
                qEnd = rawData[i][15];
                mEnd = rawData[i][16];
                endTs = rawData[i][17];
            } else {
                startTs = rawData[i][11];
                mStart = rawData[i][12];
                qStart = rawData[i][13];
                qEnd = rawData[i][14];
                mEnd = rawData[i][15];
                endTs = rawData[i][16];
            }

            var kraniName = (rawData[i][2] || "").toString().trim();
            var scadaName = (rawData[i][3] || "").toString().trim();
            var idleRem = (rawData[i][18] || "").toString().trim();
            var offRem = (rawData[i][20] || "").toString().trim();
            rowWorkers = parseInt(rawData[i][21]) || 0;
        } else {
            rowDate = parseDate(rawData[i][0]);
            type = (rawData[i][1] || "").toString().toUpperCase();
            actualShift = (rawData[i][4] || "").toString();
            truckType = (rawData[i][6] || "").toString().trim().toUpperCase() || "UNKNOWN";
            rowNetto = parseNetto(rawData[i][8]);
            rawMat = (rawData[i][9] || "").toString().trim().toUpperCase();

            endTs = rawData[i][15];
            startTs = rawData[i][14];
            mStart = rawData[i][17];
            mEnd = rawData[i][18];
            qStart = rawData[i][20];
            qEnd = rawData[i][21];
            rowWorkers = parseInt(rawData[i][23]) || 0;
        }

        if (rawMat) {
            materials.add(rawMat);
            materialNetto[rawMat] = (materialNetto[rawMat] || 0) + rowNetto;
        }
        if (!rowDate) continue;

        var m_ = rowDate.getMonth() + 1;
        var y_ = rowDate.getFullYear();
        if (targetMonth && targetYear) {
            if (m_ !== targetMonth || y_ !== targetYear) continue;
        }
        if (matFilter && rawMat.indexOf(matFilter) !== 0) continue;

        var dateKey = Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd");

        if (!dailyAgg[dateKey]) {
            dailyAgg[dateKey] = {
                date: dateKey, netto: 0, trucks: 0,
                intakeNetto: 0, directNetto: 0,
                shiftData: {
                    "1": { sbm_ins: 0, sbm_dg: 0, pkm_ins: 0, pkm_dg: 0, active: 0, qc: 0, man: 0, idle: 0, off: 0, workers: 0, workerRows: 0, trucks: 0, wt: 0, bk: 0, qct: 0, mnv: 0, fn: 0, remIdle: [], remOff: [], krani: [], scada: [] },
                    "2": { sbm_ins: 0, sbm_dg: 0, pkm_ins: 0, pkm_dg: 0, active: 0, qc: 0, man: 0, idle: 0, off: 0, workers: 0, workerRows: 0, trucks: 0, wt: 0, bk: 0, qct: 0, mnv: 0, fn: 0, remIdle: [], remOff: [], krani: [], scada: [] },
                    "3": { sbm_ins: 0, sbm_dg: 0, pkm_ins: 0, pkm_dg: 0, active: 0, qc: 0, man: 0, idle: 0, off: 0, workers: 0, workerRows: 0, trucks: 0, wt: 0, bk: 0, qct: 0, mnv: 0, fn: 0, remIdle: [], remOff: [], krani: [], scada: [] }
                }
            };
        }
        var d = dailyAgg[dateKey];
        d.netto += rowNetto;
        d.trucks++;

        var isI71 = (type.indexOf("INTAKE 71") !== -1);
        var isDG = (type.indexOf("DIRECT GUDANG") !== -1);

        if (isI71) d.intakeNetto += rowNetto;
        else d.directNetto += rowNetto;

        if (isI71) {
            var baseEpoch = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate()).getTime();

            var getEpochAtTime = function (val) {
                if (val === null || val === undefined || val === "" || val === "-") return null;
                if (val instanceof Date) {
                    var clockStr = Utilities.formatDate(val, ssTZ, "HH:mm:ss");
                    var p = clockStr.split(":");
                    var mins = (parseInt(p[0]) * 60) + parseInt(p[1]) + (parseInt(p[2]) / 60);
                    return baseEpoch + (mins * 60000);
                }
                var minutes = parseTime(val);
                return baseEpoch + (minutes * 60000);
            };

            var epochPanggil = getEpochAtTime(startTs);
            var epochFinish = getEpochAtTime(endTs);

            if (epochPanggil !== null && epochFinish !== null) {
                if (epochFinish < epochPanggil) epochFinish += 24 * 3600000;

                i71TotalNetto += rowNetto;
                i71TruckCount++;

                var activePerShift = { "1": 0, "2": 0, "3": 0 };
                distributeMinutes(epochPanggil, epochFinish, activePerShift);
                ["1", "2", "3"].forEach(function (sid) { d.shiftData[sid].active += activePerShift[sid]; });
                i71ActiveTotalGenerated += (epochFinish - epochPanggil) / 60000;

                var actualShiftLoop = getShiftAt(epochFinish);
                var sd = d.shiftData[actualShiftLoop];
                sd.trucks++;
                if (rowWorkers > 0) { sd.workers += rowWorkers; sd.workerRows++; }

                if (rawMat.indexOf("SBM") !== -1) {
                    if (isI71) sd.sbm_ins += rowNetto; else if (isDG) sd.sbm_dg += rowNetto;
                } else if (rawMat.indexOf("PKM") !== -1) {
                    if (isI71) sd.pkm_ins += rowNetto; else if (isDG) sd.pkm_dg += rowNetto;
                }

                var idleDur = 0, offDur = 0;
                if (isNewFormat) {
                    var idleTimeRaw = rawData[i][17];
                    var offTimeRaw = rawData[i][19];

                    var eStart = epochFinish || lastValidFinish;

                    if (idleTimeRaw !== "" && idleTimeRaw !== "-" && eStart) {
                        var eIdle = getEpochAtTime(idleTimeRaw);
                        if (eIdle !== null) {
                            if (eIdle < eStart) eIdle += 24 * 3600000;
                            var dur = (eIdle - eStart) / 60000;
                            if (dur > 0) {
                                idleDur = dur;
                                var collI = { "1": 0, "2": 0, "3": 0 };
                                distributeMinutes(eStart, eIdle, collI);
                                ["1", "2", "3"].forEach(function (sid) { d.shiftData[sid].idle += collI[sid]; totalIdleNew += collI[sid]; });
                                var sIdRemI = getShiftAt(eStart);
                                d.shiftData[sIdRemI].remIdle.push({ t: idleRem, d: dur, s: eStart, e: eIdle, type: 'IDLE' });
                            }
                        }
                    }

                    if (offTimeRaw !== "" && offTimeRaw !== "-" && eStart) {
                        var eOff = getEpochAtTime(offTimeRaw);
                        if (eOff !== null) {
                            if (eOff < eStart) eOff += 24 * 3600000;
                            var dur = (eOff - eStart) / 60000;
                            if (dur > 0) {
                                offDur = dur;
                                var collO = { "1": 0, "2": 0, "3": 0 };
                                distributeMinutes(eStart, eOff, collO);
                                ["1", "2", "3"].forEach(function (sid) { d.shiftData[sid].off += collO[sid]; totalOffNew += collO[sid]; });
                                var sIdRemO = getShiftAt(eStart);
                                d.shiftData[sIdRemO].remOff.push({ t: offRem, d: dur, s: eStart, e: eOff, type: 'OFF' });
                            }
                        }
                    }

                    if (kraniName && sd.krani.indexOf(kraniName) === -1) sd.krani.push(kraniName);
                    if (scadaName && sd.scada.indexOf(scadaName) === -1) sd.scada.push(scadaName);

                    var eL = getEpochAtTime(startTs);
                    var eM, eN, eO, eP, eQ, eR, eTready;

                    if (isMarch26) {
                        eTready = getEpochAtTime(rawData[i][12]);
                        eN = getEpochAtTime(rawData[i][13]);
                        eO = getEpochAtTime(rawData[i][14]);
                        eP = getEpochAtTime(rawData[i][15]);
                        eQ = getEpochAtTime(rawData[i][16]);
                        eR = getEpochAtTime(rawData[i][17]);
                    } else {
                        eM = getEpochAtTime(rawData[i][12]);
                        eN = getEpochAtTime(rawData[i][13]);
                        eO = getEpochAtTime(rawData[i][14]);
                        eP = getEpochAtTime(rawData[i][15]);
                        eQ = getEpochAtTime(rawData[i][16]);
                    }

                    var fixS = function (p, c) { return (p !== null && c !== null && c < p) ? c + 24 * 3600000 : c; };

                    var dP, dB, dQ, dM, dF, dTready, dQCWait;

                    if (isMarch26) {
                        eTready = fixS(eL, eTready);
                        eN = fixS(eTready, eN);
                        eO = fixS(eN, eO);
                        eP = fixS(eO, eP);
                        eQ = fixS(eP, eQ);
                        eR = fixS(eQ, eR);

                        dP = (eTready && eL) ? (eTready - eL) : 0;
                        dTready = (eN && eTready) ? (eN - eTready) : 0;
                        dB = (eO && eN) ? (eO - eN) : 0;
                        dQ = (eP && eO) ? (eP - eO) : 0;
                        dM = (eQ && eP) ? (eQ - eP) : 0;
                        dF = (eR && eQ) ? (eR - eQ) : 0;

                        i71Total_dP += dP / 60000;
                        i71Total_dTready += dTready / 60000;
                        i71Total_dB += dB / 60000;
                        i71Total_dQ += dQ / 60000;
                        i71Total_dM += dM / 60000;
                        i71Total_dF += dF / 60000;
                    } else {
                        eN = fixS(eM, eN); eO = fixS(eN, eO); eP = fixS(eO, eP); eQ = fixS(eP, eQ);
                        dP = (eM && eL) ? (eM - eL) : 0;
                        dB = (eN && eM) ? (eN - eM) : 0;
                        dQ = (eO && eN) ? (eO - eN) : 0;
                        dM = (eP && eO) ? (eP - eO) : 0;
                        dF = (eQ && eP) ? (eQ - eP) : 0;
                        dTready = 0;
                    }

                    var totalBreakdown = Math.max(0.1, (dP + dB + dQ + dM + dF + dTready) / 60000);
                    var rWt = (dP / 60000) / totalBreakdown, rBk = (dB / 60000) / totalBreakdown, rQc = (dQ / 60000) / totalBreakdown, rMnv = (dM / 60000) / totalBreakdown, rFn = (dF / 60000) / totalBreakdown;
                    var rTready = (dTready / 60000) / totalBreakdown;

                    ["1", "2", "3"].forEach(function (sid) {
                        var a = activePerShift[sid];
                        if (isMarch26) {
                            d.shiftData[sid].t_ready = (d.shiftData[sid].t_ready || 0) + (a * rTready);
                        }
                        d.shiftData[sid].wt += a * rWt; d.shiftData[sid].bk += a * rBk; d.shiftData[sid].qct += a * rQc; d.shiftData[sid].mnv += a * rMnv; d.shiftData[sid].fn += a * rFn;
                    });
                } else {
                    var rowMan = 0, rowQC = 0;
                    if (mStart instanceof Date && mEnd instanceof Date) rowMan = (mEnd.getTime() - mStart.getTime()) / 60000;
                    if (qStart instanceof Date && qEnd instanceof Date) rowQC = (qEnd.getTime() - qStart.getTime()) / 60000;
                    var sc = 1, dur = (epochFinish - epochPanggil) / 60000;
                    if (rowMan + rowQC > dur) sc = dur / (rowMan + rowQC);
                    i71TotalMan += rowMan * sc; i71TotalQC += rowQC * sc; sd.qc += rowQC * sc; sd.man += rowMan * sc;
                    intake71Trucks.push({ start: epochPanggil / 60000, end: epochFinish / 60000, mat: rawMat, day: rowDate.getDate(), shift: actualShiftLoop, code: (rawData[i][10] || "").toString().trim().toUpperCase() });
                }

                var durationMins = (epochFinish - epochPanggil) / 60000;
                var truckSpeed = durationMins > 0 ? (rowNetto / 1000) / (durationMins / 60) : 0;
                if (truckSpeed > 0) {
                    if (truckSpeed < i71MinSpeed) i71MinSpeed = truckSpeed;
                    if (truckSpeed > i71MaxSpeed) i71MaxSpeed = truckSpeed;
                    i71TotalSpeedSum += truckSpeed; i71SpeedValidCount++;
                }
                if (rawMat) i71MaterialNetto[rawMat] = (i71MaterialNetto[rawMat] || 0) + rowNetto;

                var subType = (rawData[i][1] || "").toString().toUpperCase().indexOf("TILTING") !== -1 ? "TILTING" : "MANUAL";
                if (!intakeSubTypes[subType]) intakeSubTypes[subType] = { trucks: 0, netto: 0, duration: 0 };
                intakeSubTypes[subType].trucks++;
                intakeSubTypes[subType].netto += rowNetto;
                intakeSubTypes[subType].duration += durationMins;

                if (!i71DailyDetail[dateKey]) i71DailyDetail[dateKey] = { date: dateKey, netto: 0, trucks: 0, activeMin: 0, idleMin: 0, offMin: 0 };
                i71DailyDetail[dateKey].netto += rowNetto;
                i71DailyDetail[dateKey].trucks++;
                i71DailyDetail[dateKey].activeMin += durationMins;
                if (isNewFormat) {
                    i71DailyDetail[dateKey].idleMin += idleDur;
                    i71DailyDetail[dateKey].offMin += offDur;
                }
                if (rowWorkers > 0) {
                    var wKey = rowWorkers.toString();
                    if (!workerStats[wKey]) workerStats[wKey] = { count: rowWorkers, totalNetto: 0, trucks: 0, totalDur: 0 };
                    workerStats[wKey].totalNetto += rowNetto;
                    workerStats[wKey].trucks++;
                    workerStats[wKey].totalDur += durationMins;
                }

                if (epochFinish) lastValidFinish = epochFinish;

                if (truckType) {
                    if (!intakeTruckTypes[truckType]) intakeTruckTypes[truckType] = { trucks: 0, netto: 0, duration: 0, validDurCount: 0, min: 9999, max: 0 };
                    intakeTruckTypes[truckType].trucks++;
                    intakeTruckTypes[truckType].netto += rowNetto;
                    if (durationMins > 0) {
                        intakeTruckTypes[truckType].duration += durationMins;
                        intakeTruckTypes[truckType].validDurCount++;
                        if (durationMins < intakeTruckTypes[truckType].min) intakeTruckTypes[truckType].min = durationMins;
                        if (durationMins > intakeTruckTypes[truckType].max) intakeTruckTypes[truckType].max = durationMins;
                    }
                }
            }
        }

        if (isDG) {
            directTotalNetto += rowNetto;
            directTotalTrucks++;
            if (rawMat) directMaterialNetto[rawMat] = (directMaterialNetto[rawMat] || 0) + rowNetto;
            if (!directDailyAgg[dateKey]) directDailyAgg[dateKey] = { date: dateKey, netto: 0, trucks: 0 };
            var dd = directDailyAgg[dateKey];
            dd.netto += rowNetto;
            dd.trucks++;

            var baseEpochDG = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate()).getTime();
            var getEpochAtTimeDG = function (val) {
                if (val === null || val === undefined || val === "" || val === "-") return null;
                if (val instanceof Date) {
                    var clockStr = Utilities.formatDate(val, ssTZ, "HH:mm:ss");
                    var p = clockStr.split(":");
                    var mins = (parseInt(p[0]) * 60) + parseInt(p[1]) + (parseInt(p[2]) / 60);
                    return baseEpochDG + (mins * 60000);
                }
                var minutes = parseTime(val);
                return baseEpochDG + (minutes * 60000);
            };
            var epPanggil = getEpochAtTimeDG(startTs);
            var epFinish = getEpochAtTimeDG(endTs);
            var durDG = 0;
            if (epPanggil !== null && epFinish !== null) {
                if (epFinish < epPanggil) epFinish += 24 * 3600000;
                durDG = (epFinish - epPanggil) / 60000;
            }

            if (truckType) {
                if (!directTruckTypes[truckType]) directTruckTypes[truckType] = { trucks: 0, netto: 0, duration: 0, validDurCount: 0, min: 9999, max: 0 };
                directTruckTypes[truckType].trucks++;
                directTruckTypes[truckType].netto += rowNetto;
                if (durDG > 0) {
                    directTruckTypes[truckType].duration += durDG;
                    directTruckTypes[truckType].validDurCount++;
                    if (durDG < directTruckTypes[truckType].min) directTruckTypes[truckType].min = durDG;
                    if (durDG > directTruckTypes[truckType].max) directTruckTypes[truckType].max = durDG;
                }
            }
        }
    }

    var daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    var totalMonthMin;
    var now = new Date();
    if (now.getFullYear() === targetYear && (now.getMonth() + 1) === targetMonth) {
        totalMonthMin = ((now.getDate() - 1) * 1440) + (now.getHours() * 60) + now.getMinutes();
    } else {
        totalMonthMin = daysInMonth * 1440;
    }

    var finalIdle = 0, finalOff = 0;
    var hasNewIdleOff = (totalIdleNew > 0 || totalOffNew > 0);
    var hasLegacyTrucks = (intake71Trucks.length > 0);

    if (hasNewIdleOff && !hasLegacyTrucks) {
        finalIdle = totalIdleNew;
        finalOff = totalOffNew;
        var totalUsed = i71ActiveTotalGenerated + finalIdle + finalOff;
        if (totalUsed > totalMonthMin) {
            var scale = totalMonthMin / totalUsed;
            finalIdle *= scale; finalOff *= scale;
        }
    } else if (hasLegacyTrucks && !hasNewIdleOff) {
        var idleLegacy = 0, offLegacy = 0;
        intake71Trucks.sort(function (a, b) { return a.start - b.start; });
        offLegacy += intake71Trucks[0].start;
        for (var j = 0; j < intake71Trucks.length - 1; j++) {
            var gap = intake71Trucks[j + 1].start - intake71Trucks[j].end;
            if (gap > 0) {
                if (intake71Trucks[j].mat === intake71Trucks[j + 1].mat && intake71Trucks[j].code === intake71Trucks[j + 1].code) idleLegacy += gap;
                else offLegacy += gap;
            }
        }
        var lastEnd = intake71Trucks[intake71Trucks.length - 1].end;
        if (totalMonthMin > lastEnd) offLegacy += (totalMonthMin - lastEnd);

        var rawTotal = i71ActiveTotalGenerated + idleLegacy + offLegacy;
        if (rawTotal > totalMonthMin) {
            var leftover = Math.max(0, totalMonthMin - i71ActiveTotalGenerated);
            var gapRatio = (idleLegacy + offLegacy) > 0 ? (idleLegacy / (idleLegacy + offLegacy)) : 0.5;
            finalIdle = leftover * gapRatio;
            finalOff = leftover - finalIdle;
        } else {
            finalIdle = idleLegacy; finalOff = offLegacy;
        }

        Object.values(dailyAgg).forEach(function (dObj) {
            ["1", "2", "3"].forEach(function (s) {
                var sdObj = dObj.shiftData[s];
                var rem = 480 - sdObj.active;
                var sRatio = (finalIdle + finalOff) > 0 ? (finalIdle / (finalIdle + finalOff)) : 0.5;
                sdObj.idle = Math.max(0, Math.round(rem * sRatio));
                sdObj.off = Math.max(0, 480 - sdObj.active - sdObj.idle);
            });
        });
    } else if (hasNewIdleOff && hasLegacyTrucks) {
        var idleLegacy2 = 0, offLegacy2 = 0;
        intake71Trucks.sort(function (a, b) { return a.start - b.start; });
        for (var j2 = 0; j2 < intake71Trucks.length - 1; j2++) {
            var gap2 = intake71Trucks[j2 + 1].start - intake71Trucks[j2].end;
            if (gap2 > 0) {
                if (intake71Trucks[j2].mat === intake71Trucks[j2 + 1].mat && intake71Trucks[j2].code === intake71Trucks[j2 + 1].code) idleLegacy2 += gap2;
                else offLegacy2 += gap2;
            }
        }
        finalIdle = totalIdleNew + idleLegacy2;
        finalOff = totalOffNew + offLegacy2;
        var totalUsedMix = i71ActiveTotalGenerated + finalIdle + finalOff;
        if (totalUsedMix > totalMonthMin) {
            var scaleMix = totalMonthMin / totalUsedMix;
            finalIdle *= scaleMix; finalOff *= scaleMix;
        }
    } else {
        finalOff = totalMonthMin;
    }

    var result = Object.values(dailyAgg).sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (s) {
        return {
            date: s.date, netto: Math.round(s.netto), trucks: s.trucks,
            dist: { intake: Math.round((s.intakeNetto / s.netto) * 100) || 0, direct: Math.round((s.directNetto / s.netto) * 100) || 0 },
            shiftData: s.shiftData
        };
    });

    var i71DailyArr = Object.values(i71DailyDetail).sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (dd) {
        if (!hasNewIdleOff && hasLegacyTrucks) {
            var dObj = dailyAgg[dd.date];
            if (dObj) {
                dd.idleMin = dObj.shiftData["1"].idle + dObj.shiftData["2"].idle + dObj.shiftData["3"].idle;
                dd.offMin = dObj.shiftData["1"].off + dObj.shiftData["2"].off + dObj.shiftData["3"].off;
            }
        }
        dd.tonPerHour = dd.activeMin > 0 ? (dd.netto / 1000) / (dd.activeMin / 60) : 0;
        return dd;
    });

    return {
        status: "success",
        data: result,
        materialBreakdown: materialNetto,
        truckTypes: intakeTruckTypes,
        intake71: {
            activeTotal: Math.round(i71ActiveTotalGenerated),
            netDischarge: Math.round(Math.max(0, i71ActiveTotalGenerated - i71TotalMan - i71TotalQC)),
            manuverTotal: Math.round(i71TotalMan),
            qcTotal: Math.round(i71TotalQC),
            idleLoss: Math.round(finalIdle),
            offSetup: Math.round(finalOff),
            trucks: i71TruckCount,
            nettoKg: Math.round(i71TotalNetto),
            materials: i71MaterialNetto,
            avgSpeed: i71SpeedValidCount > 0 ? (i71TotalSpeedSum / i71SpeedValidCount) : 0,
            minSpeed: i71MinSpeed === 9999 ? 0 : i71MinSpeed,
            maxSpeed: i71MaxSpeed,
            totalMonthMin: totalMonthMin,
            intakeSubTypes: intakeSubTypes,
            dailyDetail: i71DailyArr,
            workerStats: workerStats,
            isMarch26: isMarch26Plus || isFebMix,
            i71_v2: (isMarch26Plus || isFebMix) ? {
                man_awal: Math.round(i71Total_dP),
                wait_qc: Math.round(i71Total_dTready),
                bongkar_awal: Math.round(i71Total_dB),
                hold_qc: Math.round(i71Total_dQ),
                bongkar_lanjut: Math.round(i71Total_dM),
                man_akhir: Math.round(i71Total_dF)
            } : null
        },
        directGudang: {
            totalNetto: Math.round(directTotalNetto), totalTrucks: directTotalTrucks,
            daily: Object.values(directDailyAgg).sort(function (a, b) { return a.date.localeCompare(b.date); }),
            materials: directMaterialNetto, truckTypes: directTruckTypes
        },
        materials: Array.from(materials).sort()
    };
}


function getOutstandingBKKTurbo(ssId, e) {
    return createOutput(fetchOutstandingBKKData(ssId, e), e);
}

function fetchOutstandingBKKData(ssId, e) {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("Monitoring bongkaran");
    var allValues = sheet.getRange(1, 1, 250, 9).getValues();

    var intakeData = [
        { name: allValues[1][1], status: allValues[2][1], material: allValues[3][1] },
        { name: allValues[1][2], status: allValues[2][2], material: allValues[3][2] }
    ];

    var silos = [];
    for (var col = 0; col < 6; col++) {
        var c = 3 + col;
        silos.push({
            id: ["BK1", "BK2", "BK3", "BK4", "BK5", "BK6"][col],
            material: allValues[6][c], vessel: allValues[7][c],
            stock: allValues[8][c], percentage: allValues[9][c],
            age: allValues[10][c], status: allValues[13][c]
        });
    }

    var truckData = [];
    for (var i = 21; i < allValues.length; i++) {
        if (!allValues[i][2] && !allValues[i][3]) continue;

        var mixedStr = (allValues[i][3] || "").toString();
        var dateMatch = mixedStr.match(/(\d{2}[-./]\d{2}[-./]\d{2,4})/);
        var truckDate = dateMatch ? dateMatch[0] : "";
        var parts = truckDate ? mixedStr.split(truckDate) : [mixedStr];
        var truckSeq = (parts[0] || "").trim();

        var gradeVal = (allValues[i][6] || "").toString().trim();
        if (!gradeVal) gradeVal = "NOT YET";

        truckData.push({
            material: allValues[i][2],
            sequence: truckSeq,
            date: truckDate,
            netto: allValues[i][4],
            type: allValues[i][5],
            grade: gradeVal,
            aging: allValues[i][7],
            nopol: mixedStr
        });
    }

    return { intake: intakeData, silos: silos, trucks: truckData };
}

function getBKKCommandCenterData(ssId, e) {
    var live = fetchOutstandingBKKData(ssId, e);
    var analysis = fetchDowntimeData(ssId, e);
    return createOutput({ live: live, analysis: analysis }, e);
}

function createOutput(result, e) {
    var jsonString = JSON.stringify(result);
    var cb = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : null;
    if (cb) {
        return ContentService.createTextOutput(cb + "(" + jsonString + ")")
            .setMimeType(ContentService.MimeType.JAVASCRIPT);
    } else {
        return ContentService.createTextOutput(jsonString).setMimeType(ContentService.MimeType.JSON);
    }
}
