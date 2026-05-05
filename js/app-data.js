// app-data.js
// Fokus pada komunikasi dengan API dan pengolahan data

const DataService = {
    fetchData: async function () {
        try {
            // Anti-cache param & Action param
            const url = `${CONFIG.API_URL}?action=getData&t=${new Date().getTime()}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Gagal mengambil data");
            const raw = await response.json();

            // Handle New Comprehensive API Structure
            if (raw.success) {
                const data = {
                    warehouses: raw.warehouses || [],
                    capacities: raw.capacities || [],
                    materials: raw.materials || []
                };

                // 1. Sanitize Capacities (Ensure numbers)
                data.capacities = data.capacities.map(c => parseFloat(c) || 0);

                // 2. Sanitize Materials
                data.materials.forEach(mat => {
                    if (!mat.stocks) mat.stocks = new Array(data.warehouses.length).fill(0);
                    mat.stocks = mat.stocks.map(s => {
                        const num = parseFloat(s);
                        return isNaN(num) ? 0 : num;
                    });
                });

                return data;
            }

            throw new Error("Struktur data API tidak valid");
        } catch (error) {
            console.error("Error Fetching Data:", error);
            alert(`Gagal mengambil data: ${error.message}. \n\nPastikan koneksi internet lancar dan URL Google Apps Script di app-config.js sudah benar.`);
            return null;
        }
    },

    convertKgToTon: function (kgValue) {
        // Konversi KG ke TON sesuai aturan
        return (kgValue / CONFIG.UNIT_DIVIDER).toFixed(2); // 2 desimal
    },

    processGlobalStats: function (data) {
        let totalCapacity = 0;
        let totalFilled = 0;

        // 1. Total Capacity from array
        totalCapacity = data.capacities.reduce((a, b) => a + b, 0);

        // 2. Total Filled from materials breakdown
        data.materials.forEach(mat => {
            totalFilled += mat.stocks.reduce((a, b) => a + b, 0);
        });

        return {
            totalCapacity: totalCapacity,
            totalFilled: totalFilled,
            totalSpace: totalCapacity - totalFilled,
            percentage: totalCapacity > 0 ? (totalFilled / totalCapacity) * 100 : 0
        };
    },

    getAnalytics: function (data) {
        // Gabungkan semua stok per material
        const processedMaterials = data.materials.map(mat => {
            const totalKg = mat.stocks.reduce((a, b) => a + b, 0);
            return {
                name: mat.name,
                totalKg: totalKg,
                totalTon: parseFloat((totalKg / CONFIG.UNIT_DIVIDER).toFixed(2)) // Store as number for sorting
            };
        });

        // Sort Highest to Lowest
        const sortedByStock = [...processedMaterials].sort((a, b) => b.totalTon - a.totalTon);

        // Top 10
        const top10 = sortedByStock.slice(0, 10);

        // Zero Stock Items (Potential Issue)
        const zeroStocks = processedMaterials.filter(m => m.totalTon <= 0);

        return {
            top10: top10,
            zeroStockCount: zeroStocks.length,
            totalItems: processedMaterials.length
        };
    },

    searchMaterials: function (data, query) {
        if (!query || query.length < 2) return [];

        const lowerQuery = query.toLowerCase();

        // Filter material yang namanya mengandung query
        const matches = data.materials.filter(m => m.name.toLowerCase().includes(lowerQuery));

        // Format hasil pencarian agar siap diajak tampil
        return matches.map(mat => {
            const totalKg = mat.stocks.reduce((a, b) => a + b, 0);

            // Cari distribusi (Gudang mana saja yang punya stok > 0)
            const distribution = [];
            mat.stocks.forEach((qty, index) => {
                if (qty > 0) {
                    distribution.push({
                        warehouse: data.warehouses[index],
                        qtyTon: parseFloat((qty / CONFIG.UNIT_DIVIDER).toFixed(2)),
                        // Hitung persentase kontribusi gudang ini terhadap total stok material ini
                        percent: totalKg > 0 ? (qty / totalKg) * 100 : 0
                    });
                }
            });

            // Sortir distribusi dari stok terbanyak
            distribution.sort((a, b) => b.qtyTon - a.qtyTon);

            return {
                name: mat.name,
                totalTon: parseFloat((totalKg / CONFIG.UNIT_DIVIDER).toFixed(2)),
                distribution: distribution
            };
        });
    },

    getCategoryStats: function (data) {
        const categoryMap = {};
        let totalGlobalTon = 0;

        // Agregasi stok per kategori
        data.materials.forEach(mat => {
            const catName = mat.category || "Lainnya";
            const totalKg = mat.stocks.reduce((a, b) => a + b, 0);
            const contentTon = totalKg / CONFIG.UNIT_DIVIDER;

            if (!categoryMap[catName]) categoryMap[catName] = 0;
            categoryMap[catName] += contentTon;
            totalGlobalTon += contentTon;
        });

        // Convert to Array & Sort
        const categories = Object.keys(categoryMap).map(key => {
            return {
                name: key,
                totalTon: parseFloat(categoryMap[key].toFixed(2)),
                percent: totalGlobalTon > 0 ? (categoryMap[key] / totalGlobalTon) * 100 : 0
            };
        });

        // Sort descending
        return categories.sort((a, b) => b.totalTon - a.totalTon);
    },

    /** Normalisasi payload dashboard RM (live atau snapshot). */
    sanitizeRmDashboard: function (data) {
        if (!data) return null;
        const d = {
            warehouses: (data.warehouses || []).map(function (w) {
                return String(w == null ? '' : w);
            }),
            capacities: (data.capacities || []).map(function (c) {
                return parseFloat(c) || 0;
            }),
            materials: []
        };
        const n = d.warehouses.length;
        (data.materials || []).forEach(function (mat) {
            if (!mat || mat.name == null || String(mat.name).trim() === '') return;
            var stocks = mat.stocks;
            if (!stocks || !stocks.length) stocks = new Array(n).fill(0);
            stocks = stocks.map(function (s) {
                var num = parseFloat(s);
                return isNaN(num) ? 0 : num;
            });
            while (stocks.length < n) stocks.push(0);
            if (stocks.length > n) stocks = stocks.slice(0, n);
            d.materials.push({
                name: mat.name,
                category: mat.category,
                stocks: stocks
            });
        });
        return d;
    },

    buildSnapshotPayload: function (data) {
        var s = this.sanitizeRmDashboard(data);
        return JSON.stringify(s);
    },

    fetchRmSnapshot: async function (tanggal) {
        var t = encodeURIComponent(String(tanggal || '').substring(0, 10));
        var url = CONFIG.API_URL + '?action=getRmSnapshot&tanggal=' + t + '&t=' + Date.now();
        var r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var j = await r.json();
        if (!j.success || !j.data) return null;
        return this.sanitizeRmDashboard(j.data);
    },

    fetchRmSnapshotList: async function () {
        try {
            var url = CONFIG.API_URL + '?action=getRmSnapshotList&t=' + Date.now();
            var r = await fetch(url);
            if (!r.ok) return [];
            var j = await r.json();
            return j.success && Array.isArray(j.dates) ? j.dates : [];
        } catch (e) {
            return [];
        }
    },

    postRmSnapshot: async function (tanggal, data) {
        var payload = this.buildSnapshotPayload(data);
        var body = JSON.stringify({
            action: 'saveRmSnapshot',
            tanggal: String(tanggal || '').substring(0, 10),
            payload: payload
        });
        var r = await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: body
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var j = await r.json();
        return j && j.success === true;
    },

    rmSnapshotLocalKey: function (tanggal) {
        return 'rm_dash_snap_' + String(tanggal || '').substring(0, 10);
    },

    saveRmSnapshotLocal: function (tanggal, data) {
        try {
            localStorage.setItem(this.rmSnapshotLocalKey(tanggal), this.buildSnapshotPayload(data));
            return true;
        } catch (e) {
            return false;
        }
    },

    loadRmSnapshotLocal: function (tanggal) {
        try {
            var raw = localStorage.getItem(this.rmSnapshotLocalKey(tanggal));
            if (!raw) return null;
            return this.sanitizeRmDashboard(JSON.parse(raw));
        } catch (e) {
            return null;
        }
    },

    listRmSnapshotLocal: function () {
        var out = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf('rm_dash_snap_') === 0) {
                var d = k.replace('rm_dash_snap_', '');
                if (/^\d{4}-\d{2}-\d{2}$/.test(d) && out.indexOf(d) === -1) out.push(d);
            }
        }
        out.sort();
        out.reverse();
        return out;
    }
};
