var CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwJu8Ba6nLw4erqYY8SyKiD0a7WGFbqJqCJF_5YdMw0-F8PL4uKxTqY0ez4hVsAx7g/exec',
  PAGE_SIZES: { default: 20, sap: 20 }
};

// ── USERS ───────────────────────────────────────────────────────
var USERS_DATABASE = [
  // Input Data Kirim
  { username: 'udin',  password: '1891', nama: 'Udin',  role: 'kirim',  bk: [] },
  { username: 'asep',  password: '1891', nama: 'Asep',  role: 'kirim',  bk: [] },
  { username: 'ajis',  password: '1891', nama: 'Ajis',   role: 'kirim',  bk: [] },
  // Input Data Bongkar
  { username: 'yadi',  password: '1891', nama: 'Yadi',   role: 'bongkar', bk: [] },
  { username: 'antu',  password: '1891', nama: 'Antu',   role: 'bongkar', bk: [] },
  { username: 'kotim', password: '1891', nama: 'Kotim',  role: 'bongkar', bk: [] },
  { username: 'harun', password: '1891', nama: 'Harun',  role: 'bongkar_only', bk: [] },
  { username: 'jefry', password: '1891', nama: 'Jefry',  role: 'bongkar_only', bk: [] },
  { username: 'basit', password: '1891', nama: 'Basit',  role: 'bongkar_only', bk: [] },
  // Input Data Stock Opname
  { username: 'hadi',  password: '1891', nama: 'Hadi',  role: 'opname',  bk: [] },
  { username: 'safii', password: '1891', nama: 'Safii', role: 'opname',  bk: [] },
  { username: 'ade',   password: '1891', nama: 'Ade',   role: 'opname',  bk: [] },
  // Admin (semua akses)
  { username: 'cecep', password: '1891', nama: 'Cecep', role: 'admin',   bk: [] },
  { username: 'arif',  password: '1891', nama: 'Arif', role: 'admin',   bk: [] }
];

var ROLE_PERMISSIONS = {
  admin:   { dashboard: true, bongkar: true, kirim: true, opname: true, ceksap: true, history: true, kartustock: true, outstanding: true, durbreakdown: true, intake71: true },
  kirim:   { dashboard: true, bongkar: false, kirim: true, opname: false, ceksap: true, history: true, kartustock: true, outstanding: true, durbreakdown: true, intake71: true },
  bongkar: { dashboard: true, bongkar: true, kirim: false, opname: false, ceksap: true, history: true, kartustock: true, outstanding: true, durbreakdown: true, intake71: true },
  opname:  { dashboard: true, bongkar: false, kirim: false, opname: true, ceksap: true, history: true, kartustock: true, outstanding: true, durbreakdown: true, intake71: true },
  bongkar_only: { dashboard: true, bongkar: true, kirim: false, opname: false, ceksap: false, history: false, kartustock: false, outstanding: false, durbreakdown: false, intake71: false }
};
