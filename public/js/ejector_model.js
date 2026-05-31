class OneDimensionalEjectorModel {
    constructor(config = {}) {
        this.gamma = config.gamma || 1.33;
        this.R = config.R || 461.5;
        this.T0 = config.T0 || 423.15;
        this.Ps = config.Ps || 10;
        
        this.dampingCoeff = config.dampingCoeff || 0.15;
        this.maxIterations = config.maxIterations || 100;
        this.convergenceTol = config.convergenceTol || 1e-6;
        
        this.nozzleAreaRatio = config.nozzleAreaRatio || 3.5;
        this.mixingAreaRatio = config.mixingAreaRatio || 4.5;
        this.diffuserAreaRatio = config.diffuserAreaRatio || 6.0;
        
        this.prevShockLocation = null;
        
        this.state = {
            sections: [],
            choked: false,
            shockLocation: null,
            massFlowPrimary: 0,
            massFlowSecondary: 0,
            massFlowTotal: 0,
            maxAllowableFlow: 0,
            entrainmentCoefficient: 0,
            outletPressure: 0,
            iterations: 0,
            converged: false
        };
    }
    
    setOperatingConditions(workingPressure, entrainmentRatio, suctionPressure) {
        this.P0 = workingPressure * 1e6;
        this.omega = entrainmentRatio;
        this.Ps = suctionPressure * 1000;
        this.T0 = 423.15;
    }
    
    calculateCriticalProperties(P_Pa, T) {
        const gamma = this.gamma;
        const criticalRatio = Math.pow(2 / (gamma + 1), gamma / (gamma - 1));
        
        return {
            Pstar: P_Pa * criticalRatio,
            Tstar: T * (2 / (gamma + 1)),
            rhostar: P_Pa / (this.R * T) * Math.pow(2 / (gamma + 1), 1 / (gamma - 1)),
            Vstar: Math.sqrt(gamma * this.R * T * (2 / (gamma + 1)))
        };
    }
    
    areaRatioFromMach(M, isSupersonic = true) {
        const gamma = this.gamma;
        const term1 = 1 / M;
        const term2 = Math.pow(2 / (gamma + 1) * (1 + (gamma - 1) / 2 * M * M), (gamma + 1) / (2 * (gamma - 1)));
        return term1 * term2;
    }
    
    machFromAreaRatio(A_At, isSupersonic = true) {
        let M_low = 0.01;
        let M_high = isSupersonic ? 5.0 : 0.99;
        
        for (let i = 0; i < this.maxIterations; i++) {
            const M_mid = (M_low + M_high) / 2;
            const A_At_calc = this.areaRatioFromMach(M_mid, isSupersonic);
            
            if (Math.abs(A_At_calc - A_At) < this.convergenceTol) {
                return M_mid;
            }
            
            if (A_At_calc > A_At) {
                if (isSupersonic) {
                    M_high = M_mid;
                } else {
                    M_low = M_mid;
                }
            } else {
                if (isSupersonic) {
                    M_low = M_mid;
                } else {
                    M_high = M_mid;
                }
            }
        }
        return (M_low + M_high) / 2;
    }
    
    isentropicFlowProperties(M, P0_Pa, T0) {
        const gamma = this.gamma;
        const P_P0 = Math.pow(1 + (gamma - 1) / 2 * M * M, -gamma / (gamma - 1));
        const T_T0 = 1 / (1 + (gamma - 1) / 2 * M * M);
        const A_At = this.areaRatioFromMach(M, M > 1);
        
        return {
            P: P0_Pa * P_P0 / 1000,
            P_Pa: P0_Pa * P_P0,
            T: T0 * T_T0,
            M: M,
            V: M * Math.sqrt(gamma * this.R * T0 * T_T0),
            A_At: A_At
        };
    }
    
    normalShockRelations(M1) {
        const gamma = this.gamma;
        
        if (M1 <= 1) {
            return { M2: M1, P2_P1: 1, T2_T1: 1, entropyJump: 0 };
        }
        
        const M2 = Math.sqrt((M1 * M1 * (gamma - 1) + 2) / (2 * gamma * M1 * M1 - (gamma - 1)));
        const P2_P1 = (2 * gamma * M1 * M1 - (gamma - 1)) / (gamma + 1);
        const T2_T1 = (2 * gamma * M1 * M1 - (gamma - 1)) * ((gamma - 1) * M1 * M1 + 2) / 
                     ((gamma + 1) * (gamma + 1) * M1 * M1);
        
        const entropyJump = Math.log(P2_P1 * Math.pow(1 / T2_T1, gamma / (gamma - 1)));
        
        return { M2, P2_P1, T2_T1, entropyJump };
    }
    
    calculateMassFlowRate(P0_Pa, T0, A_throat) {
        const gamma = this.gamma;
        const rho0 = P0_Pa / (this.R * T0);
        return rho0 * A_throat * Math.sqrt(gamma * this.R * T0) * 
               Math.pow(2 / (gamma + 1), (gamma + 1) / (2 * (gamma - 1)));
    }
    
    calculateChokedFlowLimit(P0, T0, A_throat) {
        return this.calculateMassFlowRate(P0, T0, A_throat);
    }
    
    applyFlowDamping(currentFlow, targetFlow, prevFlow) {
        if (prevFlow === undefined || prevFlow === 0) {
            return currentFlow;
        }
        
        const delta = currentFlow - prevFlow;
        const dampedDelta = delta * (1 - this.dampingCoeff);
        return prevFlow + dampedDelta;
    }
    
    applyShockDamping(shockIntensity, prevIntensity) {
        if (prevIntensity === undefined) {
            return shockIntensity;
        }
        
        const delta = shockIntensity - prevIntensity;
        const dampedDelta = delta * (1 - this.dampingCoeff * 2);
        return Math.max(1, prevIntensity + dampedDelta);
    }
    
    solveNozzleFlow(P0, T0, A_At) {
        const A_nozzle = A_At * this.nozzleAreaRatio;
        const A_nozzle_At = A_nozzle / A_At;
        
        let M_exit;
        let isSupersonic = false;
        
        if (A_nozzle_At > 1) {
            M_exit = this.machFromAreaRatio(A_nozzle_At, true);
            isSupersonic = true;
        } else {
            M_exit = this.machFromAreaRatio(A_nozzle_At, false);
            isSupersonic = false;
        }
        
        const exitProps = this.isentropicFlowProperties(M_exit, P0, T0);
        
        return {
            M_throat: 1.0,
            M_exit: M_exit,
            P_exit: exitProps.P,
            T_exit: exitProps.T,
            V_exit: exitProps.V,
            isSupersonic: isSupersonic
        };
    }
    
    solveMixing(m_dot_p, V_p, T_p, m_dot_s, V_s, T_s, A_mixing) {
        const m_dot_total = m_dot_p + m_dot_s;
        
        const T_mixing = (m_dot_p * T_p + m_dot_s * T_s) / m_dot_total;
        
        const Pm_est_Pa = Math.max(this.Ps * 3, 30000);
        const rho_mixing = Pm_est_Pa / (this.R * T_mixing);
        
        const V_mixing = (m_dot_p * V_p + m_dot_s * V_s) / m_dot_total;
        
        const a_mixing = Math.sqrt(this.gamma * this.R * T_mixing);
        const M_mixing = V_mixing / a_mixing;
        
        const P_calc_Pa = m_dot_total * this.R * T_mixing / (A_mixing * V_mixing);
        
        return {
            M: M_mixing,
            V: V_mixing,
            T: T_mixing,
            P_Pa: P_calc_Pa,
            P: P_calc_Pa / 1000,
            rho: rho_mixing
        };
    }
    
    solve() {
        const A_throat = 0.001;
        const A_mixing = A_throat * this.mixingAreaRatio;
        const A_diffuser = A_throat * this.diffuserAreaRatio;
        
        const nozzleResult = this.solveNozzleFlow(this.P0, this.T0, A_throat);
        
        let m_dot_p_actual = this.calculateMassFlowRate(this.P0, this.T0, A_throat);
        let m_dot_s_actual = this.omega * m_dot_p_actual;
        let m_dot_total_actual = m_dot_p_actual + m_dot_s_actual;
        
        const V_suction = 100;
        const T_suction = 300;
        
        let mixingResult = this.solveMixing(
            m_dot_p_actual, nozzleResult.V_exit, nozzleResult.T_exit,
            m_dot_s_actual, V_suction, T_suction,
            A_mixing
        );
        
        const P0_MPa = this.P0 / 1e6;
        const chokingPressure = 0.45;
        const isChoked = P0_MPa > chokingPressure;
        
        if (isChoked) {
            const pressureFactor = 0.4 + 0.3 * ((P0_MPa - chokingPressure) / (1.0 - chokingPressure));
            m_dot_total_actual *= pressureFactor;
            m_dot_p_actual *= pressureFactor;
            m_dot_s_actual *= pressureFactor;
            
            mixingResult = this.solveMixing(
                m_dot_p_actual, nozzleResult.V_exit, nozzleResult.T_exit,
                m_dot_s_actual, V_suction, T_suction,
                A_mixing
            );
        }
        
        const chokedFlowLimit = this.calculateMassFlowRate(
            this.P0 * 0.15, this.T0, A_mixing
        );
        
        this.state.massFlowPrimary = m_dot_p_actual;
        this.state.massFlowSecondary = m_dot_s_actual;
        this.state.massFlowTotal = m_dot_total_actual;
        this.state.maxAllowableFlow = chokedFlowLimit;
        this.state.choked = isChoked;
        
        this.state.sections = [
            { name: 'nozzle_inlet', x: 0, A: A_throat * 3, M: 0.01, P: this.P0 / 1000, T: this.T0, V: 0 },
            { name: 'nozzle_throat', x: 0.15, A: A_throat, M: 1.0, P: this.P0 * 0.528 / 1000, T: this.T0 * 0.858, V: Math.sqrt(this.gamma * this.R * this.T0 * 0.858) },
            { name: 'nozzle_exit', x: 0.3, A: A_throat * this.nozzleAreaRatio, M: nozzleResult.M_exit, P: nozzleResult.P_exit, T: nozzleResult.T_exit, V: nozzleResult.V_exit },
            { name: 'mixing_inlet', x: 0.3, A: A_mixing, M: mixingResult.M, P: mixingResult.P, T: mixingResult.T, V: mixingResult.V },
            { name: 'mixing_outlet', x: 0.65, A: A_mixing, M: mixingResult.M * 0.8, P: mixingResult.P * 1.2, T: mixingResult.T * 1.05, V: mixingResult.V * 0.85 },
            { name: 'diffuser_inlet', x: 0.65, A: A_mixing, M: mixingResult.M * 0.8, P: mixingResult.P * 1.2, T: mixingResult.T * 1.05, V: mixingResult.V * 0.85 },
            { name: 'diffuser_outlet', x: 0.95, A: A_diffuser, M: 0, P: 0, T: 0, V: 0 }
        ];
        
        let shockLocation = null;
        let shockIntensity = 1;
        let outletPressure = mixingResult.P;
        let outletM = mixingResult.M * 0.8;
        
        if (mixingResult.M > 1) {
            const backPressureRatio = isChoked ? (0.3 + 0.1 * this.omega) : (this.Ps + this.omega * this.P0 * 0.1) / (this.P0 * (1 + this.omega));
            
            const rawShockLocation = this.calculateShockLocation(mixingResult.M, backPressureRatio, isChoked, this.omega);
            
            if (this.prevShockLocation !== null && rawShockLocation !== null) {
                const delta = rawShockLocation - this.prevShockLocation;
                shockLocation = this.prevShockLocation + delta * (1 - this.dampingCoeff);
            } else {
                shockLocation = rawShockLocation;
            }
            
            shockIntensity = this.normalShockRelations(mixingResult.M).P2_P1;
            
            const postShockProps = this.normalShockRelations(mixingResult.M);
            const shockPressure = mixingResult.P * postShockProps.P2_P1;
            
            const P0_kPa = this.P0 / 1000;
            const Ps_kPa = this.Ps / 1000;
            const backPressure_effect = P0_kPa * 0.12 * (1.0 - this.omega * 0.9);
            outletPressure = Math.max(Ps_kPa * 2.5, shockPressure * 0.4 + backPressure_effect);
            
            outletM = postShockProps.M2;
        } else {
            const P0_kPa = this.P0 / 1000;
            const Ps_kPa = this.Ps / 1000;
            outletPressure = Ps_kPa * 2.5 + P0_kPa * 0.08 * (1.0 - this.omega * 0.85);
        }
        
        this.prevShockLocation = shockLocation;
        this.state.shockLocation = shockLocation;
        
        const P_outlet = this.solveDiffuser(
            outletM, outletPressure,
            this.state.sections[5].T,
            A_mixing, A_diffuser
        );
        
        const entrainmentCoefficient = this.calculateEntrainmentCoefficient(P_outlet, isChoked);
        
        this.state.entrainmentCoefficient = entrainmentCoefficient;
        this.state.outletPressure = P_outlet;
        
        this.state.sections[6].P = P_outlet;
        this.state.sections[6].M = outletM * 0.5;
        this.state.sections[6].T = this.state.sections[5].T * 1.1;
        this.state.sections[6].V = this.state.sections[5].V * 0.6;
        
        return this.state;
    }
    
    calculateShockLocation(M_inlet, backPressureRatio, isChoked, omega) {
        if (M_inlet <= 1) return null;
        
        const baseLocation = 0.3 + 0.4 * (M_inlet - 1);
        const backPressureCorrection = 1 - backPressureRatio * 0.3;
        const chokeCorrection = isChoked ? 0.9 : 1.0;
        const omegaCorrection = 0.7 + 0.6 * omega;
        
        const rawLocation = baseLocation * backPressureCorrection * chokeCorrection * omegaCorrection;
        
        return Math.max(0.15, Math.min(0.85, rawLocation));
    }
    
    solveDiffuser(M_inlet, P_inlet_kPa, T_inlet, A_inlet, A_outlet) {
        if (M_inlet <= 0.01) return P_inlet_kPa;
        
        const A_ratio = A_outlet / A_inlet;
        const pressureRecovery = 0.4 + 0.3 * Math.max(0, 1 - M_inlet);
        const P_outlet = P_inlet_kPa * (1 + pressureRecovery * (1 - 1 / A_ratio));
        
        return P_outlet;
    }
    
    calculateEntrainmentCoefficient(P_outlet, isChoked) {
        const Ps_kPa = this.Ps / 1000;
        const P0_kPa = this.P0 / 1000;
        
        if (isChoked) {
            const peakOmega = 0.4;
            const peakFactor = Math.exp(-Math.pow((this.omega - peakOmega) / 0.25, 2));
            const pressureFactor = Math.sqrt(Ps_kPa / P0_kPa) * 0.9;
            return this.omega * pressureFactor * peakFactor;
        }
        
        return this.omega * Math.sqrt(P0_kPa / (Ps_kPa * 10)) * 0.1;
    }
    
    getVelocityField(width, height) {
        const field = [];
        const centerY = height / 2;
        
        for (let x = 0; x < width; x += 10) {
            for (let y = 0; y < height; y += 10) {
                const normalizedX = x / width;
                const velocity = this.getVelocityAtPoint(normalizedX, y, height);
                field.push({
                    x, y,
                    vx: velocity.vx,
                    vy: velocity.vy,
                    magnitude: Math.sqrt(velocity.vx * velocity.vx + velocity.vy * velocity.vy)
                });
            }
        }
        return field;
    }
    
    getVelocityAtPoint(normalizedX, y, height) {
        const centerY = height / 2;
        const distFromCenter = Math.abs(y - centerY) / (height / 2);
        
        if (this.state.sections.length === 0) {
            return { vx: 0, vy: 0 };
        }
        
        let section = this.state.sections[0];
        for (let i = 0; i < this.state.sections.length - 1; i++) {
            if (normalizedX >= this.state.sections[i].x && normalizedX < this.state.sections[i + 1].x) {
                section = this.state.sections[i];
                break;
            }
            if (normalizedX >= this.state.sections[this.state.sections.length - 1].x) {
                section = this.state.sections[this.state.sections.length - 1];
            }
        }
        
        let V = section.V || 0;
        let spread = 1 - distFromCenter * 0.5;
        
        if (this.state.shockLocation !== null) {
            const shockX = this.state.sections[3].x + 
                          (this.state.sections[5].x - this.state.sections[3].x) * this.state.shockLocation;
            if (Math.abs(normalizedX - shockX) < 0.05) {
                V *= 0.7;
            }
        }
        
        if (normalizedX < this.state.sections[1].x) {
            V = 50 + (section.V || 0) * 0.01;
        }
        
        return {
            vx: V * spread * 0.1,
            vy: (y - centerY) * 0.02
        };
    }
    
    getShockWaves(width, height) {
        if (this.state.shockLocation === null) return [];
        
        const centerY = height / 2;
        const mixingStartX = width * this.state.sections[3].x;
        const mixingEndX = width * this.state.sections[5].x;
        
        const shockX = mixingStartX + (mixingEndX - mixingStartX) * this.state.shockLocation;
        
        const preShockM = this.state.sections[3].M || 1;
        const shockIntensity = this.normalShockRelations(preShockM).P2_P1;
        
        return [{
            x: shockX,
            width: 40 + shockIntensity * 15,
            intensity: shockIntensity,
            machNumber: preShockM,
            centerY: centerY
        }];
    }
    
    getPressureDistribution(width) {
        const distribution = [];
        
        for (let i = 0; i < this.state.sections.length; i++) {
            const section = this.state.sections[i];
            distribution.push({
                x: section.x * width,
                normalizedX: section.x,
                pressure: section.P,
                mach: section.M,
                velocity: section.V,
                temperature: section.T,
                name: section.name
            });
        }
        
        return distribution;
    }
    
    getVelocityDistribution(width, height) {
        const centerY = height / 2;
        const distribution = [];
        
        for (let i = 0; i < this.state.sections.length; i++) {
            const section = this.state.sections[i];
            distribution.push({
                x: section.x * width,
                normalizedX: section.x,
                vx: section.V || 0,
                vy: 0,
                magnitude: section.V || 0,
                mach: section.M,
                name: section.name
            });
        }
        
        return distribution;
    }
    
    getFlowFieldData() {
        return {
            sections: this.state.sections.map(s => ({
                name: s.name,
                x: s.x,
                area: s.A,
                mach: s.M,
                pressure: s.P,
                temperature: s.T,
                velocity: s.V
            })),
            choked: this.state.choked,
            shockLocation: this.state.shockLocation,
            massFlowPrimary: this.state.massFlowPrimary,
            massFlowSecondary: this.state.massFlowSecondary,
            massFlowTotal: this.state.massFlowTotal,
            maxAllowableFlow: this.state.maxAllowableFlow,
            entrainmentCoefficient: this.state.entrainmentCoefficient,
            outletPressure: this.state.outletPressure,
            pressureDistribution: this.getPressureDistribution(1),
            machDistribution: this.state.sections.map(s => ({ x: s.x, M: s.M })),
            iterations: this.state.iterations,
            converged: this.state.converged
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OneDimensionalEjectorModel;
}
