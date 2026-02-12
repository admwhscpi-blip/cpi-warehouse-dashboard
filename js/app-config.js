const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbwnStVw3UhKxgQDuTfufSlNMaTrf4ZpXC0FPAp6AK96t-YIJQNcJ1h0rtkbM2XlxPCr/exec",
    BIN_SWEEPING_API_URL: "https://script.google.com/macros/s/AKfycbynVL7SFG8TBeTbu2PjO2eGIgM1JkQcV8nT3zsoi6zWc4cArJ23VQfTgjtLyyTZCQFM/exec",
    DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbxDerZpvftORq993r2EfGnG7gpALFWsXxA21mWe-xMzHCE-5wmJpDJXKNl29hgW-GQz/exec",
    BKK_API_URL: "https://script.google.com/macros/s/AKfycbyPfRevZowqZVX_yCNX-k3x92fpp6IJw6hA1S-7w_Suy8FYMJ50dERWHYYIVqmVb3F3/exec?action=getData",
    BKK_DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbyPfRevZowqZVX_yCNX-k3x92fpp6IJw6hA1S-7w_Suy8FYMJ50dERWHYYIVqmVb3F3/exec?action=getDowntime",

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
        "81004": "COPPER",
        "81005": "ALUMINIUM",
        "81006": "IRON ORE",
        "81007": "ZINC",
        "81008": "NICKEL",
        "81009": "TIN",
        "81010": "LEAD",
        "81011": "MANGANESE",
        "81012": "CHROMIUM",
        "81013": "TITANIUM"
    }
};
