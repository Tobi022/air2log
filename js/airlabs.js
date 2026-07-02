// Airside LogTen Importer v1.4.4 - airlabs.js

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
      const group = el('scheduleGroup');
      const box = el('scheduleLookupBox');
      if (!scheduleAccessAllowed && options.enableScheduleLookup) {
        el('enableScheduleLookup').checked = false;
        options = getOptions();
      }

      // Keep the AirLabs section completely hidden until a Flight CSV has been
      // uploaded and the backend confirms that one of its Employee IDs is allowed.
      group.classList.toggle('hidden', !scheduleAccessAllowed);
      box.classList.toggle('visible', scheduleAccessAllowed && options.enableScheduleLookup);

      el('scanSchedulesBtn').disabled = !scheduleAccessAllowed || !options.enableScheduleLookup || !flightRows.length;
      el('clearSchedulesBtn').disabled = scheduleResultsByRow.size === 0 && schedulePreviewRows.length === 0;
      el('downloadScheduleErrorsBtn').disabled = getScheduleErrorRows().length === 0;
      if (!scheduleAccessAllowed) {
        el('scheduleProgressText').textContent = 'Scheduled lookup hidden until an approved Employee ID is found in the Flight CSV.';
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

