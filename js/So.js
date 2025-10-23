import {
  fetchDropboxToken,
  uploadFileToDropbox
} from './dropbox.js';

// Prevent duplicate initialization if the module/script gets included twice
if (!window.__SO_APP_INIT__) {
  window.__SO_APP_INIT__ = true;

  document.addEventListener("DOMContentLoaded", () => {
    // DOM
    const csvDateEl = document.getElementById('csvDate');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('csvFileInput');
    const tableBody = document.querySelector('#csvTable tbody');

    // Airtable + file label to match
    const airtableApiKey = 'patTGK9HVgF4n1zqK.cbc0a103ecf709818f4cd9a37e18ff5f68c7c17f893085497663b12f2c600054';
    const baseId = 'appD3QeLneqfNdX12';
    const tableId = 'tblvqHdBUZ6EQpcNM';
    const csvLabelMatch = 'SalesOrdersCreatedbyDateRangebyCounterPerson.csv';

    // In-flight guard to avoid double uploads
    let isUploading = false;

    // ===== Date helpers =====
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

    // Returns a Date or null
    function extractReportDate(csvText) {
      const cleaned = stripBom(csvText || '');

      // 1) First 10 lines (header). Many reports put the "run date" first.
      const header = cleaned.split('\n').slice(0, 10).join(' ');

      // NEW: prefer the first direct header date (e.g., 10-23-2025) over From/To
      const firstDirect = findFirstDate(header);
      if (firstDirect) return firstDirect;

      // Fallback: look for an explicit From/To range in the header
      // Example: From:10-01-2025 To 10-31-2025  (mm-dd-yyyy)
      const mRange = header.match(/From:\s*([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4})\s*To\s*([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4})/i);
      if (mRange) {
        // If you want the "From" date instead of "To", swap [2] -> [1]
        const d = parseLooseUsDate(mRange[2]) || parseLooseUsDate(mRange[1]);
        if (d) return d;
      }

      // 2) Otherwise, scan data rows for the latest date we can parse.
      // This file’s data starts after ~3 header lines.
      const lines = cleaned.split('\n').slice(3);
      let latest = null;
      for (const line of lines) {
        const cols = splitCsvRow(line);
        for (const cell of cols) {
          const d = findFirstDate(cell);
          if (d && (!latest || d > latest)) latest = d;
        }
      }
      return latest;
    }

    // Find the first date in a string using multiple formats
    function findFirstDate(str) {
      if (!str) return null;
      const s = dequote((str || '').trim());

      // ISO like 2025-10-22 or with time
      const mIso = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}:\d{2})?/);
      if (mIso) {
        const d = new Date(`${mIso[1]}-${mIso[2]}-${mIso[3]}T00:00:00`);
        if (!isNaN(d)) return d;
      }

      // US slash like 10/22/2025 or 10/22/25
      const mUsSlash = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (mUsSlash) {
        const d = parseLooseUsDate(mUsSlash[0]);
        if (d) return d;
      }

      // US hyphen like 10-22-2025 or 10-22-25
      const mUsHyphen = s.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
      if (mUsHyphen) {
        const d = parseLooseUsDate(mUsHyphen[0]);
        if (d) return d;
      }

      return null;
    }

    // Parse US-ish MM/DD[/YY] or MM-DD[-YY] with 2- or 4-digit year
    function parseLooseUsDate(token) {
      if (!token) return null;
      const t = token.trim();
      const m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
      if (!m) return null;
      let [ , mm, dd, yyyy ] = m;
      if (yyyy.length === 2) yyyy = String(Number(yyyy) + 2000);
      mm = String(mm).padStart(2, '0');
      dd = String(dd).padStart(2, '0');
      const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
      return isNaN(d) ? null : d;
    }

    function stripBom(text) {
      if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
      return text;
    }
    function dequote(s) {
      return s?.replace(/^"+|"+$/g, '') ?? s;
    }
    // Light CSV split for simple rows (quotes may exist)
    function splitCsvRow(row) {
      const out = [];
      let cur = '', inQ = false;
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') {
          if (inQ && row[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          out.push(cur); cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out;
    }

    // ===== Initial load from Airtable attachment =====
    fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      headers: { Authorization: `Bearer ${airtableApiKey}` }
    })
      .then(res => res.json())
      .then(data => {
        const record = data.records.find(r =>
          r.fields['CSV file']?.trim() === csvLabelMatch &&
          r.fields['Attachments']?.[0]?.url
        );
        if (!record) throw new Error("Matching CSV file not found.");
        return fetch(record.fields['Attachments'][0].url);
      })
      .then(res => res.text())
      .then(csvText => {
        // Scrape date, +1 day, display
        const scraped = extractReportDate(csvText);
const plusOne = scraped;
        // If you want the raw date (no +1), use: const plusOne = scraped;
        csvDateEl.textContent = `Current as of: ${plusOne ? formatLocalDate(plusOne) : '—'}`;

        parseCSV(csvText);
      })
      .catch(err => {
        console.warn("Could not load CSV from Airtable:", err?.message || err);
        csvDateEl.textContent = 'Current as of: —';
      });

    // ===== Drag & Drop / Input wiring (single-init safe) =====
    // Drag over/leave
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.backgroundColor = '#e6f7ff';
    }, { passive: false });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.backgroundColor = '';
    });

    // Drop
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.backgroundColor = '';
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    // Click to open file dialog
    dropZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });

    // ===== File handling =====
    function handleFile(file) {
      if (!file || !file.name.endsWith('.csv')) {
        alert('⚠️ Please upload a valid CSV file.');
        return;
      }
      if (!file.name.includes('SalesOrdersCreatedbyDateRangebyCounterPerson')) {
        alert('⚠️ Filename must contain "SalesOrdersCreatedbyDateRangebyCounterPerson".');
        return;
      }
      // Process immediately (no reload), then update Airtable
      readAndRenderCSV(file);
      // Fire-and-forget the cloud update in the background (guarded)
      void uploadNewCSVToDropboxAndAirtable(file);
    }

    function readAndRenderCSV(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvText = e.target.result;

        // Update the "Current as of" pill from the CSV (+1 day)
        const scraped = extractReportDate(csvText);
        const plusOne = scraped;
        // If you want the raw date (no +1), use: const plusOne = scraped;
        csvDateEl.textContent = `Current as of: ${plusOne ? formatLocalDate(plusOne) : '—'}`;

        // Render table immediately
        parseCSV(csvText);
      };
      reader.readAsText(file);
    }

    async function uploadNewCSVToDropboxAndAirtable(file) {
      if (isUploading) return; // guard against double submits
      isUploading = true;
      try {
        const { token: dropboxToken, appKey, appSecret, refreshToken } = await fetchDropboxToken();
        const creds = { appKey, appSecret, refreshToken };
        const sharedUrl = await uploadFileToDropbox(file, dropboxToken, creds);
        if (!sharedUrl) throw new Error("Dropbox upload failed.");

        // Find the matching Airtable record
        const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
          headers: { Authorization: `Bearer ${airtableApiKey}` }
        });
        const data = await res.json();
        const record = data.records.find(r =>
          r.fields['CSV file']?.trim() === csvLabelMatch
        );
        if (!record) throw new Error("Matching record not found in Airtable.");

        const recordId = record.id;

        // Replace attachment in a single PATCH (no page reload needed)
        await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${airtableApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            fields: { Attachments: [{ url: sharedUrl }] }
          })
        });

        console.log("✅ File uploaded and Airtable attachment replaced.");
      } catch (err) {
        console.error("❌ Upload error:", err);
        alert("⚠️ Upload failed. See console for details.");
      } finally {
        isUploading = false;
      }
    }

    // ===== CSV parsing & table build =====
    function parseCSV(csvData) {
      // This report tends to have a small header; skip 3 lines
      const lines = (csvData || '').split('\n').slice(3);

      const counts = {};
      let total = 0;

      lines.forEach(line => {
        if (!line.trim()) return;
        const value = splitCsvRow(line)[0]?.trim().replace(/['"]+/g, '');
        if (value) {
          counts[value] = (counts[value] || 0) + 1;
          total++;
        }
      });

      const denom = Math.max(Object.keys(counts).length || 1, 1);
      const avg = total / denom;
      const sorted = Object.entries(counts)
        .map(([key, value]) => ({
          key,
          value,
          percentage: ((value / avg) * 100).toFixed(2)
        }))
        .sort((a, b) => b.percentage - a.percentage || a.key.localeCompare(b.key));

      tableBody.innerHTML = '';
      sorted.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${item.key}</td><td>${item.value}</td><td>${item.percentage}%</td>`;
        tableBody.appendChild(row);
      });
    }
  });
}
