const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbx1Yzv7msS9UD55QTUxbVgzPwXN4p2JXTv6KfJNxY8-NzEedx2ncWuvognZc6SkSBs/exec",
    BIN_SWEEPING_API_URL: "https://script.google.com/macros/s/AKfycbynVL7SFG8TBeTbu2PjO2eGIgM1JkQcV8nT3zsoi6zWc4cArJ23VQfTgjtLyyTZCQFM/exec",
    DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbw89miuaaa3UY7IxQbqLqHy2yzk0yQ63AEiZn018qO0g0MEsGwm_2Z2wfZM4nqlUY85/exec",
    CPO_DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbxIvYIvhLNvjIcyz1RbCYbGw22UbkOznHOujfq6u7vzt6NzQVk5FmNGIZVz2689Lj0X/exec",
    // v20.2.0: Analytics V2 URL (uses Entry Bongkar Sheet)
    ANALYTICS_V2_URL: "https://script.google.com/macros/s/AKfycbzntaHSU52NwHWbNwg6tKYV2AGVxlV2SJAufnqUTN-4pyQuZ9I-Ejk1PnwebBpoikr3/exec?action=getAnalyticsV2",
    ENTRY_BONGKAR_API_URL: "https://script.google.com/macros/s/AKfycbzntaHSU52NwHWbNwg6tKYV2AGVxlV2SJAufnqUTN-4pyQuZ9I-Ejk1PnwebBpoikr3/exec",
    BKK_API_URL: "https://script.google.com/macros/s/AKfycbxxraeW-Sv0zZEc8uogQ04Z2FKHt9jPhnTNZFDpRnTdPCI3o5_iNeXYUandFk5h3NVJ/exec?action=getData",
    BKK_DOWNTIME_API_URL: "https://script.google.com/macros/s/AKfycbxlr7oTe5pD6psW9DC4gKMdLH2XqWHcK3E-cBYvzQrml1-7-U-JKH-5JoyBMBBjuL3W/exec?action=getDowntimeQuery",
    OVERTIME_API_URL: "https://script.google.com/macros/s/AKfycbwjxJVAhHSpYY9taTQ5SR7A00M3pQfHdm9lXO33Zr88EDS1awbrFj2xkpeN0rOGomaI/exec",
    AGING_API_URL: "https://script.google.com/macros/s/AKfycbzYHxeRD0CIQs3P30YB-pPtg34Rs2qaIrApm4FibPTsEqX7RMkH_9WGeLhoGDaeir7nxw/exec",
    TREATMENT_API_URL: "https://script.google.com/macros/s/AKfycbzzB0fl9Z_AkBIcRoKWx60Xqi9w71aMKIItzD8a76vGIC9kp2UocJNDaxrE-2w1WM_XYg/exec",


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
        "SAMPING-F": 3000,
        "GUDANG HINO": 1000,
        "KOPO 6": 1500
    },

    // Material Code Mapping
    MATERIAL_CODES: {
        "81014": "LIMESTONE",
        "401200": "RICE BRAN"
        // Kode lainnya akan ditarik dinamis dari database oleh Admin Pusat v9.0
    }
};
