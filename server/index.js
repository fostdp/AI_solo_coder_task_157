const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/parameters', (req, res) => {
  const { workingPressure, entrainmentRatio, suctionPressure, timestamp } = req.body;
  db.run(
    'INSERT INTO parameters (working_pressure, entrainment_ratio, suction_pressure, timestamp) VALUES (?, ?, ?, ?)',
    [workingPressure, entrainmentRatio, suctionPressure || 10, timestamp || Date.now()],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, workingPressure, entrainmentRatio });
    }
  );
});

app.get('/api/parameters', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  db.all(
    'SELECT * FROM parameters ORDER BY timestamp DESC LIMIT ?',
    [limit],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows.map(row => ({
        id: row.id,
        workingPressure: row.working_pressure,
        entrainmentRatio: row.entrainment_ratio,
        suctionPressure: row.suction_pressure || 10,
        timestamp: row.timestamp
      })));
    }
  );
});

app.post('/api/snapshots', (req, res) => {
  const { 
    workingPressure, entrainmentRatio, suctionPressure,
    entrainmentCoefficient, outletPressure, machNumber, criticalRatio,
    mixingPressure, compressionRatio, nozzleVelocity, mixingVelocity,
    shockPosition, shockIntensity, isChoked, backPressure,
    velocityField, shockStructure, flowFieldData, timestamp 
  } = req.body;
  
  db.run(
    `INSERT INTO snapshots (
      working_pressure, entrainment_ratio, suction_pressure,
      entrainment_coefficient, outlet_pressure, mach_number, critical_ratio,
      mixing_pressure, compression_ratio, nozzle_velocity, mixing_velocity,
      shock_position, shock_intensity, is_choked, back_pressure,
      velocity_field, shock_structure, flow_field_data, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workingPressure, entrainmentRatio, suctionPressure || 10,
      entrainmentCoefficient, outletPressure, machNumber || 0, criticalRatio || 0,
      mixingPressure || 0, compressionRatio || 0, nozzleVelocity || 0, mixingVelocity || 0,
      shockPosition || 0, shockIntensity || 0, isChoked ? 1 : 0, backPressure || 0,
      JSON.stringify(velocityField), JSON.stringify(shockStructure), 
      JSON.stringify(flowFieldData || {}), timestamp || Date.now()
    ],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID });
    }
  );
});

app.get('/api/snapshots', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  db.all(
    'SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT ?',
    [limit],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows.map(row => ({
        id: row.id,
        workingPressure: row.working_pressure,
        entrainmentRatio: row.entrainment_ratio,
        suctionPressure: row.suction_pressure || 10,
        entrainmentCoefficient: row.entrainment_coefficient,
        outletPressure: row.outlet_pressure,
        machNumber: row.mach_number || 0,
        criticalRatio: row.critical_ratio || 0,
        mixingPressure: row.mixing_pressure || 0,
        compressionRatio: row.compression_ratio || 0,
        nozzleVelocity: row.nozzle_velocity || 0,
        mixingVelocity: row.mixing_velocity || 0,
        shockPosition: row.shock_position || 0,
        shockIntensity: row.shock_intensity || 0,
        isChoked: !!row.is_choked,
        backPressure: row.back_pressure || 0,
        velocityField: JSON.parse(row.velocity_field),
        shockStructure: JSON.parse(row.shock_structure),
        flowFieldData: JSON.parse(row.flow_field_data || '{}'),
        timestamp: row.timestamp
      })));
    }
  );
});

app.delete('/api/parameters/:id', (req, res) => {
  db.run('DELETE FROM parameters WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ deleted: this.changes });
  });
});

app.delete('/api/snapshots/:id', (req, res) => {
  db.run('DELETE FROM snapshots WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ deleted: this.changes });
  });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
