class SteamEjectorSimulation {
    constructor() {
        this.canvas = document.getElementById('simulationCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        
        this.ejectorModel = new OneDimensionalEjectorModel({
            dampingCoeff: 0.15,
            nozzleAreaRatio: 3.5,
            mixingAreaRatio: 4.5,
            diffuserAreaRatio: 6.0
        });
        
        this.params = {
            workingPressure: 0.8,
            entrainmentRatio: 0.35,
            suctionPressure: 10
        };
        
        this.results = {
            entrainmentCoefficient: 0,
            outletPressure: 0,
            machNumber: 0,
            criticalRatio: 0,
            mixingPressure: 0,
            compressionRatio: 0,
            nozzleVelocity: 0,
            mixingVelocity: 0,
            shockPosition: 0,
            shockIntensity: 0,
            isChoked: false,
            backPressure: 0
        };
        
        this.particles = [];
        this.velocityField = [];
        this.shockWaves = [];
        this.animationTime = 0;
        
        this.bindEvents();
        this.calculate();
        this.initParticles();
        this.animate();
    }
    
    setupCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = 500;
        
        window.addEventListener('resize', () => {
            this.canvas.width = container.clientWidth;
        });
    }
    
    bindEvents() {
        const pressureSlider = document.getElementById('pressure');
        const entrainmentSlider = document.getElementById('entrainment');
        const suctionSlider = document.getElementById('suctionPressure');
        
        pressureSlider.addEventListener('input', (e) => {
            this.params.workingPressure = parseFloat(e.target.value);
            document.getElementById('pressureValue').textContent = this.params.workingPressure.toFixed(2) + ' MPa';
            this.calculate();
        });
        
        entrainmentSlider.addEventListener('input', (e) => {
            this.params.entrainmentRatio = parseFloat(e.target.value);
            document.getElementById('entrainmentValue').textContent = this.params.entrainmentRatio.toFixed(2);
            this.calculate();
        });
        
        suctionSlider.addEventListener('input', (e) => {
            this.params.suctionPressure = parseFloat(e.target.value);
            document.getElementById('suctionPressureValue').textContent = this.params.suctionPressure.toFixed(0) + ' kPa';
            this.calculate();
        });
        
        document.getElementById('saveBtn').addEventListener('click', () => this.saveSnapshot());
        document.getElementById('historyBtn').addEventListener('click', () => this.showHistory());
        document.getElementById('closeHistory').addEventListener('click', () => this.hideHistory());
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideHistory();
            }
        });
    }
    
    calculate() {
        this.ejectorModel.setOperatingConditions(
            this.params.workingPressure,
            this.params.entrainmentRatio,
            this.params.suctionPressure
        );
        
        const state = this.ejectorModel.solve();
        
        this.results.entrainmentCoefficient = state.entrainmentCoefficient;
        this.results.outletPressure = state.outletPressure;
        this.results.isChoked = state.choked;
        this.results.shockPosition = state.shockLocation || 0;
        
        const criticalProps = this.ejectorModel.calculateCriticalProperties(
            this.params.workingPressure * 1000, 
            423.15
        );
        this.results.criticalRatio = criticalProps.Pstar / (this.params.workingPressure * 1000);
        
        if (state.sections.length >= 4) {
            this.results.machNumber = state.sections[2].M || 0;
            this.results.nozzleVelocity = state.sections[2].V || 0;
            this.results.mixingPressure = state.sections[3].P || 0;
            this.results.mixingVelocity = state.sections[3].V || 0;
        }
        
        if (state.sections.length >= 7) {
            this.results.outletPressure = state.sections[6].P || state.outletPressure;
        }
        
        if (this.results.machNumber > 1) {
            const shockRelations = this.ejectorModel.normalShockRelations(this.results.machNumber);
            this.results.shockIntensity = shockRelations.P2_P1;
        } else {
            this.results.shockIntensity = 1;
        }
        
        this.results.compressionRatio = this.results.outletPressure / this.params.suctionPressure;
        this.results.backPressure = state.choked ? 
            this.params.workingPressure * 1000 * (0.3 + 0.1 * this.params.entrainmentRatio) :
            this.params.workingPressure * 1000 * 0.5;
        
        this.velocityField = this.ejectorModel.getVelocityField(this.canvas.width, this.canvas.height);
        this.shockWaves = this.ejectorModel.getShockWaves(this.canvas.width, this.canvas.height);
        
        this.updateUI();
    }
    
    getVelocityAtPoint(x, y, width, height) {
        const normalizedX = x / width;
        return this.ejectorModel.getVelocityAtPoint(normalizedX, y, height);
    }
    
    initParticles() {
        this.particles = [];
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        for (let i = 0; i < 150; i++) {
            this.particles.push({
                x: Math.random() * width,
                y: height / 2 + (Math.random() - 0.5) * height * 0.6,
                type: Math.random() < 0.6 ? 'steam' : 'suction',
                speed: 0.5 + Math.random() * 0.5,
                size: 2 + Math.random() * 3
            });
        }
    }
    
    updateParticles() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.particles.forEach(particle => {
            const velocity = this.getVelocityAtPoint(particle.x, particle.y, width, height);
            
            particle.x += velocity.vx * particle.speed * 0.1;
            particle.y += velocity.vy * particle.speed * 0.1;
            
            if (particle.x < 0) {
                particle.x = width;
                particle.y = height / 2 + (Math.random() - 0.5) * height * 0.6;
            }
            
            if (particle.x > width) {
                particle.x = 0;
                particle.y = height / 2 + (Math.random() - 0.5) * height * 0.6;
            }
            
            particle.y = Math.max(height * 0.2, Math.min(height * 0.8, particle.y));
        });
    }
    
    draw() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, width, height);
        
        this.drawGrid(ctx, width, height);
        this.drawEjector(ctx, width, height);
        this.drawVelocityField(ctx);
        this.drawShockWaves(ctx);
        this.drawParticles(ctx);
        this.drawLabels(ctx, width, height);
    }
    
    drawGrid(ctx, width, height) {
        ctx.strokeStyle = 'rgba(100, 150, 200, 0.1)';
        ctx.lineWidth = 1;
        
        for (let x = 0; x < width; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        for (let y = 0; y < height; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }
    
    drawEjector(ctx, width, height) {
        const centerY = height / 2;
        
        const nozzleStartX = width * 0.1;
        const nozzleThroatX = width * 0.18;
        const nozzleExitX = width * 0.3;
        
        ctx.fillStyle = '#2a2a4a';
        ctx.strokeStyle = '#4a4a8a';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(nozzleStartX, centerY - 60);
        ctx.lineTo(nozzleThroatX, centerY - 20);
        ctx.lineTo(nozzleExitX, centerY - 25);
        ctx.lineTo(nozzleExitX, centerY + 25);
        ctx.lineTo(nozzleThroatX, centerY + 20);
        ctx.lineTo(nozzleStartX, centerY + 60);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        const suctionStartX = width * 0.05;
        const suctionEndX = width * 0.28;
        
        ctx.beginPath();
        ctx.moveTo(suctionStartX, centerY - 80);
        ctx.lineTo(suctionEndX, centerY - 35);
        ctx.lineTo(suctionEndX, centerY - 25);
        ctx.lineTo(suctionStartX + 20, centerY - 70);
        ctx.closePath();
        ctx.fillStyle = '#1a3a3a';
        ctx.strokeStyle = '#3a6a6a';
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(suctionStartX, centerY + 80);
        ctx.lineTo(suctionEndX, centerY + 35);
        ctx.lineTo(suctionEndX, centerY + 25);
        ctx.lineTo(suctionStartX + 20, centerY + 70);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        const mixingStartX = width * 0.3;
        const mixingEndX = width * 0.65;
        
        ctx.fillStyle = '#2a3a2a';
        ctx.strokeStyle = '#4a6a4a';
        
        ctx.beginPath();
        ctx.moveTo(mixingStartX, centerY - 30);
        ctx.lineTo(mixingEndX, centerY - 28);
        ctx.lineTo(mixingEndX, centerY + 28);
        ctx.lineTo(mixingStartX, centerY + 30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        const diffuserStartX = width * 0.65;
        const diffuserEndX = width * 0.95;
        
        ctx.fillStyle = '#2a2a4a';
        ctx.strokeStyle = '#4a4a8a';
        
        ctx.beginPath();
        ctx.moveTo(diffuserStartX, centerY - 28);
        ctx.lineTo(diffuserEndX, centerY - 45);
        ctx.lineTo(diffuserEndX, centerY + 45);
        ctx.lineTo(diffuserStartX, centerY + 28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        this.drawSteamFlow(ctx, width, height);
        this.drawSuctionFlow(ctx, width, height);
        this.drawMixtureFlow(ctx, width, height);
    }
    
    drawSteamFlow(ctx, width, height) {
        const centerY = height / 2;
        const time = this.animationTime;
        
        const gradient = ctx.createLinearGradient(width * 0.1, 0, width * 0.3, 0);
        gradient.addColorStop(0, 'rgba(255, 107, 107, 0.6)');
        gradient.addColorStop(0.5, 'rgba(255, 150, 100, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 200, 100, 0.2)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(width * 0.12, centerY - 15 + Math.sin(time) * 2);
        ctx.lineTo(width * 0.28, centerY - 10 + Math.sin(time + 1) * 2);
        ctx.lineTo(width * 0.28, centerY + 10 + Math.sin(time + 2) * 2);
        ctx.lineTo(width * 0.12, centerY + 15 + Math.sin(time + 3) * 2);
        ctx.closePath();
        ctx.fill();
        
        for (let i = 0; i < 5; i++) {
            const x = width * 0.15 + (i * width * 0.03) + Math.sin(time + i) * 5;
            const alpha = 0.3 + Math.sin(time * 2 + i) * 0.2;
            ctx.fillStyle = `rgba(255, 200, 150, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, centerY + Math.sin(time + i * 0.5) * 8, 3 + i, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawSuctionFlow(ctx, width, height) {
        const centerY = height / 2;
        const time = this.animationTime;
        
        const gradient = ctx.createLinearGradient(width * 0.05, 0, width * 0.28, 0);
        gradient.addColorStop(0, 'rgba(78, 205, 196, 0.4)');
        gradient.addColorStop(1, 'rgba(78, 205, 196, 0.1)');
        
        ctx.fillStyle = gradient;
        
        ctx.beginPath();
        ctx.moveTo(width * 0.07, centerY - 50 + Math.sin(time) * 3);
        ctx.lineTo(width * 0.27, centerY - 22 + Math.sin(time + 1) * 2);
        ctx.lineTo(width * 0.27, centerY - 12 + Math.sin(time + 2) * 2);
        ctx.lineTo(width * 0.08, centerY - 42 + Math.sin(time + 3) * 3);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(width * 0.07, centerY + 50 + Math.sin(time) * 3);
        ctx.lineTo(width * 0.27, centerY + 22 + Math.sin(time + 1) * 2);
        ctx.lineTo(width * 0.27, centerY + 12 + Math.sin(time + 2) * 2);
        ctx.lineTo(width * 0.08, centerY + 42 + Math.sin(time + 3) * 3);
        ctx.closePath();
        ctx.fill();
        
        for (let i = 0; i < 4; i++) {
            const x = width * 0.1 + (i * width * 0.04) + Math.sin(time + i * 0.7) * 5;
            const alpha = 0.2 + Math.sin(time * 1.5 + i) * 0.15;
            ctx.fillStyle = `rgba(100, 220, 200, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, centerY - 35 + Math.sin(time + i * 0.3) * 5, 2 + i * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, centerY + 35 + Math.sin(time + i * 0.3 + 1) * 5, 2 + i * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawMixtureFlow(ctx, width, height) {
        const centerY = height / 2;
        const time = this.animationTime;
        
        const gradient = ctx.createLinearGradient(width * 0.3, 0, width * 0.65, 0);
        gradient.addColorStop(0, 'rgba(168, 224, 99, 0.5)');
        gradient.addColorStop(0.5, 'rgba(168, 224, 99, 0.3)');
        gradient.addColorStop(1, 'rgba(86, 171, 47, 0.2)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(width * 0.32, centerY - 15 + Math.sin(time) * 3);
        ctx.lineTo(width * 0.63, centerY - 14 + Math.sin(time + 1) * 2);
        ctx.lineTo(width * 0.63, centerY + 14 + Math.sin(time + 2) * 2);
        ctx.lineTo(width * 0.32, centerY + 15 + Math.sin(time + 3) * 3);
        ctx.closePath();
        ctx.fill();
        
        const diffuserGradient = ctx.createLinearGradient(width * 0.65, 0, width * 0.95, 0);
        diffuserGradient.addColorStop(0, 'rgba(168, 224, 99, 0.3)');
        diffuserGradient.addColorStop(1, 'rgba(86, 171, 47, 0.15)');
        
        ctx.fillStyle = diffuserGradient;
        ctx.beginPath();
        ctx.moveTo(width * 0.67, centerY - 18 + Math.sin(time) * 2);
        ctx.lineTo(width * 0.93, centerY - 30 + Math.sin(time + 1) * 3);
        ctx.lineTo(width * 0.93, centerY + 30 + Math.sin(time + 2) * 3);
        ctx.lineTo(width * 0.67, centerY + 18 + Math.sin(time + 3) * 2);
        ctx.closePath();
        ctx.fill();
        
        for (let i = 0; i < 8; i++) {
            const x = width * 0.35 + (i * width * 0.08) + Math.sin(time + i * 0.4) * 8;
            const alpha = 0.25 + Math.sin(time * 1.2 + i * 0.6) * 0.15;
            const spread = (x - width * 0.3) / (width * 0.65);
            ctx.fillStyle = `rgba(180, 230, 120, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, centerY + (Math.random() - 0.5) * 20 * spread, 3 + i * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawVelocityField(ctx) {
        this.velocityField.forEach(point => {
            const magnitude = point.magnitude;
            const maxMagnitude = 50;
            const normalizedMagnitude = Math.min(magnitude / maxMagnitude, 1);
            
            const hue = 240 - normalizedMagnitude * 240;
            const color = `hsla(${hue}, 100%, 50%, 0.3)`;
            
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            
            const scale = 0.3;
            ctx.lineTo(
                point.x + point.vx * scale,
                point.y + point.vy * scale
            );
            ctx.stroke();
        });
    }
    
    drawShockWaves(ctx) {
        const time = this.animationTime;
        
        this.shockWaves.forEach(shock => {
            const gradient = ctx.createLinearGradient(
                shock.x - shock.width / 2, 0,
                shock.x + shock.width / 2, 0
            );
            gradient.addColorStop(0, 'rgba(247, 151, 30, 0)');
            gradient.addColorStop(0.3, `rgba(247, 151, 30, ${0.3 + Math.sin(time * 3) * 0.1})`);
            gradient.addColorStop(0.5, `rgba(255, 210, 0, ${0.5 + Math.sin(time * 3 + 1) * 0.1})`);
            gradient.addColorStop(0.7, `rgba(247, 151, 30, ${0.3 + Math.sin(time * 3 + 2) * 0.1})`);
            gradient.addColorStop(1, 'rgba(247, 151, 30, 0)');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(
                shock.x - shock.width / 2,
                shock.centerY - 100,
                shock.width,
                200
            );
            
            ctx.strokeStyle = `rgba(255, 210, 0, ${0.5 + Math.sin(time * 5) * 0.3})`;
            ctx.lineWidth = 2;
            
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                const yOffset = -80 + i * 40 + Math.sin(time + i) * 10;
                ctx.moveTo(shock.x - shock.width / 2, shock.centerY + yOffset);
                ctx.lineTo(shock.x + shock.width / 2, shock.centerY + yOffset);
                ctx.stroke();
            }
            
            ctx.fillStyle = '#ffd700';
            ctx.font = '12px Arial';
            ctx.fillText(
                `激波 M=${this.results.machNumber.toFixed(2)}`,
                shock.x - 30,
                shock.centerY - 110
            );
        });
    }
    
    drawParticles(ctx) {
        this.particles.forEach(particle => {
            let color;
            if (particle.x < this.canvas.width * 0.3) {
                color = particle.type === 'steam' 
                    ? `rgba(255, 150, 100, 0.6)` 
                    : `rgba(100, 220, 200, 0.6)`;
            } else {
                color = `rgba(180, 230, 120, 0.6)`;
            }
            
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    drawLabels(ctx, width, height) {
        ctx.fillStyle = '#aaa';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        
        ctx.fillText('工作蒸汽入口', width * 0.05, height * 0.15);
        ctx.fillText('喷嘴', width * 0.2, height * 0.15);
        ctx.fillText('吸入室', width * 0.15, height * 0.85);
        ctx.fillText('混合室', width * 0.47, height * 0.15);
        ctx.fillText('扩压器', width * 0.8, height * 0.15);
        ctx.fillText('出口', width * 0.95, height * 0.15);
        
        if (this.results.machNumber > 1) {
            ctx.fillStyle = '#ff6b6b';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(
                `超音速流动 M=${this.results.machNumber.toFixed(2)}`,
                width * 0.4,
                height * 0.35
            );
        } else {
            ctx.fillStyle = '#4ecdc4';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(
                `亚音速流动 M=${this.results.machNumber.toFixed(2)}`,
                width * 0.4,
                height * 0.35
            );
        }
        
        if (this.results.isChoked) {
            ctx.fillStyle = '#ff6b6b';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('⚠ 壅塞状态', width * 0.5, height * 0.08);
        }
    }
    
    updateUI() {
        document.getElementById('entrainmentCoeff').textContent = this.results.entrainmentCoefficient.toFixed(4);
        document.getElementById('outletPressure').textContent = this.results.outletPressure.toFixed(2) + ' kPa';
        document.getElementById('machNumber').textContent = this.results.machNumber.toFixed(3);
        document.getElementById('criticalRatio').textContent = this.results.criticalRatio.toFixed(4);
        document.getElementById('mixingPressure').textContent = this.results.mixingPressure.toFixed(2) + ' kPa';
        document.getElementById('compressionRatio').textContent = this.results.compressionRatio.toFixed(2);
        document.getElementById('nozzleVelocity').textContent = this.results.nozzleVelocity.toFixed(0) + ' m/s';
        document.getElementById('mixingVelocity').textContent = this.results.mixingVelocity.toFixed(0) + ' m/s';
        
        if (this.results.shockPosition > 0) {
            document.getElementById('shockPosition').textContent = (this.results.shockPosition * 100).toFixed(0) + '%';
            document.getElementById('shockIntensity').textContent = this.results.shockIntensity.toFixed(2);
        } else {
            document.getElementById('shockPosition').textContent = '无';
            document.getElementById('shockIntensity').textContent = '--';
        }
    }
    
    animate() {
        this.animationTime += 0.05;
        this.updateParticles();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
    
    async saveSnapshot() {
        try {
            const flowFieldData = this.ejectorModel.getFlowFieldData();
            
            const snapshot = {
                workingPressure: this.params.workingPressure,
                entrainmentRatio: this.params.entrainmentRatio,
                suctionPressure: this.params.suctionPressure,
                entrainmentCoefficient: this.results.entrainmentCoefficient,
                outletPressure: this.results.outletPressure,
                machNumber: this.results.machNumber,
                criticalRatio: this.results.criticalRatio,
                mixingPressure: this.results.mixingPressure,
                compressionRatio: this.results.compressionRatio,
                nozzleVelocity: this.results.nozzleVelocity,
                mixingVelocity: this.results.mixingVelocity,
                shockPosition: this.results.shockPosition,
                shockIntensity: this.results.shockIntensity,
                isChoked: this.results.isChoked,
                backPressure: this.results.backPressure,
                velocityField: this.velocityField.slice(0, 100),
                shockStructure: this.shockWaves,
                flowFieldData: flowFieldData,
                timestamp: Date.now()
            };
            
            const response = await fetch('/api/snapshots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(snapshot)
            });
            
            const result = await response.json();
            if (result.id) {
                this.showNotification('快照保存成功！', 'success');
            }
        } catch (error) {
            this.showNotification('保存失败: ' + error.message, 'error');
        }
    }
    
    getVelocityDistribution() {
        return this.ejectorModel.getVelocityDistribution(this.canvas.width, this.canvas.height);
    }
    
    getPressureDistribution() {
        return this.ejectorModel.getPressureDistribution(this.canvas.width);
    }
    
    async showHistory() {
        const modal = document.getElementById('historyModal');
        modal.classList.add('active');
        
        try {
            const [paramsResponse, snapshotsResponse] = await Promise.all([
                fetch('/api/parameters'),
                fetch('/api/snapshots')
            ]);
            
            const paramsData = await paramsResponse.json();
            const snapshotsData = await snapshotsResponse.json();
            
            this.renderParametersTable(paramsData);
            this.renderSnapshotsTable(snapshotsData);
        } catch (error) {
            console.error('加载历史记录失败:', error);
        }
    }
    
    hideHistory() {
        document.getElementById('historyModal').classList.remove('active');
    }
    
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('hidden', content.id !== `tab-${tabName}`);
        });
    }
    
    renderParametersTable(data) {
        const tbody = document.getElementById('parametersTable');
        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${new Date(item.timestamp).toLocaleString()}</td>
                <td>${item.workingPressure.toFixed(2)}</td>
                <td>${item.entrainmentRatio.toFixed(2)}</td>
                <td>${(item.suctionPressure || 10).toFixed(0)} kPa</td>
                <td>
                    <button class="load-btn" onclick="simulation.loadParameters(${item.workingPressure}, ${item.entrainmentRatio}, ${item.suctionPressure || 10})">加载</button>
                    <button class="delete-btn" onclick="simulation.deleteParameter(${item.id})">删除</button>
                </td>
            </tr>
        `).join('');
    }
    
    renderSnapshotsTable(data) {
        const tbody = document.getElementById('snapshotsTable');
        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${new Date(item.timestamp).toLocaleString()}</td>
                <td>${item.workingPressure.toFixed(2)} MPa</td>
                <td>${item.entrainmentCoefficient.toFixed(4)}</td>
                <td>${item.outletPressure.toFixed(2)} kPa</td>
                <td>
                    <div>激波位置: ${((item.shockPosition || 0) * 100).toFixed(0)}%</div>
                    <div style="color: ${item.isChoked ? '#ff6b6b' : '#4ecdc4'}; font-size: 0.8em;">
                        ${item.isChoked ? '壅塞状态' : '正常状态'}
                    </div>
                </td>
                <td>
                    <button class="load-btn" onclick="simulation.viewSnapshotDetail(${item.id})">详情</button>
                    <button class="delete-btn" onclick="simulation.deleteSnapshot(${item.id})">删除</button>
                </td>
            </tr>
        `).join('');
    }
    
    async viewSnapshotDetail(id) {
        try {
            const response = await fetch('/api/snapshots');
            const data = await response.json();
            const snapshot = data.find(s => s.id === id);
            
            if (snapshot && snapshot.flowFieldData) {
                const detail = snapshot.flowFieldData;
                alert(
                    `快照详情 #${id}\n\n` +
                    `工作压力: ${snapshot.workingPressure.toFixed(2)} MPa\n` +
                    `引射比: ${snapshot.entrainmentRatio.toFixed(2)}\n` +
                    `引射系数: ${snapshot.entrainmentCoefficient.toFixed(4)}\n` +
                    `出口压力: ${snapshot.outletPressure.toFixed(2)} kPa\n\n` +
                    `=== 流场数据 ===\n` +
                    `马赫数: ${(detail.machNumber || 0).toFixed(3)}\n` +
                    `激波位置: ${((detail.shockPosition || 0) * 100).toFixed(0)}%\n` +
                    `激波强度: ${(detail.shockIntensity || 0).toFixed(3)}\n` +
                    `喷嘴速度: ${(detail.nozzleVelocity || 0).toFixed(0)} m/s\n` +
                    `混合速度: ${(detail.mixingVelocity || 0).toFixed(0)} m/s\n` +
                    `背压: ${(detail.backPressure || 0).toFixed(2)} kPa\n` +
                    `壅塞: ${detail.isChoked ? '是' : '否'}\n\n` +
                    `=== 截面数据 ===\n` +
                    (detail.sections || []).map(s => 
                        `${s.name}: M=${s.mach.toFixed(2)}, P=${s.pressure.toFixed(1)}kPa`
                    ).join('\n')
                );
            }
        } catch (error) {
            console.error('查看详情失败:', error);
        }
    }
    
    loadParameters(pressure, entrainment, suctionPressure = 10) {
        this.params.workingPressure = pressure;
        this.params.entrainmentRatio = entrainment;
        this.params.suctionPressure = suctionPressure;
        
        document.getElementById('pressure').value = pressure;
        document.getElementById('entrainment').value = entrainment;
        document.getElementById('suctionPressure').value = suctionPressure;
        document.getElementById('pressureValue').textContent = pressure.toFixed(2) + ' MPa';
        document.getElementById('entrainmentValue').textContent = entrainment.toFixed(2);
        document.getElementById('suctionPressureValue').textContent = suctionPressure.toFixed(0) + ' kPa';
        
        this.calculate();
        this.hideHistory();
    }
    
    async deleteParameter(id) {
        try {
            await fetch(`/api/parameters/${id}`, { method: 'DELETE' });
            this.showHistory();
        } catch (error) {
            console.error('删除失败:', error);
        }
    }
    
    async deleteSnapshot(id) {
        try {
            await fetch(`/api/snapshots/${id}`, { method: 'DELETE' });
            this.showHistory();
        } catch (error) {
            console.error('删除失败:', error);
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? 'linear-gradient(135deg, #4ecdc4, #44a08d)' : 'linear-gradient(135deg, #ff6b6b, #ee5a5a)'};
            color: white;
            border-radius: 10px;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

const simulation = new SteamEjectorSimulation();
