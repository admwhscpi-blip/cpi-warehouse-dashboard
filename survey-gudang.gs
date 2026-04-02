function doGet(e) {
  // Hanya return blank page untuk GET request sederhana
  return ContentService.createTextOutput("Smart Warehouse Survey API is Active.");
}

function doPost(e) {
  try {
    // Membaca payload request (dikirim lewat mode 'no-cors' atau POST standard)
    const rawData = e.postData.contents;
    const p = JSON.parse(rawData);

    // Ganti dengan ID Spreadsheet milik Anda sendiri
    const SPREADSHEET_ID = "MASUKKAN_ID_SPREADSHEET_ANDA_DI_SINI";
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Asumsi nama sheet Anda adalah "Data Survey"
    let sheet = ss.getSheetByName("Data Survey");
    
    // Jika sheet belum ada, buat baru dan pasang header
    if (!sheet) {
      sheet = ss.insertSheet("Data Survey");
      sheet.appendRow([
        "WAKTU UPDATE", "ID", "NAMA GUDANG", "LATITUDE", "LONGITUDE", 
        "LUAS", "PANJANG", "SPEK", "LINGKUNGAN", "KONTAK WA", 
        "DOKUMEN URL", "FOTO URL", "HARGA METER", "MIN SEWA", "KETERANGAN"
      ]);
      // Membekukan baris pertama (header)
      sheet.setFrozenRows(1);
    }

    // Jika Aksi adalah saveSurvey
    if (p.action === 'saveSurvey') {
      const rowData = [
        new Date().toISOString(), // Waktu Server
        p.id || '',
        p.nama || '',
        p.lat || '',
        p.lng || '',
        p.luas || '',
        p.panjang || '',
        p.spek || '',
        p.lingkungan || '',
        p.kontak || '',
        p.dokumen || '',
        p.foto || '',
        p.hargaMeter || '',
        p.minSewa || '',
        p.ket || ''
      ];
      
      sheet.appendRow(rowData);
      
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        message: "Data Survey berhasil disimpan ke Sheets." 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      message: "Action tidak dikenali." 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.message 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
