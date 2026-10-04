export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// "2026-03-04" -> "04/03"
export const dayMonth = (isoDate) => `${isoDate.slice(8)}/${isoDate.slice(5, 7)}`;
