const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbwnStVw3UhKxgQDuTfufSlNMaTrf4ZpXC0FPAp6AK96t-YIJQNcJ1h0rtkbM2XlxPCr/exec",
    BIN_SWEEPING_API_URL: "https://script.google.com/macros/s/AKfycbynVL7SFG8TBeTbu2PjO2eGIgM1JkQcV8nT3zsoi6zWc4cArJ23VQfTgjtLyyTZCQFM/exec",
    DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbz5T3VLH7k-lwJ8JsnM8aNtJsN7p6YiHWkp1kldDSZHzjbDvNMLdCFu7BUCjk0RI5oF/exec",

    // Konfigurasi konversi satuan
    UNIT_DIVIDER: 1000,
    UNIT_LABEL: "TON",

    // Manual Capacities (since API returns current stock as 'capacity')
    WAREHOUSE_CAPACITIES: {
        "RM": 10000,
        "GEBANG-A": 2500,
        "GEBANG-B": 1500,
        "SAMPING-C": 2500,
        "SAMPING-D": 2500,
        "SAMPING-E": 4000,
        "SAMPING-F": 3000
    },

    // Material Code Mapping (Kode -> Nama Material)
    MATERIAL_CODES: {
        "401200": "RICE BRAN",
        "81014": "LIMESTONE"
    }
};
