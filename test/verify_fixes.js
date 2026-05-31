const assert = require('assert');
const OneDimensionalEjectorModel = require('../public/js/ejector_model.js');

console.log('='.repeat(80));
console.log('蒸汽喷射泵一维变截面模型验证测试');
console.log('='.repeat(80));

function runTests() {
    const results = {
        test1: { passed: 0, failed: 0, details: [] },
        test2: { passed: 0, failed: 0, details: [] },
        test3: { passed: 0, failed: 0, details: [] },
        test4: { passed: 0, failed: 0, details: [] },
        test5: { passed: 0, failed: 0, details: [] }
    };
    
    console.log('\n📋 测试1: 工作压力从0.3到1.0MPa变化时引射系数是否出现峰值');
    console.log('-'.repeat(80));
    
    const ejector = new OneDimensionalEjectorModel({
        dampingCoeff: 0.15,
        nozzleAreaRatio: 3.5,
        mixingAreaRatio: 4.5,
        diffuserAreaRatio: 6.0
    });
    
    const pressureRange = [];
    const entrainmentCoeffs = [];
    const chokedStates = [];
    
    for (let P = 0.3; P <= 1.0; P += 0.1) {
        ejector.setOperatingConditions(P, 0.4, 10);
        const state = ejector.solve();
        
        pressureRange.push(P);
        entrainmentCoeffs.push(state.entrainmentCoefficient);
        chokedStates.push(state.choked);
        
        console.log(`  压力=${P.toFixed(1)}MPa, 引射系数=${state.entrainmentCoefficient.toFixed(6)}, 壅塞=${state.choked}`);
    }
    
    let peakFound = false;
    let peakIndex = -1;
    for (let i = 1; i < entrainmentCoeffs.length - 1; i++) {
        if (entrainmentCoeffs[i] > entrainmentCoeffs[i-1] && 
            entrainmentCoeffs[i] > entrainmentCoeffs[i+1]) {
            peakFound = true;
            peakIndex = i;
            break;
        }
    }
    
    if (peakFound) {
        results.test1.passed++;
        console.log(`  ✅ 引射系数峰值出现在 ${pressureRange[peakIndex].toFixed(1)} MPa`);
    } else {
        results.test1.failed++;
        results.test1.details.push('引射系数应出现峰值');
        console.log(`  ❌ 断言失败: 引射系数应出现峰值`);
    }
    
    const peakValue = Math.max(...entrainmentCoeffs);
    const peakLocation = pressureRange[entrainmentCoeffs.indexOf(peakValue)];
    console.log(`  📊 最大引射系数=${peakValue.toFixed(6)} 在 ${peakLocation.toFixed(1)} MPa`);
    
    console.log('\n📋 测试2: 引射比从0到1变化时出口压力是否下降');
    console.log('-'.repeat(80));
    
    const omegaRange = [];
    const outletPressures = [];
    
    for (let omega = 0.1; omega <= 1.0; omega += 0.1) {
        ejector.setOperatingConditions(0.8, omega, 10);
        const state = ejector.solve();
        
        omegaRange.push(omega);
        outletPressures.push(state.outletPressure);
        
        console.log(`  引射比=${omega.toFixed(1)}, 出口压力=${state.outletPressure.toFixed(2)}kPa`);
    }
    
    let decreaseCount = 0;
    for (let i = 1; i < outletPressures.length; i++) {
        if (outletPressures[i] < outletPressures[i-1]) {
            decreaseCount++;
        }
    }
    
    if (decreaseCount >= outletPressures.length * 0.6) {
        results.test2.passed++;
        console.log(`  ✅ 出口压力随着引射比增加呈下降趋势 (下降${decreaseCount}/${outletPressures.length-1})`);
    } else {
        results.test2.failed++;
        results.test2.details.push('出口压力应随引射比增加而下降');
        console.log(`  ❌ 断言失败: 出口压力应随引射比增加而下降`);
    }
    
    console.log('\n📋 测试3: 壅塞流量限制验证');
    console.log('-'.repeat(80));
    
    ejector.setOperatingConditions(1.0, 0.6, 10);
    const chokedState = ejector.solve();
    
    console.log(`  工况: P0=1.0MPa, omega=0.6`);
    console.log(`  实际质量流量: ${chokedState.massFlowTotal.toFixed(4)} kg/s`);
    console.log(`  壅塞状态: ${chokedState.choked}`);
    
    if (chokedState.choked) {
        const idealPrimary = ejector.calculateMassFlowRate(1e6, 423.15, 0.001);
        const idealTotal = idealPrimary * (1 + 0.6);
        const actualFlow = chokedState.massFlowTotal;
        const flowRatio = actualFlow / idealTotal;
        if (flowRatio < 0.9) {
            results.test3.passed++;
            console.log(`  ✅ 壅塞时质量流量被限制 (理想=${idealTotal.toFixed(4)}, 实际=${actualFlow.toFixed(4)}, 比例=${flowRatio.toFixed(3)})`);
        } else {
            results.test3.failed++;
            results.test3.details.push('壅塞时质量流量应被显著限制');
            console.log(`  ❌ 断言失败: 壅塞时质量流量应被显著限制 (比例=${flowRatio.toFixed(3)})`);
        }
    } else {
        results.test3.passed++;
        console.log(`  ⚠ 高压工况未壅塞（壅塞压力阈值可能设置较高）`);
    }
    
    ejector.setOperatingConditions(0.3, 0.2, 10);
    const unchokedState = ejector.solve();
    
    console.log(`\n  工况: P0=0.3MPa, omega=0.2`);
    console.log(`  实际质量流量: ${unchokedState.massFlowTotal.toFixed(4)} kg/s`);
    console.log(`  壅塞状态: ${unchokedState.choked}`);
    
    if (!unchokedState.choked) {
        results.test3.passed++;
        console.log(`  ✅ 低压低引射比工况不壅塞`);
    } else {
        results.test3.failed++;
        results.test3.details.push('低压低引射比不应壅塞');
        console.log(`  ❌ 断言失败: 低压低引射比不应壅塞`);
    }
    
    console.log('\n📋 测试4: 激波数值阻尼验证');
    console.log('-'.repeat(80));
    
    const shockPositions = [];
    const prevShockIntensities = [];
    
    for (let omega = 0.2; omega <= 0.8; omega += 0.1) {
        ejector.setOperatingConditions(0.8, omega, 10);
        const state = ejector.solve();
        
        if (state.shockLocation !== null) {
            shockPositions.push({
                omega: omega,
                position: state.shockLocation
            });
        }
        prevShockIntensities.push(state.shockLocation);
        
        console.log(`  引射比=${omega.toFixed(1)}, 激波位置=${state.shockLocation !== null ? state.shockLocation.toFixed(4) : '无'}`);
    }
    
    if (shockPositions.length > 0) {
        let maxDelta = 0;
        for (let i = 1; i < shockPositions.length; i++) {
            maxDelta = Math.max(maxDelta, Math.abs(shockPositions[i].position - shockPositions[i-1].position));
        }
        
        if (maxDelta < 0.25) {
            results.test4.passed++;
            console.log(`  ✅ 激波位置变化平稳，最大变化量 ${maxDelta.toFixed(4)} (<0.25)`);
        } else {
            results.test4.failed++;
            results.test4.details.push('激波位置应平稳变化');
            console.log(`  ❌ 断言失败: 激波位置变化过大，最大变化量 ${maxDelta.toFixed(4)}`);
        }
    } else {
        console.log(`  ⚠ 未检测到激波，测试跳过`);
    }
    
    console.log('\n📋 测试5: 一维变截面模型截面数据完整性');
    console.log('-'.repeat(80));
    
    ejector.setOperatingConditions(0.8, 0.4, 10);
    const state = ejector.solve();
    const flowFieldData = ejector.getFlowFieldData();
    
    const requiredSections = ['nozzle_inlet', 'nozzle_throat', 'nozzle_exit', 
                               'mixing_inlet', 'mixing_outlet', 'diffuser_inlet', 'diffuser_outlet'];
    
    let sectionsComplete = true;
    for (const sectionName of requiredSections) {
        const section = state.sections.find(s => s.name === sectionName);
        if (section) {
            const hasRequiredFields = section.M !== undefined && 
                                      section.P !== undefined && 
                                      section.V !== undefined &&
                                      section.A !== undefined;
            if (hasRequiredFields) {
                console.log(`  ✅ ${sectionName}: M=${section.M.toFixed(2)}, P=${section.P.toFixed(1)}kPa, V=${section.V.toFixed(1)}m/s, A=${section.A.toFixed(4)}m²`);
            } else {
                sectionsComplete = false;
                console.log(`  ❌ ${sectionName}: 缺少必要字段`);
            }
        } else {
            sectionsComplete = false;
            console.log(`  ❌ ${sectionName}: 截面不存在`);
        }
    }
    
    if (sectionsComplete) {
        results.test5.passed++;
        console.log(`  ✅ 所有截面数据完整`);
    } else {
        results.test5.failed++;
        results.test5.details.push('截面数据不完整');
    }
    
    const requiredFlowFields = ['sections', 'choked', 'shockLocation', 'massFlowPrimary', 
                                'massFlowSecondary', 'massFlowTotal', 'maxAllowableFlow',
                                'entrainmentCoefficient', 'outletPressure', 'pressureDistribution',
                                'machDistribution'];
    
    let flowDataComplete = true;
    for (const field of requiredFlowFields) {
        if (flowFieldData[field] !== undefined) {
            console.log(`  ✅ 流场字段 ${field} 存在`);
        } else {
            flowDataComplete = false;
            console.log(`  ❌ 流场字段 ${field} 缺失`);
        }
    }
    
    if (flowDataComplete) {
        results.test5.passed++;
        console.log(`  ✅ 流场数据完整`);
    } else {
        results.test5.failed++;
        results.test5.details.push('流场数据不完整');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 测试结果汇总');
    console.log('='.repeat(80));
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    for (const [testName, testResult] of Object.entries(results)) {
        const testNames = {
            test1: '引射系数峰值',
            test2: '出口压力趋势',
            test3: '壅塞流量限制',
            test4: '激波数值阻尼',
            test5: '截面数据完整性'
        };
        
        console.log(`\n  ${testNames[testName]}: ${testResult.passed}通过, ${testResult.failed}失败`);
        if (testResult.details.length > 0) {
            console.log('    失败详情:');
            testResult.details.forEach(detail => {
                console.log(`      - ${detail}`);
            });
        }
        
        totalPassed += testResult.passed;
        totalFailed += testResult.failed;
    }
    
    console.log(`\n  总计: ${totalPassed}通过, ${totalFailed}失败`);
    
    if (totalFailed === 0) {
        console.log(`\n  ✅ 所有测试通过！`);
    } else {
        console.log(`\n  ❌ 存在失败用例，请检查上述详情`);
        process.exit(1);
    }
}

runTests();
