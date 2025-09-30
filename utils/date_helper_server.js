// utils/date_helper_server.js
// Helper to produce normalized UTC midnight for a given day offset.
// This mirrors the parseDateStr.normalizedUtc behavior used elsewhere.

function offsetDate(offset = 0) {
  const now = new Date();
  const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight
  localToday.setDate(localToday.getDate() + Number(offset));
  const normalizedUtc = new Date(Date.UTC(localToday.getFullYear(), localToday.getMonth(), localToday.getDate(), 0, 0, 0, 0));
  return { date: localToday, normalizedUtc };
}

module.exports = { offsetDate };