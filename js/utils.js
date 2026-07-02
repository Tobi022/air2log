// Airside LogTen Importer v1.4.5 - utils.js

    function clean(value) { return String(value ?? '').replace(/\r?\n/g, ' ').trim(); }

    function normalizeKey(key) { return clean(key).replace(/^\uFEFF/, '').replace(/\s+/g, ' ').toLowerCase(); }

    function getField(row, fieldName) {
      const wanted = normalizeKey(fieldName);
      const key = Object.keys(row).find(k => normalizeKey(k) === wanted);
      return key ? row[key] : '';
    }

    function hasField(row, fieldName) { return Object.keys(row).some(k => normalizeKey(k) === normalizeKey(fieldName)); }

    function isTruthyFlag(value) {
      const v = clean(value).toLowerCase();
      return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'x';
    }

    function showStatus(message, type) {
      const status = el('status');
      status.textContent = message;
      status.className = 'status ' + type;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }

