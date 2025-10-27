import {
  fetchDropboxToken,
  uploadFileToDropbox
} from './dropbox.js';

/* =========================
   DEBUG CONFIG
   ========================= */
const DEBUG = true;
// IMPORTANT: show the CSV's exact date; do not add +1
const DEBUG_ADD_ONE_DAY = false;

function dbg(...args) {
  if (DEBUG) console.log('[PO DEBUG]', ...args);
}
function dbgWarn(...args) {
  if (DEBUG) console.warn('[PO DEBUG]', ...args);
}
function dbgErr(...args) {
  if (DEBUG) console.error('[PO DEBUG]', ...args);
}

document.addEventListener("DOMContentLoaded", function () {
  console.groupCollapsed('%cPO Debug Session', 'font-weight:bold');
  dbg('Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
  dbg('Now (local):', new Date().toString());

  const dropZone     = document.getElementById("dropZone");
  const fileInput    = document.getElementById("fileInput");
  const errorMessage = document.getElementById("errorMessage");
  const csvTable     = document.getElementById("csvTable");
  const tableHead    = csvTable.querySelector("thead");
  const tableBody    = csvTable.querySelector("tbody");
  const csvDateEl    = document.getElementById("csvDate");

  // Show header only when we have data
  tableHead.style.display = "none";

  // Airtable config (used by this page to load an existing CSV)
  const airtableApiKey = 'patTGK9HVgF4n1zqK.cbc0a103ecf709818f4cd9a37e18ff5f68c7c17f893085497663b12f2c600054';
  const baseId = 'appD3QeLneqfNdX12';
  const tableId = 'tblvqHdBUZ6EQpcNM';

  // ===== Helpers for date handling =====
  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
  function formatLocalDate(date) {
    try {
      return date?.toLocaleDateString() ?? '—';
    } catch {
      return '—';
    }
  }
  function setCsvDateUI({ displayedDate, parsedDate, rawMatch, source }) {
    // UI text
    csvDateEl.textContent = displayedDate ? formatLocalDate(displayedDate) : '—';
    // Helpful hover info
    const iso = parsedDate ? parsedDate.toISOString().slice(0, 10) : 'n/a';
    csvDateEl.title =
      `Source: ${source || 'n/a'}\nRaw match: ${rawMatch || 'n/a'}\nParsed (ISO): ${iso}\nDisplayed (local): ${csvDateEl.textContent}\n(+1 applied: ${DEBUG_ADD_ONE_DAY})`;
  }

  /* =========================
     1) TRY TO LOAD CSV FROM AIRTABLE
     ========================= */
  console.groupCollapsed('%cStep 1: Load CSV from Airtable', 'color:#0a7');
  dbg('Fetching Airtable list:', { baseId, tableId });

  console.time('airtableFetch');
  fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    headers: { Authorization: `Bearer ${airtableApiKey}` }
  })
  .then(res => {
    dbg('Airtable HTTP status:', res.status);
    return res.json();
  })
  .then(data => {
    console.timeEnd('airtableFetch');
    if (!data || !Array.isArray(data.records)) {
      throw new Error('Unexpected Airtable payload');
    }
    dbg('Airtable records:', data.records.length);

    const record = data.records.find(r =>
      r.fields['CSV file']?.trim() === 'OpenPOReportbyVendorSalesmanDateCreated.csv'
    );
    if (!record) throw new Error("Matching record not found in Airtable.");

    dbg('Matched record id:', record.id);
    const attachment = record.fields['Attachments']?.[0];
    if (!attachment?.url) throw new Error("No attachment found for matching record.");

    dbg('Attachment URL:', attachment.url);
    console.time('downloadCSV');
    return fetch(attachment.url);
  })
  .then(res => res.text())
  .then(csvData => {
    console.timeEnd('downloadCSV');
    dbg('CSV bytes length:', csvData.length);
    const headerPeek = csvData.split('\n').slice(0, 12);
    dbg('Header peek (first 12 lines):\n' + headerPeek.map((l,i)=>`${String(i+1).padStart(2,'0')}: ${l}`).join('\n'));

    errorMessage.style.display = 'none';

    // SCRAPE date
    console.groupCollapsed('%cDate Scrape (Airtable CSV)', 'color:#07a;');
    const dateResult = extractReportDateVerbose(csvData);
    const parsedDate = dateResult?.date || null;

    // +1 day toggle
    const displayed = parsedDate
      ? (DEBUG_ADD_ONE_DAY ? addDays(parsedDate, 1) : parsedDate)
      : null;

    dbg('Final Date Decision:', {
      source: dateResult?.source,
      rawMatch: dateResult?.raw,
      parsedDate: parsedDate?.toString() || null,
      displayedDate: displayed?.toString() || null,
      addOneDay: DEBUG_ADD_ONE_DAY
    });

    setCsvDateUI({
      displayedDate: displayed,
      parsedDate,
      rawMatch: dateResult?.raw,
      source: dateResult?.source
    });
    console.groupEnd();

    parseCSV(csvData);
  })
  .catch(error => {
    dbgWarn('Airtable CSV not loaded:', error.message);
    errorMessage.textContent = "Could not load CSV from Airtable.";
    errorMessage.style.display = 'block';
  })
  .finally(() => {
    console.groupEnd(); // Step 1
  });

  /* =========================
     2) DRAG & DROP + FILE INPUT
     ========================= */
  ['dragenter', 'dragover'].forEach(evt =>
    dropZone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    })
  );

  ['dragleave', 'drop'].forEach(evt =>
    dropZone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    })
  );

  dropZone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (files.length) processFile(files[0]);
  });

  fileInput.addEventListener('change', e => {
    if (e.target.files.length) processFile(e.target.files[0]);
  });

  async function processFile(file) {
    console.groupCollapsed('%cStep 2: Local CSV Upload', 'color:#0a7;');
    dbg('Selected file:', { name: file.name, size: file.size });
    if (!file.name.endsWith('.csv')) {
      errorMessage.textContent = `Invalid file selected. Please upload a CSV file.`;
      errorMessage.style.display = 'block';
      console.groupEnd();
      return;
    }

    errorMessage.style.display = 'none';

    const { token: dropboxToken, appKey, appSecret, refreshToken } = await fetchDropboxToken().catch(err=>{
      dbgWarn('Dropbox token fetch failed:', err);
      return {};
    });

    const reader = new FileReader();
    reader.onload = async function (e) {
      const csvText = e.target.result;
      dbg('Local CSV bytes length:', csvText.length);
      const headerPeek = csvText.split('\n').slice(0, 12);
      dbg('Header peek (first 12 lines):\n' + headerPeek.map((l,i)=>`${String(i+1).padStart(2,'0')}: ${l}`).join('\n'));

      // SCRAPE date
      console.groupCollapsed('%cDate Scrape (Local CSV)', 'color:#07a;');
      const dateResult = extractReportDateVerbose(csvText);
      const parsedDate = dateResult?.date || null;

      const displayed = parsedDate
        ? (DEBUG_ADD_ONE_DAY ? addDays(parsedDate, 1) : parsedDate)
        : null;

      dbg('Final Date Decision (Local):', {
        source: dateResult?.source,
        rawMatch: dateResult?.raw,
        parsedDate: parsedDate?.toString() || null,
        displayedDate: displayed?.toString() || null,
        addOneDay: DEBUG_ADD_ONE_DAY
      });

      setCsvDateUI({
        displayedDate: displayed,
        parsedDate,
        rawMatch: dateResult?.raw,
        source: dateResult?.source
      });
      console.groupEnd();

      // Parse table
      parseCSV(csvText);

      // Upload to Airtable (via Dropbox share link)
      if (dropboxToken) {
        try {
          const creds = { appKey, appSecret, refreshToken };
          const sharedUrl = await uploadFileToDropbox(file, dropboxToken, creds);
          if (sharedUrl) {
            dbg('✅ Dropbox Upload Complete:', sharedUrl);
            await uploadNewCSVToAirtable(file, baseId, tableId, airtableApiKey, sharedUrl);
          } else {
            dbgWarn('Dropbox upload returned no shared URL.');
          }
        } catch (err) {
          dbgErr('Dropbox upload error:', err);
        }
      } else {
        dbgWarn('⚠️ Dropbox token not available. Skipping Dropbox upload.');
      }

      console.groupEnd(); // Local CSV Upload
    };
    reader.readAsText(file);
  }

  function formatName(name) {
    return name.replace(/\./g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  function parseCSV(csvData) {
    console.groupCollapsed('%cStep 3: Parse CSV for Table', 'color:#0a7;');
    const lines = csvData.split('\n').slice(10); // skip headers
    dbg('Data line count (after skipping 10):', lines.length);

    const counts = {};
    let totalOccurrences = 0;

    lines.forEach((line, idx) => {
      const columns = line.split(',');
      let counterPerson = columns[9]?.trim().replace(/['"]+/g, '');
      if (counterPerson) {
        counterPerson = formatName(counterPerson);
        counts[counterPerson] = (counts[counterPerson] || 0) + 1;
        totalOccurrences++;
      }
    });

    dbg('Total occurrences:', totalOccurrences);
    dbg('Unique users:', Object.keys(counts).length);
    try {
      console.table(Object.entries(counts).map(([k,v])=>({User:k, Occurrences:v})));
    } catch {}

    populateTable(counts, totalOccurrences);
    console.groupEnd();
  }

  function populateTable(counts, totalOccurrences) {
    const uniqueUsers = Object.keys(counts).length || 1;
    const average = totalOccurrences / uniqueUsers;

    dbg('Average occurrences per user:', average);
    tableHead.style.display = average > 0 ? "" : "none";
    tableBody.innerHTML = "";

    Object.entries(counts)
      .map(([key, value]) => ({
        key,
        value,
        percentage: ((value / average) * 100).toFixed(2)
      }))
      .sort((a, b) => b.percentage - a.percentage || a.key.localeCompare(b.key))
      .forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${item.key}</td><td>${item.value}</td><td>${item.percentage}%</td>`;
        tableBody.appendChild(row);
      });
  }

  /* =========================
     DATE SCRAPING (VERBOSE)
     ========================= */
  // Returns { date, raw, source } or null
  function extractReportDateVerbose(csvText) {
    // 1) Look in header (first 10 lines). Prefer the **latest** date seen there.
    const headerLines = csvText.split('\n').slice(0, 10);
    const headerJoined = headerLines.join(' ');
    const headerDates = findAllDatesInString(headerJoined);
    if (headerDates.length) {
      // choose the max date from header (e.g., "10-27-2025" beats the "From/To" September dates)
      const latestHeader = headerDates.reduce((a, b) => (b.date > a.date ? b : a));
      dbg('Header dates found:', headerDates.map(d=>({raw:d.raw, iso:d.date.toISOString().slice(0,10)})));
      dbg('Using latest header date:', { raw: latestHeader.raw, iso: latestHeader.date.toISOString().slice(0,10) });
      return { date: latestHeader.date, raw: latestHeader.raw, source: 'header(0-10):latest' };
    }

    // 2) Otherwise, scan rows and keep latest parsable date (common for “Date Created” column).
    const lines = csvText.split('\n').slice(10);
    let latest = null;
    let latestRaw = null;
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(',');
      for (const c of cols) {
        const matches = findAllDatesInString(c);
        for (const m of matches) {
          if (!latest || m.date > latest) {
            latest = m.date;
            latestRaw = m.raw;
          }
        }
      }
    }
    if (latest) {
      dbg('Date found in data (latest):', { raw: latestRaw, iso: latest.toISOString().slice(0,10) });
      return { date: latest, raw: latestRaw, source: 'data(latest)' };
    }

    dbgWarn('No date detected anywhere in CSV.');
    return null;
  }

  // Finds *all* dates in a string, supporting:
  // - ISO: YYYY-MM-DD (optionally with time)
  // - US slashes: MM/DD/YYYY or MM/DD/YY
  // - US dashes:  MM-DD-YYYY or MM-DD-YY   <-- this fixes your "10-27-2025" case
  // Returns array of { date: Date, raw: string }
  function findAllDatesInString(str) {
    const out = [];
    if (!str) return out;

    // ISO (YYYY-MM-DD or with time)
    const iso = /(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}:\d{2})?/g;
    for (const m of str.matchAll(iso)) {
      const yyyy = m[1], mm = m[2], dd = m[3];
      const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
      if (!isNaN(d)) out.push({ date: d, raw: m[0] });
    }

    // US slashes: MM/DD/YYYY or MM/DD/YY
    const usSlash = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g;
    for (const m of str.matchAll(usSlash)) {
      let yyyy = String(m[3]);
      if (yyyy.length === 2) yyyy = String(Number(yyyy) + 2000);
      const mm = String(m[1]).padStart(2, '0');
      const dd = String(m[2]).padStart(2, '0');
      const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
      if (!isNaN(d)) out.push({ date: d, raw: m[0] });
    }

    // US dashes: MM-DD-YYYY or MM-DD-YY  (NEW)
    const usDash = /(\d{1,2})-(\d{1,2})-(\d{2,4})/g;
    for (const m of str.matchAll(usDash)) {
      let yyyy = String(m[3]);
      if (yyyy.length === 2) yyyy = String(Number(yyyy) + 2000);
      const mm = String(m[1]).padStart(2, '0');
      const dd = String(m[2]).padStart(2, '0');
      const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
      if (!isNaN(d)) out.push({ date: d, raw: m[0] });
    }

    return out;
  }

  console.groupEnd(); // PO Debug Session
});

/* =========================
   Airtable PATCH for new CSV URL
   (unchanged behavior, with a touch of logging)
   ========================= */
function uploadNewCSVToAirtable(file, baseId, tableId, apiKey, dropboxUrl) {
  console.groupCollapsed('%cAirtable Update (PATCH)', 'color:#a50;');
  dbg('Preparing to update Airtable with new Dropbox URL:', { dropboxUrl });
  fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  .then(res => res.json())
  .then(data => {
    const record = data.records.find(r =>
      r.fields['CSV file']?.trim() === 'OpenPOReportbyVendorSalesmanDateCreated.csv'
    );
    if (!record) throw new Error("Matching record not found to update.");

    dbg('Updating record id:', record.id);
    return fetch(`https://api.airtable.com/v0/${baseId}/${tableId}/${record.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          "Attachments": [{ url: dropboxUrl }]
        }
      })
    });
  })
  .then(res => {
    dbg('Airtable PATCH status:', res.status);
    if (!res.ok) throw new Error('PATCH failed');
    dbg('✅ Airtable CSV record updated successfully.');
  })
  .catch(err => dbgErr('❌ Upload error:', err))
  .finally(() => console.groupEnd());
}
