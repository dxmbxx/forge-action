// Deliberately flawed baseline for the Forge R&D benchmark.
function total(items) {
  return items.reduce((sum, item) => sum + item.priceCents, 0);
}
function paginate(items, page, pageSize) {
  return items.slice(page * pageSize, (page + 1) * pageSize);
}
module.exports = { total, paginate };
