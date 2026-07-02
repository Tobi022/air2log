// Airside LogTen Importer v1.4.3 - csv.js

    function handleFlightFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      el('flightFilePill').textContent = file.name;
      el('flightDrop').classList.add('loaded');
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
      el('flightDrop').classList.remove('loaded');
      el('peopleDrop').classList.remove('loaded');
      recompute();
    }

