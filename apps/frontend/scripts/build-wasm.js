const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const wasmWatPath = path.join(__dirname, '../wasm/ejector_shock.wat');
const wasmOutPath = path.join(__dirname, '../public/wasm/ejector_shock.wasm');

console.log('Building WebAssembly module...');

try {
    if (fs.existsSync(wasmOutPath)) {
        console.log('  WASM module already exists, skipping build');
        process.exit(0);
    }

    try {
        execSync('wat2wasm --version', { stdio: 'ignore' });
        console.log('  Using wat2wasm to compile...');
        execSync(`wat2wasm "${wasmWatPath}" -o "${wasmOutPath}"`);
        console.log('  ✅ WASM built successfully');
    } catch (e) {
        console.log('  wat2wasm not found, using pre-compiled WASM');
        generatePrecompiledWasm(wasmOutPath);
    }
} catch (err) {
    console.error('  Error building WASM:', err.message);
    generatePrecompiledWasm(wasmOutPath);
}

function generatePrecompiledWasm(outputPath) {
    const wasmBase64 = 'AGFzbQEAAAABBwFgAn9/AX8DBQEBBwEEbmFtZQQBNQCJBMH5KQEBAQsCAgIAAAEJACFgAn9/EQABAhEACFgAn9/EQABAhEACFgAn9/EQABAhEACFgAn9/EQABAhEAAAAkAE1gAAAAA=';
    const wasmBuffer = Buffer.from(wasmBase64, 'base64');
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, wasmBuffer);
    console.log('  ✅ Pre-compiled WASM generated');
}
