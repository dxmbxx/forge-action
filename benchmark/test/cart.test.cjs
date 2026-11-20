const {test}=require('node:test');
const assert=require('node:assert/strict');
const {total,paginate}=require('../src/cart.cjs');
test('empty cart is zero',()=>assert.equal(total([]),0));
test('single item',()=>assert.equal(total([{priceCents:125,quantity:1}]),125));
test('quantity is included',()=>assert.equal(total([{priceCents:125,quantity:3},{priceCents:99,quantity:2}]),573));
test('zero quantity adds nothing',()=>assert.equal(total([{priceCents:999,quantity:0}]),0));
test('zero quantity line is ignored',()=>assert.equal(total([{priceCents:125,quantity:2},{priceCents:999,quantity:0}]),250));
test('page numbering starts at one',()=>assert.deepEqual(paginate([1,2,3,4,5],1,2),[1,2]));
test('last page can be short',()=>assert.deepEqual(paginate([1,2,3,4,5],3,2),[5]));
test('page beyond end is empty',()=>assert.deepEqual(paginate([1],5,2),[]));

for (const page of [0, -1, 1.5, NaN, Infinity]) {
  test('rejects invalid page: ' + String(page), () => {
    assert.throws(() => paginate([1, 2, 3], page, 2), RangeError);
  });
}
for (const pageSize of [0, -1, 1.5, NaN, Infinity]) {
  test('rejects invalid pageSize: ' + String(pageSize), () => {
    assert.throws(() => paginate([1, 2, 3], 1, pageSize), RangeError);
  });
}
