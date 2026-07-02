// Airside LogTen Importer v1.4.3 - app bootstrap and global state


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
