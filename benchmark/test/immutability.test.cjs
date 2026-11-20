const { test } = require('node:test');
const assert = require('node:assert/strict');
const { total, paginate } = require('../src/cart.cjs');

test('total sums a frozen cart with frozen items', () => {
  const items = Object.freeze([
    Object.freeze({ priceCents: 125, quantity: 3 }),
    Object.freeze({ priceCents: 99, quantity: 2 }),
  ]);

  assert.equal(total(items), 573);
});

test('paginate returns the requested page without changing the source array', () => {
  const input = [1, 2, 3, 4, 5];
  const snapshot = [...input];

  assert.deepEqual(paginate(input, 2, 2), [3, 4]);
  assert.deepEqual(input, snapshot);
});

test('paginate accepts a frozen array and returns an independent array', () => {
  const input = Object.freeze([1, 2, 3, 4, 5]);
  const page = paginate(input, 1, 2);

  assert.deepEqual(page, [1, 2]);
  assert.notEqual(page, input);

  page[0] = 99;
  page.push(6);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
});

test('paginate keeps references to selected objects and leaves their fields intact', () => {
  const first = { id: 1, name: 'first', priceCents: 100, quantity: 1 };
  const second = { id: 2, name: 'second', priceCents: 200, quantity: 2 };
  const third = { id: 3, name: 'third', priceCents: 300, quantity: 3 };
  const items = [first, second, third];

  const page = paginate(items, 1, 2);

  assert.deepEqual(page, [first, second]);
  assert.equal(page[0], first);
  assert.equal(page[1], second);
  assert.notEqual(page, items);
  assert.deepEqual(first, { id: 1, name: 'first', priceCents: 100, quantity: 1 });
  assert.deepEqual(second, { id: 2, name: 'second', priceCents: 200, quantity: 2 });
  assert.deepEqual(third, { id: 3, name: 'third', priceCents: 300, quantity: 3 });
});
