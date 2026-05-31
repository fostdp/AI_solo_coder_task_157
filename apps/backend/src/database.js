const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/ejector.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
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
        sections_data TEXT DEFAULT '[]',
        pressure_distribution TEXT DEFAULT '[]',
        mach_distribution TEXT DEFAULT '[]',
        timestamp INTEGER NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS performance_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pressure_range_start REAL NOT NULL,
        pressure_range_end REAL NOT NULL,
        omega_range_start REAL NOT NULL,
        omega_range_end REAL NOT NULL,
        data_points TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_snapshots_pressure ON snapshots(working_pressure)`);
});

class SnapshotRepository {
    save(snapshot) {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`INSERT INTO snapshots (
                working_pressure, entrainment_ratio, suction_pressure,
                entrainment_coefficient, outlet_pressure, mach_number,
                critical_ratio, mixing_pressure, compression_ratio,
                nozzle_velocity, mixing_velocity, shock_position,
                shock_intensity, is_choked, back_pressure,
                velocity_field, shock_structure, flow_field_data,
                sections_data, pressure_distribution, mach_distribution, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            stmt.run(
                snapshot.workingPressure,
                snapshot.entrainmentRatio,
                snapshot.suctionPressure,
                snapshot.entrainmentCoefficient,
                snapshot.outletPressure,
                snapshot.machNumber,
                snapshot.criticalRatio,
                snapshot.mixingPressure,
                snapshot.compressionRatio,
                snapshot.nozzleVelocity,
                snapshot.mixingVelocity,
                snapshot.shockPosition,
                snapshot.shockIntensity,
                snapshot.isChoked ? 1 : 0,
                snapshot.backPressure,
                JSON.stringify(snapshot.velocityField),
                JSON.stringify(snapshot.shockStructure),
                JSON.stringify(snapshot.flowFieldData),
                JSON.stringify(snapshot.sectionsData || []),
                JSON.stringify(snapshot.pressureDistribution || []),
                JSON.stringify(snapshot.machDistribution || []),
                Date.now(),
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
            stmt.finalize();
        });
    }

    findById(id) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM snapshots WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(this._deserialize(row));
            });
        });
    }

    findAll(limit = 100) {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT ?', [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(r => this._deserialize(r)));
            });
        });
    }

    streamAll(callback) {
        return new Promise((resolve, reject) => {
            db.each('SELECT * FROM snapshots ORDER BY timestamp DESC', (err, row) => {
                if (err) reject(err);
                else callback(this._deserialize(row));
            }, (err, count) => {
                if (err) reject(err);
                else resolve(count);
            });
        });
    }

    _deserialize(row) {
        if (!row) return null;
        return {
            ...row,
            velocity_field: JSON.parse(row.velocity_field),
            shock_structure: JSON.parse(row.shock_structure),
            flow_field_data: JSON.parse(row.flow_field_data || '{}'),
            sections_data: JSON.parse(row.sections_data || '[]'),
            pressure_distribution: JSON.parse(row.pressure_distribution || '[]'),
            mach_distribution: JSON.parse(row.mach_distribution || '[]'),
            is_choked: row.is_choked === 1
        };
    }
}

module.exports = {
    db,
    SnapshotRepository
};
