const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'ejector.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    working_pressure REAL NOT NULL,
    entrainment_ratio REAL NOT NULL,
    suction_pressure REAL DEFAULT 10,
    timestamp INTEGER NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    working_pressure REAL NOT NULL,
    entrainment_ratio REAL NOT NULL,
    suction_pressure REAL DEFAULT 10,
    entrainment_coefficient REAL NOT NULL,
    outlet_pressure REAL NOT NULL,
    mach_number REAL DEFAULT 0,
    critical_ratio REAL DEFAULT 0,
    mixing_pressure REAL DEFAULT 0,
    compression_ratio REAL DEFAULT 0,
    nozzle_velocity REAL DEFAULT 0,
    mixing_velocity REAL DEFAULT 0,
    shock_position REAL DEFAULT 0,
    shock_intensity REAL DEFAULT 0,
    is_choked INTEGER DEFAULT 0,
    back_pressure REAL DEFAULT 0,
    velocity_field TEXT NOT NULL,
    shock_structure TEXT NOT NULL,
    flow_field_data TEXT DEFAULT '{}',
    timestamp INTEGER NOT NULL
  )`);

  console.log('数据库初始化完成');
});

module.exports = db;
