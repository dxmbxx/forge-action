const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paginate } = require('../src/cart.cjs');

test('empty array returns an empty page', () => {
  assert.deepEqual(paginate([], 1, 2), []);
});

test('first page smaller than pageSize returns the whole array', () => {
  assert.deepEqual(paginate([1, 2, 3], 1, 10), [1, 2, 3]);
});

test('second page returns the remaining items', () => {
  assert.deepEqual(paginate([1, 2, 3, 4], 2, 2), [3, 4]);
});

test('page past the last page returns an empty array', () => {
  assert.deepEqual(paginate([1, 2, 3, 4], 3, 2), []);
});
