const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbwnStVw3UhKxgQDuTfufSlNMaTrf4ZpXC0FPAp6AK96t-YIJQNcJ1h0rtkbM2XlxPCr/exec",
    BIN_SWEEPING_API_URL: "https://script.google.com/macros/s/AKfycbynVL7SFG8TBeTbu2PjO2eGIgM1JkQcV8nT3zsoi6zWc4cArJ23VQfTgjtLyyTZCQFM/exec",
    DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbw89miuaaa3UY7IxQbqLqHy2yzk0yQ63AEiZn018qO0g0MEsGwm_2Z2wfZM4nqlUY85/exec",
    // v20.2.0: Analytics V2 URL (same deployment as entry-downtime, uses getAnalyticsV2 action)
    ANALYTICS_V2_URL: "https://script.google.com/macros/s/AKfycbx51fyaTwo8jYFsYW87c_Iad9xOoBaP-8Z12yFpnhxE8thpne3a74DVgO2kIWYjEWCS/exec?action=getAnalyticsV2",
    BKK_API_URL: "https://script.google.com/macros/s/AKfycbw-YyDZiZFi7wrs9X6a1Bnp05E_cWHY15Cw-cKRfbO2lWoXkJMPysEe2uh1AJBsvXkN/exec?action=getData",
    BKK_DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbxlr7oTe5pD6psW9DC4gKMdLH2XqWHcK3E-cBYvzQrml1-7-U-JKH-5JoyBMBBjuL3W/exec?action=getDowntimeQuery",
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
