// Airside LogTen Importer v1.4.3 - people.js

    function handlePeopleFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      el('peopleFilePill').textContent = file.name;
      el('peopleDrop').classList.add('loaded');
      showStatus('Reading People export...', 'info');

      // LogTen's People Export is tab-separated and can contain malformed quoted line breaks.
      // A simple line-based TSV parser is more reliable here than normal CSV quote parsing.
      const reader = new FileReader();
      reader.onload = () => {
        try {
          peopleRows = parsePeopleExportText(String(reader.result || ''));
          buildPeopleLookup(peopleRows);
          recompute();
        } catch (error) {
          showStatus('Error processing People export: ' + error.message, 'error');
        }
      };
      reader.onerror = () => showStatus('Error reading People export.', 'error');
      reader.readAsText(file, 'UTF-8');
    }

    function parsePeopleExportText(text) {
      const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = normalized.split('\n').filter(line => line.trim() !== '');
      if (!lines.length) return [];

      const headers = lines[0].split('\t').map(header => clean(header).replace(/^\uFEFF/, ''));
      const rows = [];

      for (const line of lines.slice(1)) {
        const cells = line.split('\t');
        const row = {};
        headers.forEach((header, index) => {
          row[header] = clean(cells[index] ?? '').replace(/^"|"$/g, '').trim();
        });

        // Keep only real person rows. This also skips continuation lines from names containing line breaks.
        if (clean(row['Name']) || clean(row['Full Name']) || clean(row['ID'])) rows.push(row);
      }
      return rows;
    }

    function buildPeopleLookup(rows) {
      peopleById = new Map();
      manualPeopleById = new Map();
      duplicateIds = new Map();
      thisIsMeName = '';
      thisIsMeId = '';
      manualThisIsMeName = '';

      for (const row of rows) {
        const id = clean(getField(row, 'ID'));
        const fullName = clean(getField(row, 'Full Name') || getField(row, 'Name'));
        const isMe = clean(getField(row, 'This is Me'));

        if (!thisIsMeName && fullName && isTruthyFlag(isMe)) {
          thisIsMeName = fullName;
          thisIsMeId = id;
        }

        if (!id || !fullName) continue;
        if (peopleById.has(id)) {
          if (!duplicateIds.has(id)) duplicateIds.set(id, [peopleById.get(id)]);
          duplicateIds.get(id).push(fullName);
          continue;
        }
        peopleById.set(id, fullName);
      }
    }

    function getPicNameForId(id, options) {
      const cleanedId = clean(id);
      if (!cleanedId) return '';
      if (peopleById.has(cleanedId)) return peopleById.get(cleanedId);
      if (options.useManualPicNames && manualPeopleById.has(cleanedId)) return manualPeopleById.get(cleanedId);
      return '';
    }

    function isManualPicId(id, options) {
      const cleanedId = clean(id);
      return options.useManualPicNames && manualPeopleById.has(cleanedId) && !peopleById.has(cleanedId);
    }

    function getSicName(options) {
      if (!options.setSicToThisIsMe) return '';
      return thisIsMeName || manualThisIsMeName || '';
    }

    function buildPicPreview(rows, options) {
      const unique = new Map();
      rows.forEach(row => {
        const pic = clean(getField(row, 'PIC'));
        if (!pic) return;
        if (!unique.has(pic)) unique.set(pic, { id: pic, count: 0 });
        unique.get(pic).count += 1;
      });

      return Array.from(unique.values()).map(item => {
        if (!options.replacePicWithName) return { id: item.id, name: 'Matching disabled', status: 'skipped', count: item.count };
        if (peopleById.has(item.id)) return { id: item.id, name: peopleById.get(item.id), status: 'matched', count: item.count };
        if (options.useManualPicNames && manualPeopleById.has(item.id)) return { id: item.id, name: manualPeopleById.get(item.id), status: 'manual', count: item.count };
        return { id: item.id, name: 'Not found', status: 'missing', count: item.count };
      }).sort((a, b) => {
        const order = { missing: 0, manual: 1, matched: 2, skipped: 3 };
        return order[a.status] - order[b.status] || a.id.localeCompare(b.id, undefined, { numeric: true });
      });
    }

    function applyManualFixInputs() {
      document.querySelectorAll('.manual-name-input').forEach(input => {
        const id = clean(input.getAttribute('data-pic-id'));
        const name = clean(input.value);
        if (!id) return;
        if (name) manualPeopleById.set(id, name);
        else manualPeopleById.delete(id);
      });
      recompute();
      setTab('pic');
    }

    function applyManualSicName() {
      manualThisIsMeName = clean(el('manualSicName').value);
      recompute();
    }

    function clearManualSicName() {
      manualThisIsMeName = '';
      el('manualSicName').value = '';
      recompute();
    }

