// 测试司机名称规范化功能
// 运行: node test-driver-normalization.js

const normalizeDriverName = (name) => {
  if (!name) return '';
  // 移除 (1), (2) 等后缀
  return name.replace(/\s*\(\d+\)\s*$/g, '').trim();
};

// 测试用例
const testCases = [
  { input: 'Dao(1)', expected: 'Dao' },
  { input: 'Dao(2)', expected: 'Dao' },
  { input: 'John(1)', expected: 'John' },
  { input: 'John Smith(3)', expected: 'John Smith' },
  { input: 'Dao', expected: 'Dao' },
  { input: 'John Smith', expected: 'John Smith' },
  { input: 'Wang (1)', expected: 'Wang' },
  { input: 'Li (10)', expected: 'Li' },
  { input: 'Chen(999)', expected: 'Chen' },
  { input: '', expected: '' },
  { input: 'Test(1)(2)', expected: 'Test(1)' }, // 只移除最后一个
];

console.log('🧪 测试司机名称规范化功能\n');
console.log('=' .repeat(60));

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = normalizeDriverName(test.input);
  const success = result === test.expected;
  
  if (success) {
    passed++;
    console.log(`✅ 测试 ${index + 1}: "${test.input}" → "${result}"`);
  } else {
    failed++;
    console.log(`❌ 测试 ${index + 1}: "${test.input}" → "${result}" (期望: "${test.expected}")`);
  }
});

console.log('=' .repeat(60));
console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败`);

if (failed === 0) {
  console.log('🎉 所有测试通过！');
} else {
  console.log('⚠️  有测试失败，请检查代码');
  process.exit(1);
}

// 模拟实际使用场景
console.log('\n📝 实际使用场景模拟:\n');

const samsaraDrivers = [
  { id: 'samsara-1', name: 'Dao(1)', phone: '123-456-7890' },
  { id: 'samsara-2', name: 'Dao(2)', phone: '123-456-7891' },
  { id: 'samsara-3', name: 'John(1)', phone: '123-456-7892' },
  { id: 'samsara-4', name: 'John(2)', phone: '123-456-7893' },
  { id: 'samsara-5', name: 'Wang', phone: '123-456-7894' },
];

const driverMap = new Map();

samsaraDrivers.forEach(driver => {
  const normalized = normalizeDriverName(driver.name);
  
  if (driverMap.has(normalized)) {
    console.log(`🔄 合并: "${driver.name}" → 主账户 "${normalized}"`);
  } else {
    console.log(`➕ 创建: "${normalized}" (来自 "${driver.name}")`);
    driverMap.set(normalized, driver);
  }
});

console.log(`\n📊 最终结果: ${samsaraDrivers.length} 个 Samsara 司机 → ${driverMap.size} 个系统账户`);
console.log('\n系统中的司机账户:');
driverMap.forEach((driver, name) => {
  console.log(`  - ${name}`);
});
