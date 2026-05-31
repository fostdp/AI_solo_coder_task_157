import { OneDimensionalEjectorModel } from './shared/index.js';
import { WasmShockCalculator } from './wasm-loader.js';

const wasmShockCalc = new WasmShockCalculator();
const ejector = new OneDimensionalEjectorModel();

let currentState = null;
let streamingData = [];
let prevShockLocation = null;

const pressureSlider = document.getElementById('pressureSlider');
const omegaSlider = document.getElementById('omegaSlider');
const suctionSlider = document.getElementById('suctionSlider');
const pressureValue = document.getElementById('pressureValue');
const omegaValue = document.getElementById('omegaValue');
const suctionValue = document.getElementById('suctionValue');
const simulateBtn = document.getElementById('simulateBtn');
const streamBtn = document.getElementById('streamBtn');
const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const streamingPanel = document.getElementById('streamingPanel');
const historyPanel = document.getElementById('historyPanel');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

pressureSlider.addEventListener('input', () => {
    pressureValue.textContent = pressureSlider.value;
    runSimulation();
});

omegaSlider.addEventListener('input', () => {
    omegaValue.textContent = omegaSlider.value;
    runSimulation();
});

suctionSlider.addEventListener('input', () => {
    suctionValue.textContent = suctionSlider.value;
    runSimulation();
});

simulateBtn.addEventListener('click', runSimulation);
streamBtn.addEventListener('click', runStreamingScan);
saveBtn.addEventListener('click', saveSnapshot);
loadBtn.addEventListener('click', loadHistory);

async function init() {
    updateWasmStatus('loading');
    await wasmShockCalc.load();
    updateWasmStatus(wasmShockCalc.loaded ? 'ready' : 'fallback');
    
    try {
        await fetch('/api/health');
        updateApiStatus('online');
    } catch {
        updateApiStatus('offline');
    }
    
    runSimulation();
}

async function runSimulation() {
    const P0 = parseFloat(pressureSlider.value);
    const omega = parseFloat(omegaSlider.value);
    const Ps = parseFloat(suctionSlider.value);
    
    ejector.setOperatingConditions(P0, omega, Ps);
    const state = ejector.solve();
    
    if (state.shockLocation !== null && wasmShockCalc.loaded && state.sections && state.sections[3]) {
        const mixingM = state.sections[3].M;
        const backPressureRatio = state.choked ? (0.3 + 0.1 * omega) : (Ps * 1000 + omega * P0 * 1e6 * 0.1) / (P0 * 1e6 * (1 + omega));
        
        const wasmShockLocation = wasmShockCalc.calculateShockLocation(
            mixingM,
            backPressureRatio,
            state.choked,
            omega
        );
        
        if (wasmShockLocation !== null) {
            if (prevShockLocation !== null) {
                state.shockLocation = wasmShockCalc.applyDamping(prevShockLocation, wasmShockLocation);
            } else {
                state.shockLocation = wasmShockLocation;
            }
            prevShockLocation = state.shockLocation;
        }
    }
    
    currentState = state;
    updateResults(state);
    renderSimulation(state);
}

async function runStreamingScan() {
    streamingPanel.style.display = 'block';
    streamingData = [];
    
    const omega = parseFloat(omegaSlider.value);
    const response = await fetch(`/api/simulate/stream/pressure?start=0.3&end=1.0&step=0.05&omega=${omega}`);
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let count = 0;
    const total = 15;
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const matches = buffer.match(/\{[^{}]*\}/g);
        if (matches) {
            for (const match of matches) {
                try {
                    const data = JSON.parse(match);
                    streamingData.push(data);
                    count++;
                    updateProgress(count / total);
                    renderStreamingChart();
                } catch {}
            }
            buffer = buffer.replace(/\{[^{}]*\}/g, '');
        }
    }
}

async function saveSnapshot() {
    if (!currentState) return;
    
    const snapshot = {
        workingPressure: parseFloat(pressureSlider.value),
        entrainmentRatio: parseFloat(omegaSlider.value),
        suctionPressure: parseFloat(suctionSlider.value),
        entrainmentCoefficient: currentState.entrainmentCoefficient,
        outletPressure: currentState.outletPressure,
        machNumber: currentState.sections[3]?.M || 0,
        criticalRatio: 0.528,
        mixingPressure: currentState.sections[3]?.P || 0,
        compressionRatio: currentState.outletPressure / (parseFloat(suctionSlider.value) * 10),
        nozzleVelocity: currentState.sections[2]?.V || 0,
        mixingVelocity: currentState.sections[3]?.V || 0,
        shockPosition: currentState.shockLocation || 0,
        shockIntensity: currentState.shockLocation ? 1.5 : 0,
        isChoked: currentState.choked,
        backPressure: currentState.outletPressure,
        velocityField: currentState.sections.map(s => s.V),
        shockStructure: currentState.shockLocation ? [currentState.shockLocation] : [],
        flowFieldData: currentState,
        sectionsData: currentState.sections,
        pressureDistribution: currentState.pressureDistribution,
        machDistribution: currentState.machDistribution
    };
    
    await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
    });
    
    alert('快照已保存');
}

async function loadHistory() {
    historyPanel.style.display = 'block';
    
    const response = await fetch('/api/snapshots');
    const { data } = await response.json();
    
    const tbody = document.getElementById('historyBody');
    tbody.innerHTML = data.map(s => `
        <tr>
            <td>${new Date(s.timestamp).toLocaleString()}</td>
            <td>${s.working_pressure} MPa</td>
            <td>${s.entrainment_ratio}</td>
            <td>${s.entrainment_coefficient.toFixed(4)}</td>
            <td>${s.outlet_pressure.toFixed(1)} kPa</td>
            <td>${s.is_choked ? '是' : '否'}</td>
            <td>${s.shock_position ? s.shock_position.toFixed(3) : '-'}</td>
        </tr>
    `).join('');
}

function updateResults(state) {
    document.getElementById('entrainmentValue').textContent = state.entrainmentCoefficient.toFixed(4);
    document.getElementById('outletPressureValue').textContent = state.outletPressure.toFixed(1) + ' kPa';
    document.getElementById('shockPositionValue').textContent = state.shockLocation ? state.shockLocation.toFixed(3) : '-';
    document.getElementById('chokedValue').textContent = state.choked ? '壅塞' : '未壅塞';
    document.getElementById('chokedValue').className = 'result-value ' + (state.choked ? 'text-warning' : 'text-success');
}

function renderSimulation(state) {
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const y0 = 200;
    const scaleX = 800;
    
    ctx.beginPath();
    ctx.moveTo(50, y0 - 40);
    ctx.lineTo(150, y0 - 40);
    ctx.lineTo(200, y0 - 15);
    ctx.lineTo(300, y0 - 15);
    ctx.lineTo(350, y0 - 30);
    ctx.lineTo(750, y0 - 30);
    ctx.lineTo(850, y0 - 50);
    ctx.lineTo(850, y0 + 50);
    ctx.lineTo(750, y0 + 30);
    ctx.lineTo(350, y0 + 30);
    ctx.lineTo(300, y0 + 15);
    ctx.lineTo(200, y0 + 15);
    ctx.lineTo(150, y0 + 40);
    ctx.lineTo(50, y0 + 40);
    ctx.closePath();
    ctx.fillStyle = '#e8f4f8';
    ctx.fill();
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    if (state.sections) {
        ctx.beginPath();
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 2;
        
        state.sections.forEach((s, i) => {
            const x = 50 + s.x * scaleX;
            const y = y0 - Math.min(s.M * 30, 80);
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#3498db';
            ctx.fill();
            ctx.beginPath();
        });
        ctx.stroke();
        
        ctx.beginPath();
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        
        state.sections.forEach((s, i) => {
            const x = 50 + s.x * scaleX;
            const y = y0 + Math.min(s.P / 10, 80);
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#e74c3c';
            ctx.fill();
            ctx.beginPath();
        });
        ctx.stroke();
    }
    
    if (state.shockLocation) {
        const x = 50 + state.shockLocation * scaleX;
        ctx.beginPath();
        ctx.moveTo(x, y0 - 100);
        ctx.lineTo(x, y0 + 100);
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#f39c12';
        ctx.font = '12px Arial';
        ctx.fillText('激波', x - 15, y0 - 110);
    }
    
    ctx.fillStyle = '#2c3e50';
    ctx.font = '14px Arial';
    ctx.fillText('工作蒸汽', 60, y0 - 60);
    ctx.fillText('喷嘴', 175, y0 - 60);
    ctx.fillText('混合室', 400, y0 - 60);
    ctx.fillText('扩压器', 700, y0 - 60);
    
    ctx.fillStyle = '#3498db';
    ctx.fillRect(750, 130, 15, 15);
    ctx.fillStyle = '#2c3e50';
    ctx.fillText('马赫数', 775, 142);
    
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(750, 155, 15, 15);
    ctx.fillStyle = '#2c3e50';
    ctx.fillText('压力', 775, 167);
}

function renderStreamingChart() {
    const canvas = document.getElementById('chartCanvas');
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (streamingData.length < 2) return;
    
    const padding = 50;
    const chartW = canvas.width - padding * 2;
    const chartH = canvas.height - padding * 2;
    
    const maxCoeff = Math.max(...streamingData.map(d => d.entrainmentCoefficient)) * 1.1;
    const minCoeff = 0;
    
    ctx.beginPath();
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 2;
    
    streamingData.forEach((d, i) => {
        const x = padding + (i / (streamingData.length - 1)) * chartW;
        const y = padding + chartH - ((d.entrainmentCoefficient - minCoeff) / (maxCoeff - minCoeff)) * chartH;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#3498db';
        ctx.fill();
        ctx.beginPath();
    });
    ctx.stroke();
    
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartH);
    ctx.lineTo(padding + chartW, padding + chartH);
    ctx.stroke();
    
    ctx.fillStyle = '#2c3e50';
    ctx.font = '12px Arial';
    ctx.fillText('引射系数', padding + 10, padding + 15);
    ctx.fillText('压力 (MPa)', padding + chartW - 60, padding + chartH + 25);
    
    streamingData.forEach((d, i) => {
        if (i % 3 === 0) {
            const x = padding + (i / (streamingData.length - 1)) * chartW;
            ctx.fillText(d.pressure.toFixed(1), x - 10, padding + chartH + 25);
        }
    });
}

function updateProgress(ratio) {
    const percent = Math.min(100, Math.round(ratio * 100));
    progressFill.style.width = percent + '%';
    progressText.textContent = percent + '%';
}

function updateWasmStatus(status) {
    const dot = document.getElementById('wasmStatus');
    const text = document.getElementById('wasmStatusText');
    
    const statusMap = {
        loading: { color: '#f39c12', text: '加载中...' },
        ready: { color: '#2ecc71', text: '已就绪' },
        fallback: { color: '#e67e22', text: 'JS回退模式' }
    };
    
    dot.style.backgroundColor = statusMap[status].color;
    text.textContent = statusMap[status].text;
}

function updateApiStatus(status) {
    const dot = document.getElementById('apiStatus');
    const text = document.getElementById('apiStatusText');
    
    const statusMap = {
        online: { color: '#2ecc71', text: '在线' },
        offline: { color: '#e74c3c', text: '离线' }
    };
    
    dot.style.backgroundColor = statusMap[status].color;
    text.textContent = statusMap[status].text;
}

init();
