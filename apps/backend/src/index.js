const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Readable } = require('stream');

const { OneDimensionalEjectorModel } = require('@steam-ejector/shared');
const { SnapshotRepository } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const snapshotRepo = new SnapshotRepository();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

const ejector = new OneDimensionalEjectorModel();

class SimulationStream extends Readable {
    constructor(config = {}) {
        super({ objectMode: true });
        this.startPressure = config.startPressure || 0.3;
        this.endPressure = config.endPressure || 1.0;
        this.pressureStep = config.pressureStep || 0.1;
        this.omega = config.omega || 0.5;
        this.currentPressure = this.startPressure;
        this.ejector = new OneDimensionalEjectorModel();
    }

    _read() {
        if (this.currentPressure > this.endPressure) {
            this.push(null);
            return;
        }

        this.ejector.setOperatingConditions(this.currentPressure, this.omega, 10);
        const state = this.ejector.solve();
        
        this.push({
            pressure: this.currentPressure,
            ...state,
            timestamp: Date.now()
        });

        this.currentPressure += this.pressureStep;
    }
}

class OmegaSweepStream extends Readable {
    constructor(config = {}) {
        super({ objectMode: true });
        this.startOmega = config.startOmega || 0.1;
        this.endOmega = config.endOmega || 1.0;
        this.omegaStep = config.omegaStep || 0.1;
        this.pressure = config.pressure || 0.8;
        this.currentOmega = this.startOmega;
        this.ejector = new OneDimensionalEjectorModel();
    }

    _read() {
        if (this.currentOmega > this.endOmega) {
            this.push(null);
            return;
        }

        this.ejector.setOperatingConditions(this.pressure, this.currentOmega, 10);
        const state = this.ejector.solve();
        
        this.push({
            omega: this.currentOmega,
            ...state,
            timestamp: Date.now()
        });

        this.currentOmega += this.omegaStep;
    }
}

app.post('/api/simulate', (req, res) => {
    const { workingPressure, entrainmentRatio, suctionPressure = 10 } = req.body;
    
    ejector.setOperatingConditions(workingPressure, entrainmentRatio, suctionPressure);
    const state = ejector.solve();
    
    res.json({
        success: true,
        data: state
    });
});

app.get('/api/simulate/stream/pressure', (req, res) => {
    const { start = 0.3, end = 1.0, step = 0.1, omega = 0.5 } = req.query;
    
    const stream = new SimulationStream({
        startPressure: parseFloat(start),
        endPressure: parseFloat(end),
        pressureStep: parseFloat(step),
        omega: parseFloat(omega)
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    res.write('[');
    let first = true;
    
    stream.on('data', (chunk) => {
        if (!first) {
            res.write(',');
        }
        first = false;
        res.write(JSON.stringify(chunk));
    });
    
    stream.on('end', () => {
        res.write(']');
        res.end();
    });
    
    stream.on('error', (err) => {
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/simulate/stream/omega', (req, res) => {
    const { start = 0.1, end = 1.0, step = 0.1, pressure = 0.8 } = req.query;
    
    const stream = new OmegaSweepStream({
        startOmega: parseFloat(start),
        endOmega: parseFloat(end),
        omegaStep: parseFloat(step),
        pressure: parseFloat(pressure)
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    res.write('[');
    let first = true;
    
    stream.on('data', (chunk) => {
        if (!first) {
            res.write(',');
        }
        first = false;
        res.write(JSON.stringify(chunk));
    });
    
    stream.on('end', () => {
        res.write(']');
        res.end();
    });
    
    stream.on('error', (err) => {
        res.status(500).json({ error: err.message });
    });
});

app.get('/api/snapshots/stream', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    res.write('[');
    let first = true;
    
    try {
        await snapshotRepo.streamAll((snapshot) => {
            if (!first) {
                res.write(',');
            }
            first = false;
            res.write(JSON.stringify(snapshot));
        });
        
        res.write(']');
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/snapshots', async (req, res) => {
    try {
        const result = await snapshotRepo.save(req.body);
        res.json({ success: true, id: result.id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/snapshots', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const snapshots = await snapshotRepo.findAll(limit);
        res.json({ success: true, data: snapshots });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/snapshots/:id', async (req, res) => {
    try {
        const snapshot = await snapshotRepo.findById(req.params.id);
        if (snapshot) {
            res.json({ success: true, data: snapshot });
        } else {
            res.status(404).json({ success: false, error: 'Snapshot not found' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        streaming: true,
        wasm: true
    });
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║  Steam Ejector Backend Server                           ║
║  Powered by Turborepo + Express                         ║
╠══════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT}                       ║
║  Streaming:  /api/simulate/stream/pressure              ║
║              /api/simulate/stream/omega                 ║
║              /api/snapshots/stream                      ║
╚══════════════════════════════════════════════════════════╝
    `);
});

module.exports = {
    app,
    SimulationStream,
    OmegaSweepStream
};
