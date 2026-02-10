function doGet() {
    // --- KONFIGURASI STRICT (SESUAI PROMPT AWAL) ---
    const SHEET_NAME = "Stock Daily";

    // Koordinat Baris & Kolom (1-based index)
    // Nama Gudang: C2:I2 -> Baris 2, Kolom 3 sd 9
    const ROW_HEADER_WH = 2;
    const COL_START_WH = 3;  // C
    const COL_END_WH = 9;    // I

    // Data Material: Mulai Baris 3
    const ROW_DATA_START = 3;
    // Batas Baris Data (Bisa diset manual atau auto)
    // Prompt bilang B3:B111, jadi sampai 111.
    const ROW_DATA_END = 111;

    // Kapasitas Gudang: C113:I113 -> Baris 113
    const ROW_CAPACITY = 113;

    // Kolom Material: B -> 2
    const COL_MATERIAL_NAME = 2;
    // Kolom Kategori: K -> 11
    const COL_CATEGORY = 11;
    const COL_KODE = 10; // J (biasanya kode) - Optional

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);

    // 1. Ambil Nama Gudang (C2:I2)
    const numWarehouses = COL_END_WH - COL_START_WH + 1; // 9 - 3 + 1 = 7 Gudang
    const warehouseNames = sheet.getRange(ROW_HEADER_WH, COL_START_WH, 1, numWarehouses).getValues()[0];

    // 2. Ambil Kapasitas (C113:I113)
    let capacities = [];
    try {
        capacities = sheet.getRange(ROW_CAPACITY, COL_START_WH, 1, numWarehouses).getValues()[0];
    } catch (e) {
        // Fallback jika error
        capacities = new Array(numWarehouses).fill(0);
    }

    // 3. Ambil Data Material (Baris 3 sd 111)
    // Ambil area besar dari kolom B sampai I (Material sd Gudang terakhir)
    const numRows = ROW_DATA_END - ROW_DATA_START + 1;
    // Range: Baris 3, Kolom 2 (B), numRows, sampai Kolom 11 (K) untuk cover Kategori
    const dataRange = sheet.getRange(ROW_DATA_START, COL_MATERIAL_NAME, numRows, COL_CATEGORY - COL_MATERIAL_NAME + 1).getValues();

    const materials = [];

    dataRange.forEach(row => {
        // Row index 0 maps to Col B (Material Name)
        const matName = row[0];

        // Category is at index: COL_CATEGORY - COL_MATERIAL_NAME = 11 - 2 = 9
        const category = row[9];

        if (matName && matName.toString().trim() !== "") {
            // Stocks ada di index 1 (karena mulai dari B). 
            // MatName=idx0(B), Stocks=idx1(C)...idx7(I)
            // Kita butuh mengambil slice dari index 1 sepanjang numWarehouses
            const stocksRaw = row.slice(1, 1 + numWarehouses);

            const stocks = stocksRaw.map(v => {
                return (typeof v === 'number') ? v : 0;
            });

            materials.push({
                name: matName,
                category: category,
                stocks: stocks
            });
        }
    });

    const output = {
        // Debug info
        meta: {
            range_header: `Row ${ROW_HEADER_WH}, Cols ${COL_START_WH}-${COL_END_WH}`,
            range_capacity: `Row ${ROW_CAPACITY}`,
            range_data: `Row ${ROW_DATA_START}-${ROW_DATA_END}`
        },
        warehouses: warehouseNames,
        capacities: capacities,
        materials: materials
    };

    return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}
