// Deliberately flawed baseline for the Forge R&D benchmark.
function total(items) {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}
function paginate(items, page, pageSize) {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError('page must be a positive integer');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pageSize must be a positive integer');
  }
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
module.exports = { total, paginate };
