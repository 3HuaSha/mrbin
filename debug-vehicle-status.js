/**
 * 详细调试 Samsara Vehicle Stats API
 * 显示每个车辆的完整状态信息
 */

const SAMSARA_TOKEN = process.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke';

async function debugVehicleStatus() {
  console.log('🔍 详细调试 Samsara Vehicle Stats API\n');
  
  const headers = {
    'Authorization': `Bearer ${SAMSARA_TOKEN}`,
    'Accept': 'application/json'
  };

  // 测试完整的 types 组合
  const statsTypes = [
    'engineStates',
    'obdDriver',
    'fuelPercents',
    'ecuSpeedMph',
    'obdOdometerMeters',
    'engineRpm',
    'gps'
  ].join(',');

  console.log(`📋 请求参数: types=${statsTypes}\n`);

  try {
    const url = `https://api.samsara.com/fleet/vehicles/stats?types=${statsTypes}`;
    const response = await fetch(url, { headers });
    
    console.log(`📡 响应状态: ${response.status} ${response.statusText}\n`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API 错误:', errorText);
      return;
    }
    
    const data = await response.json();
    const vehicles = data.data || [];
    
    console.log(`✅ 成功获取 ${vehicles.length} 辆车的数据\n`);
    console.log('='.repeat(80));
    
    // 统计信息
    const stats = {
      total: vehicles.length,
      withEngineStates: 0,
      withEngineRpm: 0,
      withSpeed: 0,
      withFuel: 0,
      withDriver: 0,
      withGps: 0,
      withOdometer: 0,
      active: 0
    };
    
    // 详细分析每辆车
    vehicles.forEach((vehicle, index) => {
      console.log(`\n🚗 车辆 #${index + 1}: ${vehicle.name || vehicle.id}`);
      console.log('─'.repeat(80));
      
      // 显示所有可用的数据字段
      console.log('📊 可用数据字段:', Object.keys(vehicle).join(', '));
      
      let isActive = false;
      const reasons = [];
      
      // 1. 引擎状态
      if (vehicle.engineStates && Array.isArray(vehicle.engineStates) && vehicle.engineStates.length > 0) {
        stats.withEngineStates++;
        const latest = vehicle.engineStates[vehicle.engineStates.length - 1];
        console.log(`  ✅ engineStates: ${latest.value} (时间: ${latest.time})`);
        
        if (latest.value === 'On' || latest.value === 'Idle') {
          isActive = true;
          reasons.push(`引擎${latest.value}`);
        }
      } else {
        console.log(`  ❌ engineStates: 无数据`);
      }
      
      // 2. 发动机转速
      if (vehicle.engineRpm && Array.isArray(vehicle.engineRpm) && vehicle.engineRpm.length > 0) {
        stats.withEngineRpm++;
        const latest = vehicle.engineRpm[vehicle.engineRpm.length - 1];
        console.log(`  ✅ engineRpm: ${latest.value} RPM (时间: ${latest.time})`);
        
        if (latest.value > 0) {
          isActive = true;
          reasons.push(`${latest.value} RPM`);
        }
      } else {
        console.log(`  ❌ engineRpm: 无数据`);
      }
      
      // 3. 车速
      if (vehicle.ecuSpeedMph && Array.isArray(vehicle.ecuSpeedMph) && vehicle.ecuSpeedMph.length > 0) {
        stats.withSpeed++;
        const latest = vehicle.ecuSpeedMph[vehicle.ecuSpeedMph.length - 1];
        console.log(`  ✅ ecuSpeedMph: ${latest.value} mph (时间: ${latest.time})`);
        
        if (latest.value > 0) {
          isActive = true;
          reasons.push(`${latest.value} mph`);
        }
      } else {
        console.log(`  ❌ ecuSpeedMph: 无数据`);
      }
      
      // 4. 燃油
      if (vehicle.fuelPercents && Array.isArray(vehicle.fuelPercents) && vehicle.fuelPercents.length > 0) {
        stats.withFuel++;
        const latest = vehicle.fuelPercents[vehicle.fuelPercents.length - 1];
        console.log(`  ✅ fuelPercents: ${latest.value}% (时间: ${latest.time})`);
      } else {
        console.log(`  ❌ fuelPercents: 无数据`);
      }
      
      // 5. 司机
      if (vehicle.obdDriver && vehicle.obdDriver.driver) {
        stats.withDriver++;
        console.log(`  ✅ obdDriver: ${vehicle.obdDriver.driver.name} (ID: ${vehicle.obdDriver.driver.id})`);
        isActive = true;
        reasons.push(`司机: ${vehicle.obdDriver.driver.name}`);
      } else {
        console.log(`  ❌ obdDriver: 无数据`);
      }
      
      // 6. 里程表
      if (vehicle.obdOdometerMeters && Array.isArray(vehicle.obdOdometerMeters) && vehicle.obdOdometerMeters.length > 0) {
        stats.withOdometer++;
        const latest = vehicle.obdOdometerMeters[vehicle.obdOdometerMeters.length - 1];
        console.log(`  ✅ obdOdometerMeters: ${latest.value} 米 (时间: ${latest.time})`);
      } else {
        console.log(`  ❌ obdOdometerMeters: 无数据`);
      }
      
      // 7. GPS
      if (vehicle.gps && Array.isArray(vehicle.gps) && vehicle.gps.length > 0) {
        stats.withGps++;
        const latest = vehicle.gps[vehicle.gps.length - 1];
        console.log(`  ✅ gps: (${latest.latitude}, ${latest.longitude}) (时间: ${latest.time})`);
      } else {
        console.log(`  ❌ gps: 无数据`);
      }
      
      // 判定结果
      if (isActive) {
        stats.active++;
        console.log(`\n  ⭐ 判定: 活跃 (原因: ${reasons.join(', ')})`);
      } else {
        console.log(`\n  ❌ 判定: 不活跃`);
      }
    });
    
    // 总结
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 统计总结:\n');
    console.log(`  总车辆数: ${stats.total}`);
    console.log(`  活跃车辆: ${stats.active} (${(stats.active / stats.total * 100).toFixed(1)}%)`);
    console.log(`\n  数据完整性:`);
    console.log(`    - 有 engineStates: ${stats.withEngineStates} (${(stats.withEngineStates / stats.total * 100).toFixed(1)}%)`);
    console.log(`    - 有 engineRpm: ${stats.withEngineRpm} (${(stats.withEngineRpm / stats.total * 100).toFixed(1)}%)`);
    console.log(`    - 有 ecuSpeedMph: ${stats.withSpeed} (${(stats.withSpeed / stats.total * 100).toFixed(1)}%)`);
    console.log(`    - 有 fuelPercents: ${stats.withFuel} (${(stats.withFuel / stats.total * 100).toFixed(1)}%)`);
    console.log(`    - 有 obdDriver: ${stats.withDriver} (${(stats.withDriver / stats.total * 100).toFixed(1)}%)`);
    console.log(`    - 有 obdOdometerMeters: ${stats.withOdometer} (${(stats.withOdometer / stats.total * 100).toFixed(1)}%)`);
    console.log(`    - 有 gps: ${stats.withGps} (${(stats.withGps / stats.total * 100).toFixed(1)}%)`);
    
    // 建议
    console.log('\n💡 建议:\n');
    
    if (stats.active === 0) {
      console.log('  ⚠️  没有找到活跃车辆，可能的原因:');
      console.log('     1. 所有车辆的引擎都关闭了');
      console.log('     2. 车辆没有安装 OBD 设备或设备离线');
      console.log('     3. API 返回的数据不完整');
    }
    
    if (stats.withEngineStates < stats.total * 0.5) {
      console.log('  ⚠️  超过一半的车辆没有 engineStates 数据');
      console.log('     建议: 检查车辆是否安装了 OBD 设备');
    }
    
    if (stats.withDriver === 0) {
      console.log('  ℹ️  没有车辆有 obdDriver 数据');
      console.log('     这是正常的，只有当司机插入 OBD 钥匙时才会有数据');
    }
    
    console.log('\n✅ 调试完成！');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

// 运行调试
debugVehicleStatus().catch(console.error);
