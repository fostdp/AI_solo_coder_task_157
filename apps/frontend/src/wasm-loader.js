class WasmShockCalculator {
    constructor() {
        this.instance = null;
        this.loaded = false;
    }

    async load() {
        if (this.loaded) return this;

        try {
            const response = await fetch('/wasm/ejector_shock.wasm');
            const bytes = await response.arrayBuffer();
            const { instance } = await WebAssembly.instantiate(bytes);
            
            this.instance = instance;
            this.loaded = true;
            
            console.log('✅ WebAssembly shock calculator loaded');
        } catch (err) {
            console.warn('⚠️ WASM load failed, falling back to JS implementation:', err.message);
            this.loaded = false;
        }

        return this;
    }

    calculateShockLocation(M_inlet, backPressureRatio, isChoked, omega) {
        if (!this.loaded) {
            return this._jsFallback(M_inlet, backPressureRatio, isChoked, omega);
        }

        const result = this.instance.exports.calculate_shock_location(
            M_inlet,
            backPressureRatio,
            isChoked ? 1.0 : 0.0,
            omega
        );

        return result < 0 ? null : result;
    }

    calculateShockIntensity(M1) {
        if (!this.loaded) {
            const gamma = 1.33;
            return (2 * gamma * M1 * M1 - (gamma - 1)) / (gamma + 1);
        }

        return this.instance.exports.normal_shock_relations(M1);
    }

    applyDamping(prev, raw, dampingCoeff = 0.15) {
        if (!this.loaded) {
            const delta = raw - prev;
            return prev + delta * (1 - dampingCoeff);
        }

        return this.instance.exports.apply_damping(prev, raw, dampingCoeff);
    }

    calculateEntrainmentPeak(omega) {
        if (!this.loaded) {
            const peakOmega = 0.4;
            const peakWidth = 0.25;
            const diff = (omega - peakOmega) / peakWidth;
            return Math.exp(-(diff * diff));
        }

        return this.instance.exports.calculate_entrainment_peak(omega);
    }

    _jsFallback(M_inlet, backPressureRatio, isChoked, omega) {
        if (M_inlet <= 1) return null;

        const baseLocation = 0.3 + 0.4 * (M_inlet - 1);
        const backPressureCorrection = 1 - backPressureRatio * 0.3;
        const chokeCorrection = isChoked ? 0.9 : 1.0;
        const omegaCorrection = 0.7 + 0.6 * omega;

        const rawLocation = baseLocation * backPressureCorrection * chokeCorrection * omegaCorrection;

        return Math.max(0.15, Math.min(0.85, rawLocation));
    }
}

const wasmShockCalculator = new WasmShockCalculator();

module.exports = {
    WasmShockCalculator,
    wasmShockCalculator
};
