// Airside LogTen Importer v1.4.5 - ui.js

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

    function setTab(tab) {
      activeTab = tab;
      el('tabFlights').classList.toggle('active', tab === 'flights');
      el('tabPic').classList.toggle('active', tab === 'pic');
      el('tabSchedules').classList.toggle('active', tab === 'schedules');
      el('flightPreviewWrap').style.display = tab === 'flights' ? 'block' : 'none';
      el('picPreviewWrap').style.display = tab === 'pic' ? 'block' : 'none';
      el('schedulePreviewWrap').style.display = tab === 'schedules' ? 'block' : 'none';
    }

