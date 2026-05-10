/**
 * 测试 Samsara Vehicle Stats API
 * 验证新的状态类型是否可用
 */

const SAMSARA_TOKEN = process.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke';

async function testVehicleStats() {
  console.log('🧪 测试 Samsara Vehicle Stats API\n');
  
  const headers = {
    'Authorization': `Bearer ${SAMSARA_TOKEN}`,
    'Accept': 'application/json'
  };

  // 测试不同的 types 组合
  const testCases = [
    {
      name: '基础状态',
      types: 'engineStates,obdDriver,fuelPercents'
    },
    {
      name: '扩展状态 1',
      types: 'engineStates,engineRpm,ecuSpeedMph'
    },
    {
      name: '扩展状态 2',
      types: 'obdDriver,obdOdometerMeters,gps'
    },
    {
      name: '完整状态（可能超限）',
      types: 'engineStates,obdDriver,fuelPercents,ecuSpeedMph,obdOdometerMeters,engineRpm,gps'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📋 测试: ${testCase.name}`);
    console.log(`   Types: ${testCase.types}`);
    
    try {
      const url = `https://api.samsara.com/fleet/vehicles/stats?types=${testCase.types}`;
      const response = await fetch(url, { headers });
      
      console.log(`   状态码: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        const vehicles = data.data || [];
        console.log(`   ✅ 成功获取 ${vehicles.length} 辆车的数据`);
        
        // 显示第一辆车的详细信息
        if (vehicles.length > 0) {
          const vehicle = vehicles[0];
          console.log(`\n   📊 示例车辆: ${vehicle.name || vehicle.id}`);
          
          // 检查每个状态类型
          const availableTypes = [];
          
          if (vehicle.engineStates && vehicle.engineStates.length > 0) {
            const state = vehicle.engineStates[vehicle.engineStates.length - 1];
            availableTypes.push(`engineStates: ${state.value}`);
          }
          
          if (vehicle.engineRpm && vehicle.engineRpm.length > 0) {
            const rpm = vehicle.engineRpm[vehicle.engineRpm.length - 1];
            availableTypes.push(`engineRpm: ${rpm.value} RPM`);
          }
          
          if (vehicle.ecuSpeedMph && vehicle.ecuSpeedMph.length > 0) {
            const speed = vehicle.ecuSpeedMph[vehicle.ecuSpeedMph.length - 1];
            availableTypes.push(`ecuSpeedMph: ${speed.value} mph`);
          }
          
          if (vehicle.obdDriver && vehicle.obdDriver.driver) {
            availableTypes.push(`obdDriver: ${vehicle.obdDriver.driver.name}`);
          }
          
          if (vehicle.fuelPercents && vehicle.fuelPercents.length > 0) {
            const fuel = vehicle.fuelPercents[vehicle.fuelPercents.length - 1];
            availableTypes.push(`fuelPercents: ${fuel.value}%`);
          }
          
          if (vehicle.obdOdometerMeters && vehicle.obdOdometerMeters.length > 0) {
            const odo = vehicle.obdOdometerMeters[vehicle.obdOdometerMeters.length - 1];
            availableTypes.push(`obdOdometerMeters: ${odo.value}m`);
          }
          
          if (vehicle.gps && vehicle.gps.length > 0) {
            const gps = vehicle.gps[vehicle.gps.length - 1];
            availableTypes.push(`gps: ${gps.latitude}, ${gps.longitude}`);
          }
          
          if (availableTypes.length > 0) {
            console.log(`   可用数据:`);
            availableTypes.forEach(type => console.log(`      - ${type}`));
          } else {
            console.log(`   ⚠️  没有可用的状态数据`);
          }
        }
      } else {
        const errorText = await response.text();
        console.log(`   ❌ 失败: ${errorText}`);
      }
    } catch (error) {
      console.log(`   ❌ 错误: ${error.message}`);
    }
  }

  // 测试活跃车辆检测
  console.log('\n\n🔍 测试活跃车辆检测\n');
  
  try {
    const url = 'https://api.samsara.com/fleet/vehicles/stats?types=engineStates,engineRpm,ecuSpeedMph';
    const response = await fetch(url, { headers });
    
    if (response.ok) {
      const data = await response.json();
      const vehicles = data.data || [];
      
      console.log(`总车辆数: ${vehicles.length}`);
      
      let activeCount = 0;
      const activeVehicles = [];
      
      vehicles.forEach(vehicle => {
        let isActive = false;
        const reasons = [];
        
        // 检查引擎状态
        if (vehicle.engineStates && vehicle.engineStates.length > 0) {
          const state = vehicle.engineStates[vehicle.engineStates.length - 1];
          if (state.value === 'On' || state.value === 'Idle') {
            isActive = true;
            reasons.push(`引擎${state.value}`);
          }
        }
        
        // 检查转速
        if (vehicle.engineRpm && vehicle.engineRpm.length > 0) {
          const rpm = vehicle.engineRpm[vehicle.engineRpm.length - 1];
          if (rpm.value > 0) {
            isActive = true;
            reasons.push(`${rpm.value} RPM`);
          }
        }
        
        // 检查速度
        if (vehicle.ecuSpeedMph && vehicle.ecuSpeedMph.length > 0) {
          const speed = vehicle.ecuSpeedMph[vehicle.ecuSpeedMph.length - 1];
          if (speed.value > 0) {
            isActive = true;
            reasons.push(`${speed.value} mph`);
          }
        }
        
        if (isActive) {
          activeCount++;
          activeVehicles.push({
            name: vehicle.name || vehicle.id,
            reasons: reasons.join(', ')
          });
        }
      });
      
      console.log(`活跃车辆数: ${activeCount}\n`);
      
      if (activeVehicles.length > 0) {
        console.log('活跃车辆列表:');
        activeVehicles.forEach((v, i) => {
          console.log(`  ${i + 1}. ${v.name} (${v.reasons})`);
        });
      } else {
        console.log('⚠️  当前没有活跃车辆');
      }
    }
  } catch (error) {
    console.log(`❌ 错误: ${error.message}`);
  }
}

// 运行测试
testVehicleStats().catch(console.error);
