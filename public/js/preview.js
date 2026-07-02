// Airside LogTen Importer v1.4.3 - preview.js

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
      for (const k of allKeys) if (!keys.includes(k)) keys.push(k);
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

