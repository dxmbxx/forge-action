// Deliberately flawed baseline for the Forge R&D benchmark.
function total(items) {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}
function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  if (start < 0) return [];
  return items.slice(start, start + pageSize);
}
module.exports = { total, paginate };
