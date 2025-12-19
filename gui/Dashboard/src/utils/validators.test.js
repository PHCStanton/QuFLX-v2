/* eslint-env node */
/* global process */
import { validateMarketData } from './validators.js';

// Simple test runner
const runTests = () => {
  let passed = 0;
  let failed = 0;

  const assert = (desc, condition) => {
    if (condition) {
      console.log(`✅ ${desc}`);
      passed++;
    } else {
      console.error(`❌ ${desc}`);
      failed++;
    }
  };

  console.log('--- Testing validateMarketData ---');

  // Test 1: Valid Tick
  const validTick = { asset: 'EURUSD', price: 1.05, timestamp: 1700000000 };
  const r1 = validateMarketData(validTick);
  assert('Valid Tick should pass', r1.valid === true && r1.asset === 'EURUSD' && r1.price === 1.05);

  // Test 2: Valid Candle (uses close as price)
  const validCandle = { asset: 'GBPUSD', open: 1.2, close: 1.25, time: 1700000000 };
  const r2 = validateMarketData(validCandle);
  assert('Valid Candle should pass', r2.valid === true && r2.price === 1.25);

  // Test 3: Missing Asset
  const missingAsset = { price: 1.05 };
  const r3 = validateMarketData(missingAsset);
  assert('Missing asset should fail', r3.valid === false && r3.error === 'Missing asset');

  // Test 4: Invalid Price
  const invalidPrice = { asset: 'EURUSD', price: 'foo' };
  const r4 = validateMarketData(invalidPrice);
  assert('Invalid price should fail', r4.valid === false && r4.error.includes('Invalid price'));

  // Test 5: Empty Payload
  const empty = null;
  const r5 = validateMarketData(empty);
  assert('Empty payload should fail', r5.valid === false);

  console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed`);
  
  if (failed > 0) process.exit(1);
};

runTests();
