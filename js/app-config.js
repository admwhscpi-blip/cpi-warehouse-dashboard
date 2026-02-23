const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbwnStVw3UhKxgQDuTfufSlNMaTrf4ZpXC0FPAp6AK96t-YIJQNcJ1h0rtkbM2XlxPCr/exec",
    BIN_SWEEPING_API_URL: "https://script.google.com/macros/s/AKfycbynVL7SFG8TBeTbu2PjO2eGIgM1JkQcV8nT3zsoi6zWc4cArJ23VQfTgjtLyyTZCQFM/exec",
    DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbw1PJPdD3d8QKE3RLZTzR76INGMI-kd1anfRbZqH1-cyilaAkk6uFu215pmqKWYNZEE/exec",
    // v20.2.0: Analytics V2 URL (same deployment as entry-downtime, uses getAnalyticsV2 action)
    ANALYTICS_V2_URL: "https://script.google.com/macros/s/AKfycbw1PJPdD3d8QKE3RLZTzR76INGMI-kd1anfRbZqH1-cyilaAkk6uFu215pmqKWYNZEE/exec?action=getAnalyticsV2",
    BKK_API_URL: "https://script.google.com/macros/s/AKfycbw-YyDZiZFi7wrs9X6a1Bnp05E_cWHY15Cw-cKRfbO2lWoXkJMPysEe2uh1AJBsvXkN/exec?action=getData",
    BKK_DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbzuZHDXEdLE7v5hkRniOi4NY5N0PfQjKDGnkJDNIgJgd547WlshjoeP9pGHG6yPOi7y/exec?action=getDowntimeQuery",
    OVERTIME_API_URL: "https://script.google.com/macros/s/AKfycbwjxJVAhHSpYY9taTQ5SR7A00M3pQfHdm9lXO33Zr88EDS1awbrFj2xkpeN0rOGomaI/exec",


    // Konfigurasi konversi satuan
    UNIT_DIVIDER: 1000,
    UNIT_LABEL: "TON",

    // Manual Capacities
    WAREHOUSE_CAPACITIES: {
        "RM": 10000,
        "GEBANG-A": 2500,
        "GEBANG-B": 1500,
        "SAMPING-C": 2500,
        "SAMPING-D": 2500,
        "SAMPING-E": 4000,
        "SAMPING-F": 3000
    },

    // Material Code Mapping
    MATERIAL_CODES: {
        "81014": "LIMESTONE",
        "401200": "RICE BRAN"
        // Kode lainnya akan ditarik dinamis dari database oleh Admin Pusat v9.0
    }
};
