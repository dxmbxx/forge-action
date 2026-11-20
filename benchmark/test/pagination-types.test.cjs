const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paginate } = require('../src/cart.cjs');

for (const page of [null, undefined, true, '1']) {
  test('rejects non-integer page: ' + String(page), () => {
    assert.throws(() => paginate([1, 2, 3], page, 2), RangeError);
  });
}

for (const pageSize of [null, undefined, true, '1']) {
  test('rejects non-integer pageSize: ' + String(pageSize), () => {
    assert.throws(() => paginate([1, 2, 3], 1, pageSize), RangeError);
  });
}
