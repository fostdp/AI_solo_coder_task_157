const GAMMA = 1.33;
const R = 461.5;
const T0 = 273.15 + 150;

function calculateMassFlow(P0, T0, gamma) {
    const A_throat = 0.001;
    const rho0 = P0 * 1000 / (R * T0);
    return rho0 * A_throat * Math.sqrt(gamma * R * T0) * 
           Math.pow(2 / (gamma + 1), (gamma + 1) / (2 * (gamma - 1)));
}

function checkChoking(P0, Ps, omega, gamma) {
    const Pm_estimate = Math.max(Ps * 10, 50);
    const Tm_estimate = (T0 + omega * 300) / (1 + omega);
    const A_mixing = 0.002;
    const massPrimary = calculateMassFlow(P0, T0, gamma);
    const massSecondary = omega * massPrimary;
    const totalMass = massPrimary + massSecondary;
    const rho_mixing = Pm_estimate * 1000 / (R * Tm_estimate);
    const V_mixing = totalMass / rho_mixing / A_mixing;
    const a_mixing = Math.sqrt(gamma * R * Tm_estimate);
    const M_mixing = V_mixing / a_mixing;
    
    console.log(`  P0=${P0.toFixed(0)}kPa, massPrimary=${massPrimary.toFixed(4)}, M_mixing=${M_mixing.toFixed(4)}`);
    
    return M_mixing >= 0.95;
}

console.log('调试壅塞判断（新逻辑）：\n');
for (let p = 0.3; p <= 1.0; p += 0.1) {
    const P0 = p * 1000;
    const Ps = 10;
    const omega = 0.4;
    const choked = checkChoking(P0, Ps, omega, GAMMA);
    console.log(`  压力=${p.toFixed(1)}MPa, 壅塞=${choked}\n`);
}
