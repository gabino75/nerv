/**
 * Test file for simple-node-app
 * Uses Node.js built-in test runner
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { add, subtract } from './index.js';

describe('Math functions', () => {
  test('add should return sum of two numbers', () => {
    assert.strictEqual(add(2, 3), 5);
    assert.strictEqual(add(-1, 1), 0);
    assert.strictEqual(add(0, 0), 0);
  });

  test('subtract should return difference of two numbers', () => {
    assert.strictEqual(subtract(5, 3), 2);
    assert.strictEqual(subtract(1, 1), 0);
    assert.strictEqual(subtract(0, 5), -5);
  });
});
