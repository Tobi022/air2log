
    let flightRows = [];
    let peopleRows = [];
    let peopleById = new Map();
    let manualPeopleById = new Map();
    let duplicateIds = new Map();
    let thisIsMeName = '';
    let thisIsMeId = '';
    let manualThisIsMeName = '';
    let processedData = null;
    let previewRows = [];
    let scheduleResultsByRow = new Map();
    let schedulePreviewRows = [];
    let scheduleAccessAllowed = false;
    let scheduleAccessReason = 'not_checked';
    let activeTab = 'flights';

    const logtenImportMapping = [
      ['Employee id', 'Do Not Import', 'Do Not Import'],
      ['Crew id', 'Do Not Import', 'Do Not Import'],
      ['Flight', 'Flight #', 'Flight'],
      ['Departure-Place', 'From', 'Flight'],
      ['Destination-Place', 'To', 'Flight'],
      ['Departure Date', 'Date', 'Flight'],
      ['Block off', 'Out', 'Flight'],
      ['Arrival Date', 'Do Not Import', 'Do Not Import'],
      ['Block on', 'In', 'Flight'],
      ['Scheduled Dep', 'Scheduled Dep', 'Time'],
      ['Scheduled Arr', 'Scheduled Arr', 'Time'],
      ['Scheduled Time Note', 'Do Not Import', 'Do Not Import'],
      ['Aircraft Registration', 'Aircraft ID', 'Aircraft'],
      ['Aircraft Type', 'Type', 'Aircraft'],
      ['Duration', 'Total Time', 'Time'],
      ['Landing', 'Pilot Flying', 'Duty'],
      ['PIC ID', 'Do Not Import', 'Do Not Import'],
      ['PIC', 'PIC/P1 Crew', 'Crew'],
      ['SIC', 'SIC/P2 Crew', 'Crew']
    ];

    const el = id => document.getElementById(id);
    const optionIds = ['formatAircraftReg', 'replaceAircraftType', 'replacePicWithName', 'setSicToThisIsMe', 'keepPicId', 'useManualPicNames', 'blockMissingPic', 'enableScheduleLookup'];

    el('csvFile').addEventListener('change', handleFlightFile);
    el('peopleFile').addEventListener('change', handlePeopleFile);
    optionIds.forEach(id => el(id).addEventListener('change', recompute));
    el('downloadBtn').addEventListener('click', downloadProcessedCsv);
    el('downloadMissingBtn').addEventListener('click', downloadUnknownPicCsv);
    el('applyManualSicBtn').addEventListener('click', applyManualSicName);
    el('clearManualSicBtn').addEventListener('click', clearManualSicName);
    el('manualSicName').addEventListener('keydown', event => {
      if (event.key === 'Enter') applyManualSicName();
    });
    el('resetBtn').addEventListener('click', resetAll);
    el('tabFlights').addEventListener('click', () => setTab('flights'));
    el('tabPic').addEventListener('click', () => setTab('pic'));
    el('tabSchedules').addEventListener('click', () => setTab('schedules'));
    el('scanSchedulesBtn').addEventListener('click', scanSchedules);
    el('clearSchedulesBtn').addEventListener('click', clearScheduleResults);
    el('downloadScheduleErrorsBtn').addEventListener('click', downloadScheduleErrorReport);
    el('mappingInfoBtn').addEventListener('click', openMappingModal);
    el('mappingInfoBtnTop').addEventListener('click', openMappingModal);
    el('uploadHelpBtn').addEventListener('click', openHelpModal);
    el('mappingModalClose').addEventListener('click', closeMappingModal);
    el('helpModalClose').addEventListener('click', closeHelpModal);
    el('mappingModal').addEventListener('click', event => { if (event.target === el('mappingModal')) closeMappingModal(); });
    el('helpModal').addEventListener('click', event => { if (event.target === el('helpModal')) closeHelpModal(); });
    el('mappingCard').addEventListener('toggle', () => {
      const label = el('mappingCard').querySelector('summary span');
      if (label) label.textContent = el('mappingCard').open ? 'Close' : 'Open';
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMappingModal(); closeHelpModal(); } });
    renderMappingGuide();

    function renderMappingGuide() {
      const miniRows = logtenImportMapping.filter(([, target]) => target !== 'Do Not Import');
      el('mappingMiniList').innerHTML = miniRows.map(([source, target, category]) => `<div class="mapping-row"><span class="source">${escapeHtml(source)}</span><span class="arrow">→</span><span class="target ${target === 'Do Not Import' ? 'skip' : ''}">${escapeHtml(target)} <small style="color:var(--muted);font-weight:800;">(${escapeHtml(category)})</small></span></div>`).join('');
      el('mappingFullTable').innerHTML = `<table><thead><tr><th>CSV column</th><th>LogTen field</th><th>Import category</th></tr></thead><tbody>${logtenImportMapping.map(([source, target, category]) => `<tr><td>${escapeHtml(source)}</td><td>${target === 'Do Not Import' ? '<span class="badge skipped">Do Not Import</span>' : escapeHtml(target)}</td><td>${category === 'Do Not Import' ? '<span class="badge skipped">Do Not Import</span>' : escapeHtml(category)}</td></tr>`).join('')}</tbody></table>`;
    }

    function openMappingModal() {
      el('mappingModal').classList.add('open');
      el('mappingModal').setAttribute('aria-hidden', 'false');
    }

    function closeMappingModal() {
      el('mappingModal').classList.remove('open');
      el('mappingModal').setAttribute('aria-hidden', 'true');
    }


    function openHelpModal() {
      el('helpModal').classList.add('open');
      el('helpModal').setAttribute('aria-hidden', 'false');
    }

    function closeHelpModal() {
      el('helpModal').classList.remove('open');
      el('helpModal').setAttribute('aria-hidden', 'true');
    }

    setupDropzone('flightDrop', 'csvFile');
    setupDropzone('peopleDrop', 'peopleFile');

    function setupDropzone(dropId, inputId) {
      const drop = el(dropId);
      const input = el(inputId);
      ['dragenter', 'dragover'].forEach(eventName => {
        drop.addEventListener(eventName, event => {
          event.preventDefault();
          drop.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        drop.addEventListener(eventName, event => {
          event.preventDefault();
          drop.classList.remove('dragover');
        });
      });
      drop.addEventListener('drop', event => {
        const file = event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file) return;
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    function handleFlightFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      el('flightFilePill').textContent = file.name;
      showStatus('Processing flight CSV...', 'info');
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          try {
            flightRows = (results.data || []).filter(row => Object.keys(row).some(k => k && String(row[k] || '').trim() !== '')).map((row, index) => ({ ...row, __rowIndex: index }));
            scheduleResultsByRow = new Map();
            schedulePreviewRows = [];
            scheduleAccessAllowed = false;
            scheduleAccessReason = 'checking';
            recompute();
            refreshScheduleAccess();
          } catch (error) {
            showStatus('Error processing flight CSV: ' + error.message, 'error');
          }
        },
        error: error => showStatus('Error parsing flight CSV: ' + error.message, 'error')
      });
    }

    function handlePeopleFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      el('peopleFilePill').textContent = file.name;
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

    function clean(value) { return String(value ?? '').replace(/\r?\n/g, ' ').trim(); }
    function normalizeKey(key) { return clean(key).replace(/^\uFEFF/, '').replace(/\s+/g, ' ').toLowerCase(); }
    function getField(row, fieldName) {
      const wanted = normalizeKey(fieldName);
      const key = Object.keys(row).find(k => normalizeKey(k) === wanted);
      return key ? row[key] : '';
    }
    function hasField(row, fieldName) { return Object.keys(row).some(k => normalizeKey(k) === normalizeKey(fieldName)); }

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

    function isTruthyFlag(value) {
      const v = clean(value).toLowerCase();
      return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'x';
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

    function recompute() {
      if (!flightRows.length) {
        processedData = null;
        previewRows = [];
        updateMetrics();
        renderReadyCard();
        renderPreviews();
        renderRules(getOptions());
        updateManualSicEditor(getOptions());
        updateScheduleLookupUI(getOptions());
        updateProgress();
        el('downloadBtn').disabled = true;
        el('downloadMissingBtn').disabled = true;
        showStatus('Upload a flight CSV to begin.', 'info');
        return;
      }

      const options = getOptions();
      processedData = processFlightData(flightRows, options);
      previewRows = buildPicPreview(flightRows, options);
      const missingCount = previewRows.filter(r => r.status === 'missing').length;
      const matchedCount = previewRows.filter(r => r.status === 'matched' || r.status === 'manual').length;

      const blocked = options.blockMissingPic && options.replacePicWithName && missingCount > 0;

      updateMetrics();
      renderReadyCard(options, missingCount, matchedCount, blocked);
      renderPreviews();
      renderRules(options);
      updateManualSicEditor(options);
      updateScheduleLookupUI(options);

      el('downloadMissingBtn').disabled = missingCount === 0;
      el('downloadBtn').disabled = blocked || !processedData.length;
      updateProgress();

      if (blocked) {
        showStatus(`Download blocked: ${missingCount} unique PIC ID(s) were not found in the People export.`, 'error');
      } else if (options.setSicToThisIsMe && !getSicName(options)) {
        showStatus('Flight CSV processed. SIC auto-fill is enabled, but no People export row marked This is Me = 1 was found. Type a manual SIC name to use the fallback.', 'warning');
      } else if (options.replacePicWithName && !peopleById.size) {
        showStatus('Flight CSV processed. People matching is enabled, but no People export is loaded, so PIC values are unchanged.', 'warning');
      } else if (options.replacePicWithName && missingCount > 0) {
        showStatus(`Processed ${processedData.length} rows. ${matchedCount} unique PIC ID(s) matched, ${missingCount} missing.`, 'warning');
      } else if (duplicateIds.size > 0) {
        showStatus(`Processed ${processedData.length} rows. Warning: ${duplicateIds.size} duplicate ID(s) found in People export; the first match was used.`, 'warning');
      } else {
        showStatus(`Success. Processed ${processedData.length} rows and ready to download.`, 'success');
      }
    }

    function getOptions() {
      return {
        formatAircraftReg: el('formatAircraftReg').checked,
        replaceAircraftType: el('replaceAircraftType').checked,
        replacePicWithName: el('replacePicWithName').checked,
        setSicToThisIsMe: el('setSicToThisIsMe').checked,
        keepPicId: el('keepPicId').checked,
        useManualPicNames: el('useManualPicNames').checked,
        blockMissingPic: el('blockMissingPic').checked,
        enableScheduleLookup: el('enableScheduleLookup').checked
      };
    }

    function processFlightData(data, options) {
      return data.map(row => {
        const newRow = {};
        let sawSic = false;
        for (let key in row) {
          if (!key || !key.trim() || key === '__rowIndex') continue;
          const value = row[key];

          if (key === 'Flight' && value) {
            const parts = String(value).split('-');
            if (parts.length >= 4) {
              newRow['Flight'] = parts[0];
              newRow['Departure-Place'] = parts[2];
              newRow['Destination-Place'] = parts[3];
            } else {
              newRow['Flight'] = value;
              newRow['Departure-Place'] = '';
              newRow['Destination-Place'] = '';
            }
          } else if (key === 'PIC') {
            const picId = clean(value);
            if (options.keepPicId) newRow['PIC ID'] = picId;
            const picName = getPicNameForId(picId, options);
            if (options.replacePicWithName && picName) {
              newRow['PIC'] = picName;
            } else {
              newRow['PIC'] = value;
            }
          } else if (key === 'SIC') {
            sawSic = true;
            const sicName = getSicName(options);
            newRow['SIC'] = sicName ? sicName : value;
          } else if (key === 'Aircraft Registration' && options.formatAircraftReg && value) {
            const reg = clean(value);
            newRow[key] = reg.length >= 3 && !reg.includes('-') ? reg.substring(0, 2) + '-' + reg.substring(2) : reg;
          } else if (key === 'Aircraft Type' && options.replaceAircraftType && value) {
            const type = clean(value);
            newRow[key] = type === 'E95' ? 'E190' : type;
          } else {
            newRow[key] = value;
          }
        }
        const sicName = getSicName(options);
        if (!sawSic && sicName) newRow['SIC'] = sicName;
        const schedule = scheduleResultsByRow.get(row.__rowIndex);
        newRow['Scheduled Dep'] = schedule && schedule.scheduled_dep ? schedule.scheduled_dep : '';
        newRow['Scheduled Arr'] = schedule && schedule.scheduled_arr ? schedule.scheduled_arr : '';
        newRow['Scheduled Time Note'] = getScheduleIssueForRow(row.__rowIndex);
        return newRow;
      });
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

    function renderReadyCard(options = getOptions(), missingCount = 0, matchedCount = 0, blocked = false) {
      const card = el('readyCard');
      const list = el('readyList');
      if (!card || !list) return;
      const items = [];
      let state = 'warning';

      if (!flightRows.length) {
        items.push(['○', 'Upload a Flight CSV to begin.']);
      } else {
        items.push(['✓', `${flightRows.length} flights converted.`]);
        if (options.replacePicWithName) {
          if (!peopleById.size && manualPeopleById.size === 0) {
            items.push(['⚠', 'PIC name matching is enabled, but no People export or manual PIC fixes are loaded.']);
          } else if (missingCount > 0) {
            items.push(['⚠', `${missingCount} unique PIC ID(s) still need a name.`]);
          } else {
            items.push(['✓', `${matchedCount} unique PIC ID(s) matched.`]);
          }
        } else {
          items.push(['○', 'PIC ID to name matching is disabled.']);
        }

        const sicName = getSicName(options);
        if (options.setSicToThisIsMe) {
          items.push(sicName ? ['✓', `SIC will be set to ${sicName}.`] : ['⚠', 'SIC auto-fill is enabled, but no This is Me/manual SIC name is set.']);
        } else {
          items.push(['○', 'SIC auto-fill is disabled.']);
        }

        if (options.formatAircraftReg) items.push(['✓', 'Aircraft registrations will be formatted for LogTen.']);
        if (options.replaceAircraftType) items.push(['✓', 'Aircraft type E95 will be converted to E190.']);
        if (options.keepPicId) items.push(['✓', 'Original PIC numbers will be preserved in PIC ID and should be set to Do Not Import.']);
        if (blocked) items.push(['✕', 'Download is blocked until missing PIC IDs are fixed or the blocker is switched off.']);

        state = blocked ? 'error' : (missingCount > 0 || (options.setSicToThisIsMe && !sicName) || (options.replacePicWithName && !peopleById.size && manualPeopleById.size === 0) ? 'warning' : 'success');
      }

      card.className = 'ready-card ' + state;
      list.innerHTML = items.map(([icon, text]) => `<div class="ready-item"><span class="ready-icon">${escapeHtml(icon)}</span><span>${escapeHtml(text)}</span></div>`).join('');
    }

    function updateMetrics() {
      const matched = previewRows.filter(r => r.status === 'matched' || r.status === 'manual').length;
      const manual = previewRows.filter(r => r.status === 'manual').length;
      const missing = previewRows.filter(r => r.status === 'missing').length;
      el('metricFlights').textContent = flightRows.length;
      el('metricPeople').textContent = peopleById.size;
      const options = getOptions();
      const sicName = getSicName(options);
      el('metricThisIsMe').textContent = sicName ? sicName : '-';
      el('metricMatched').textContent = matched;
      el('metricMissing').textContent = missing;
      el('metricManual').textContent = manual;
      el('metricSchedules').textContent = scheduleResultsByRow.size;
    }

    function updateProgress() {
      const options = getOptions();
      let pct = 0;
      if (flightRows.length) pct += 45;
      if (peopleById.size || manualThisIsMeName || (!options.replacePicWithName && !options.setSicToThisIsMe)) pct += 25;
      if (processedData && processedData.length) pct += 20;
      if (processedData && processedData.length && !el('downloadBtn').disabled) pct += 10;
      el('progressFill').style.width = pct + '%';
      el('progressText').textContent = pct === 100 ? 'Ready to download' : pct ? 'Processing complete with checks' : 'Waiting for files';
      setStage('stageFlight', flightRows.length ? 'done' : 'active');
      setStage('stagePeople', (peopleById.size || manualThisIsMeName) ? 'done' : (options.replacePicWithName || options.setSicToThisIsMe ? 'active' : 'done'));
      setStage('stageRules', processedData ? 'done' : '');
      setStage('stageReady', processedData && !el('downloadBtn').disabled ? 'done' : '');
    }

    function setStage(id, state) {
      el(id).className = 'stage' + (state ? ' ' + state : '');
    }

    function renderRules(options) {
      const rules = [];
      rules.push('Split Flight into Flight, Departure-Place, and Destination-Place');
      if (options.formatAircraftReg) rules.push('Format aircraft registration, e.g. SERSX to SE-RSX');
      if (options.replaceAircraftType) rules.push('Replace E95 with E190');
      if (options.replacePicWithName) rules.push('Replace PIC employee ID with LogTen People full name');
      if (options.setSicToThisIsMe) {
        const sicName = getSicName(options);
        rules.push(sicName ? `Set SIC to ${thisIsMeName ? 'This is Me' : 'manual fallback'}: ${sicName}` : 'Set SIC to This is Me, pending valid People export or manual fallback');
      }
      if (options.keepPicId) rules.push('Preserve original PIC number in PIC ID');
      if (options.useManualPicNames) rules.push('Apply manually entered PIC names for IDs missing from People export');
      if (options.blockMissingPic) rules.push('Block CSV download when unknown PIC IDs exist');
      if (options.enableScheduleLookup) rules.push('Add Scheduled Dep and Scheduled Arr from AirLabs via Wasmer backend');
      el('rulesList').innerHTML = rules.map(rule => `<div class="rule"><b>✓</b><span>${escapeHtml(rule)}</span></div>`).join('');
    }

    function updateManualSicEditor(options) {
      const editor = el('manualSicEditor');
      const shouldShow = options.setSicToThisIsMe && !thisIsMeName;
      editor.classList.toggle('visible', shouldShow);
      el('manualSicName').value = manualThisIsMeName;
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

    function renderPreviews() {
      renderFlightPreview();
      renderPicPreview();
      renderSchedulePreview();
    }

    function renderFlightPreview() {
      const wrap = el('flightPreviewWrap');
      if (!processedData || !processedData.length) {
        wrap.innerHTML = '<div class="empty">No converted rows yet.</div>';
        return;
      }
      const rows = processedData.slice(0, 10);
      const preferred = ['Flight', 'Departure-Place', 'Destination-Place', 'Scheduled Dep', 'Scheduled Arr', 'Scheduled Time Note', 'Aircraft Registration', 'Aircraft Type', 'PIC ID', 'PIC', 'SIC'];
      const allKeys = Array.from(new Set(rows.flatMap(row => Object.keys(row).filter(Boolean))));
      const keys = preferred.filter(k => allKeys.includes(k));
      for (const k of allKeys) if (!keys.includes(k) && keys.length < 12) keys.push(k);
      wrap.innerHTML = `<table><thead><tr>${keys.map(k => `<th>${escapeHtml(k)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${keys.map(k => {
        const value = clean(row[k]);
        const cls = k === 'Scheduled Time Note' ? ` class="note-cell ${value ? 'has-note' : ''}"` : '';
        return `<td${cls}>${escapeHtml(value)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
    }

    function renderPicPreview() {
      const wrap = el('picPreviewWrap');
      if (!previewRows.length) {
        wrap.innerHTML = '<div class="empty">No PIC values to preview yet.</div>';
        return;
      }

      const options = getOptions();
      const missingOrManual = previewRows.filter(row => row.status === 'missing' || row.status === 'manual');
      const actions = missingOrManual.length
        ? `<div class="inline-actions"><button type="button" class="secondary" id="applyManualBtn">Apply manual fixes</button><button type="button" class="ghost" id="clearManualBtn">Clear manual fixes</button></div>`
        : '';

      wrap.innerHTML = `${actions}<table><thead><tr><th>PIC ID</th><th>Matched / manual name</th><th>Rows</th><th>Status</th></tr></thead><tbody>${previewRows.map(row => {
        const badgeClass = row.status === 'matched' || row.status === 'manual' ? 'ok' : row.status === 'missing' ? 'missing' : 'skipped';
        const nameCell = (row.status === 'missing' || row.status === 'manual')
          ? `<input class="manual-name-input" data-pic-id="${escapeHtml(row.id)}" value="${escapeHtml(manualPeopleById.get(row.id) || '')}" placeholder="Type full name for ${escapeHtml(row.id)}" ${options.useManualPicNames ? '' : 'disabled'}>`
          : escapeHtml(row.name);
        return `<tr><td>${escapeHtml(row.id)}</td><td>${nameCell}</td><td>${row.count}</td><td><span class="badge ${badgeClass}">${row.status}</span></td></tr>`;
      }).join('')}</tbody></table>`;

      const applyBtn = el('applyManualBtn');
      if (applyBtn) applyBtn.addEventListener('click', applyManualFixInputs);
      const clearBtn = el('clearManualBtn');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        manualPeopleById = new Map();
        recompute();
        setTab('pic');
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

    function setTab(tab) {
      activeTab = tab;
      el('tabFlights').classList.toggle('active', tab === 'flights');
      el('tabPic').classList.toggle('active', tab === 'pic');
      el('tabSchedules').classList.toggle('active', tab === 'schedules');
      el('flightPreviewWrap').style.display = tab === 'flights' ? 'block' : 'none';
      el('picPreviewWrap').style.display = tab === 'pic' ? 'block' : 'none';
      el('schedulePreviewWrap').style.display = tab === 'schedules' ? 'block' : 'none';
    }


    function normalizeFlightIata(value) {
      const raw = clean(value).toUpperCase().replace(/\s+/g, '');
      const match = raw.match(/^([A-Z]{2,3})0*(\d+[A-Z]?)$/);
      return match ? match[1] + match[2] : raw;
    }

    function getEmployeeIdsFromFlightRows() {
      const ids = new Set();
      for (const row of flightRows) {
        const id = clean(getField(row, 'Employee id') || getField(row, 'Employee ID')).replace(/\D+/g, '');
        if (id) ids.add(id);
      }
      return Array.from(ids);
    }

    function isSasFlight(flightIata) {
      return /^SK\d+[A-Z]?$/.test(clean(flightIata).toUpperCase());
    }

    async function refreshScheduleAccess() {
      if (!flightRows.length) {
        scheduleAccessAllowed = false;
        scheduleAccessReason = 'no_flights';
        updateScheduleLookupUI(getOptions());
        return;
      }
      const employeeIds = getEmployeeIdsFromFlightRows();
      if (!employeeIds.length) {
        scheduleAccessAllowed = false;
        scheduleAccessReason = 'no_employee_id';
        updateScheduleLookupUI(getOptions());
        return;
      }
      try {
        const response = await fetch('/api/schedule-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_ids: employeeIds })
        });
        const payload = await response.json();
        scheduleAccessAllowed = !!(response.ok && payload.ok && payload.allowed);
        scheduleAccessReason = payload.reason || (scheduleAccessAllowed ? 'enabled' : 'not_allowed');
        if (payload.monthly_usage) {
          el('scheduleMonthText').textContent = `Monthly usage: ${payload.monthly_usage.calls_made}/${payload.monthly_usage.monthly_limit}`;
        }
      } catch (error) {
        scheduleAccessAllowed = false;
        scheduleAccessReason = 'backend_unavailable';
      }
      if (!scheduleAccessAllowed) {
        el('enableScheduleLookup').checked = false;
        clearScheduleResults(false);
      }
      updateScheduleLookupUI(getOptions());
      recompute();
    }

    function formatFlightDate(value) {
      const raw = clean(value);
      if (/^\d{8}$/.test(raw)) return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      return '';
    }

    function getFlightLookupInfo(row) {
      const flightField = clean(getField(row, 'Flight'));
      const parts = flightField.split('-');
      const flight = parts.length >= 1 ? normalizeFlightIata(parts[0]) : '';
      const date = parts.length >= 2 ? formatFlightDate(parts[1]) : formatFlightDate(getField(row, 'Departure Date') || getField(row, 'Date'));
      const dep = parts.length >= 3 ? clean(parts[2]).toUpperCase() : clean(getField(row, 'Departure-Place') || getField(row, 'From')).toUpperCase();
      const arr = parts.length >= 4 ? clean(parts[3]).toUpperCase() : clean(getField(row, 'Destination-Place') || getField(row, 'To')).toUpperCase();
      const employeeId = clean(getField(row, 'Employee id') || getField(row, 'Employee ID')).replace(/\D+/g, '');
      const actualDep = clean(getField(row, 'Block off') || getField(row, 'Out') || getField(row, 'Actual Dep'));
      const actualArr = clean(getField(row, 'Block on') || getField(row, 'In') || getField(row, 'Actual Arr'));
      return { rowIndex: row.__rowIndex, flight_iata: flight, flight_date: date, dep_iata: dep, arr_iata: arr, employee_id: employeeId, actual_dep: actualDep, actual_arr: actualArr };
    }

    function getScheduleGroups() {
      const groups = new Map();
      for (const row of flightRows) {
        const info = getFlightLookupInfo(row);
        if (!info.flight_iata || !info.flight_date) continue;
        if (!isSasFlight(info.flight_iata)) continue;
        if (!groups.has(info.flight_iata)) groups.set(info.flight_iata, []);
        groups.get(info.flight_iata).push(info);
      }
      return Array.from(groups.entries()).map(([flight_iata, flights]) => ({ flight_iata, flights }));
    }

    function updateScheduleLookupUI(options) {
      const option = el('scheduleOptionLabel');
      const box = el('scheduleLookupBox');
      option.classList.toggle('hidden', !scheduleAccessAllowed);
      if (!scheduleAccessAllowed && options.enableScheduleLookup) {
        el('enableScheduleLookup').checked = false;
        options = getOptions();
      }
      box.classList.toggle('visible', flightRows.length > 0 || scheduleAccessAllowed || options.enableScheduleLookup);
      el('scanSchedulesBtn').disabled = !scheduleAccessAllowed || !options.enableScheduleLookup || !flightRows.length;
      el('clearSchedulesBtn').disabled = scheduleResultsByRow.size === 0 && schedulePreviewRows.length === 0;
      el('downloadScheduleErrorsBtn').disabled = getScheduleErrorRows().length === 0;
      if (!scheduleAccessAllowed) {
        el('scheduleProgressText').textContent = !flightRows.length
          ? 'Upload a Flight CSV to check schedule access'
          : scheduleAccessReason === 'no_employee_id'
            ? 'Scheduled lookup unavailable: no Employee ID found in Flight CSV'
            : scheduleAccessReason === 'backend_unavailable'
              ? 'Scheduled lookup unavailable: backend/admin settings could not be reached'
              : 'Scheduled lookup unavailable for this Employee ID';
        return;
      }
      if (options.enableScheduleLookup && flightRows.length && !schedulePreviewRows.length) {
        const groups = getScheduleGroups();
        el('scheduleProgressText').textContent = groups.length
          ? `Ready: ${groups.length} SAS SK flight-number group(s) to check`
          : 'No SAS SK flight numbers found. Scheduled lookup only supports SK flights.';
      }
    }

    function getScheduleErrorRows() {
      return schedulePreviewRows.filter(row => !(row.status === 'found' || row.status === 'cached'));
    }

    function getScheduleIssueForRow(rowIndex) {
      const row = schedulePreviewRows.find(item => Number(item.rowIndex) === Number(rowIndex));
      if (!row || row.status === 'found' || row.status === 'cached') return '';
      return row.message || (row.status === 'missing' ? 'No matching scheduled dep_time/arr_time found' : row.status || 'Schedule lookup failed');
    }

    function downloadScheduleErrorReport() {
      const errors = getScheduleErrorRows().map(row => ({
        Row: Number(row.rowIndex ?? 0) + 1,
        Flight: row.flight_iata || '',
        Date: row.flight_date || '',
        Route: `${row.dep_iata || ''}-${row.arr_iata || ''}`,
        Status: row.status || '',
        Source: row.source || '',
        Reason: row.message || (row.status === 'missing' ? 'No matching scheduled dep_time/arr_time found' : 'Schedule lookup failed')
      }));
      if (!errors.length) return;
      downloadCsv(errors, `schedule_error_report_${new Date().toISOString().slice(0,10)}.csv`);
    }

    async function scanSchedules() {
      const options = getOptions();
      if (!scheduleAccessAllowed) {
        showStatus('Scheduled-time lookup is not enabled for this Employee ID.', 'warning');
        return;
      }
      if (!options.enableScheduleLookup) {
        showStatus('Enable scheduled-time lookup first.', 'warning');
        return;
      }
      if (!flightRows.length) {
        showStatus('Upload a Flight CSV first.', 'warning');
        return;
      }

      const groups = getScheduleGroups();
      if (!groups.length) {
        showStatus('No valid SAS SK flight/date values were found. Scheduled-time lookup only supports SK flight numbers.', 'warning');
        return;
      }

      scheduleResultsByRow = new Map();
      schedulePreviewRows = [];
      el('scanSchedulesBtn').disabled = true;
      el('scheduleProgressFill').style.width = '0%';
      el('scheduleUsageText').textContent = 'API units this run: 0';
      let callsThisRun = 0;

      try {
        for (let i = 0; i < groups.length; i++) {
          const group = groups[i];
          el('scheduleProgressText').textContent = `Checking ${group.flight_iata} (${i + 1}/${groups.length})`;
          el('scheduleProgressFill').style.width = `${Math.round((i / groups.length) * 100)}%`;

          const response = await fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_ids: getEmployeeIdsFromFlightRows(), flights: group.flights })
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error || `Schedule lookup failed for ${group.flight_iata}`);

          callsThisRun += Number(payload.calls_made || 0);
          const httpRequests = Number(payload.http_requests_made || 0);
          const cost = Number(payload.historical_call_cost || 1);
          el('scheduleUsageText').textContent = cost > 1
            ? `API units this run: ${callsThisRun} (${httpRequests} HTTP x ${cost})`
            : `API units this run: ${callsThisRun}`;
          if (payload.monthly_usage) {
            el('scheduleMonthText').textContent = `Monthly usage: ${payload.monthly_usage.calls_made}/${payload.monthly_usage.monthly_limit}`;
          }

          for (const result of payload.results || []) {
            schedulePreviewRows.push(result);
            if (result.status === 'found' || result.status === 'cached') {
              scheduleResultsByRow.set(result.rowIndex, result);
            }
          }

          processedData = processFlightData(flightRows, getOptions());
          renderPreviews();
          updateMetrics();
          el('downloadScheduleErrorsBtn').disabled = getScheduleErrorRows().length === 0;
          await new Promise(resolve => setTimeout(resolve, 80));
        }

        el('scheduleProgressFill').style.width = '100%';
        el('scheduleProgressText').textContent = `Done: ${scheduleResultsByRow.size}/${flightRows.length} row(s) with scheduled times`;
        el('downloadScheduleErrorsBtn').disabled = getScheduleErrorRows().length === 0;
        showStatus(`Scheduled-time scan complete. ${scheduleResultsByRow.size}/${flightRows.length} rows matched.`, scheduleResultsByRow.size === flightRows.length ? 'success' : 'warning');
      } catch (error) {
        showStatus('Schedule lookup error: ' + error.message, 'error');
      } finally {
        updateScheduleLookupUI(getOptions());
        recompute();
      }
    }

    function clearScheduleResults(refresh = true) {
      scheduleResultsByRow = new Map();
      schedulePreviewRows = [];
      processedData = processFlightData(flightRows, getOptions());
      el('scheduleProgressFill').style.width = '0%';
      el('scheduleProgressText').textContent = 'No schedule scan yet';
      el('scheduleUsageText').textContent = 'API units this run: 0';
      el('downloadScheduleErrorsBtn').disabled = true;
      renderPreviews();
      updateMetrics();
      if (refresh) updateScheduleLookupUI(getOptions());
    }

    function renderSchedulePreview() {
      const wrap = el('schedulePreviewWrap');
      if (!schedulePreviewRows.length) {
        wrap.innerHTML = '<div class="empty">No schedule scan yet.</div>';
        return;
      }
      wrap.innerHTML = `<table><thead><tr><th>Row</th><th>Flight</th><th>Date</th><th>Route</th><th>Scheduled Dep</th><th>Scheduled Arr</th><th>Status</th><th>Source</th><th>Reason</th></tr></thead><tbody>${schedulePreviewRows.map(row => {
        const badgeClass = row.status === 'found' || row.status === 'cached' ? 'ok' : row.status === 'missing' ? 'missing' : 'warning';
        const reason = (row.status === 'found' || row.status === 'cached') ? '' : (row.message || (row.status === 'missing' ? 'No matching scheduled dep_time/arr_time found' : 'Schedule lookup failed'));
        return `<tr><td>${escapeHtml((row.rowIndex ?? 0) + 1)}</td><td>${escapeHtml(row.flight_iata || '')}</td><td>${escapeHtml(row.flight_date || '')}</td><td>${escapeHtml((row.dep_iata || '') + '-' + (row.arr_iata || ''))}</td><td>${escapeHtml(row.scheduled_dep || '')}</td><td>${escapeHtml(row.scheduled_arr || '')}</td><td><span class="badge ${badgeClass}">${escapeHtml(row.status || '')}</span></td><td>${escapeHtml(row.source || '')}</td><td>${escapeHtml(reason)}</td></tr>`;
      }).join('')}</tbody></table>`;
    }

    function downloadProcessedCsv() {
      if (!processedData || !processedData.length) return;
      downloadCsv(processedData, `airside_to_logten_${new Date().toISOString().slice(0,10)}.csv`);
      showStatus('LogTen CSV downloaded successfully.', 'success');
    }

    function downloadUnknownPicCsv() {
      const missing = previewRows.filter(r => r.status === 'missing').map(r => ({ 'PIC ID': r.id, 'Rows': r.count, 'Suggested action': 'Type the missing name in the PIC matching tab, add this person to LogTen People export, or correct the flight CSV PIC value' }));
      if (!missing.length) return;
      downloadCsv(missing, 'unknown_pic_ids.csv');
    }

    function downloadCsv(rows, filename) {
      const csv = Papa.unparse(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function resetAll() {
      flightRows = [];
      peopleRows = [];
      peopleById = new Map();
      manualPeopleById = new Map();
      duplicateIds = new Map();
      thisIsMeName = '';
      thisIsMeId = '';
      manualThisIsMeName = '';
      processedData = null;
      previewRows = [];
      scheduleResultsByRow = new Map();
      schedulePreviewRows = [];
      scheduleAccessAllowed = false;
      scheduleAccessReason = 'not_checked';
      el('enableScheduleLookup').checked = false;
      el('csvFile').value = '';
      el('peopleFile').value = '';
      el('flightFilePill').textContent = 'No flight CSV loaded';
      el('peopleFilePill').textContent = 'No People export loaded';
      recompute();
    }

    function showStatus(message, type) {
      const status = el('status');
      status.textContent = message;
      status.className = 'status ' + type;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }
  