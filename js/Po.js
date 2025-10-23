import {
  fetchDropboxToken,
  uploadFileToDropbox
} from './dropbox.js';

document.addEventListener("DOMContentLoaded", function () {
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");
    const errorMessage = document.getElementById("errorMessage");
    const csvTable = document.getElementById("csvTable");
    const tableHead = csvTable.querySelector("thead");
    const tableBody = csvTable.querySelector("tbody");
    const csvDate = document.getElementById("csvDate");

    // Show header only when we have data
    tableHead.style.display = "none";

    // Airtable config
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

    // Load CSV from Airtable
    fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
        headers: { Authorization: `Bearer ${airtableApiKey}` }
    })
    .then(res => res.json())
    .then(data => {
        const record = data.records.find(r =>
            r.fields['CSV file']?.trim() === 'OpenPOReportbyVendorSalesmanDateCreated.csv'
        );

        if (!record) throw new Error("Matching record not found in Airtable.");
        const attachment = record.fields['Attachments']?.[0];
        if (!attachment?.url) throw new Error("No attachment found for matching record.");
        return fetch(attachment.url);
    })
    .then(res => res.text())
    .then(csvData => {
        errorMessage.style.display = 'none';

        // Scrape date from CSV, then +1 day for display
        const scrapedDate = extractReportDate(csvData); // -> Date | null
        const plusOne = scrapedDate ? addDays(scrapedDate, 1) : null;
        csvDate.textContent = plusOne ? formatLocalDate(plusOne) : '—';

        parseCSV(csvData);
    })
    .catch(error => {
        console.warn("Airtable CSV not loaded:", error.message);
        errorMessage.textContent = "Could not load CSV from Airtable.";
        errorMessage.style.display = 'block';
    });

    // Drag-and-drop and file input
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
        if (!file.name.endsWith('.csv')) {
            errorMessage.textContent = `Invalid file selected. Please upload a CSV file.`;
            errorMessage.style.display = 'block';
            return;
        }

        errorMessage.style.display = 'none';

        const { token: dropboxToken, appKey, appSecret, refreshToken } = await fetchDropboxToken();

        const reader = new FileReader();
        reader.onload = async function (e) {
            const csvText = e.target.result;

            // Scrape date from uploaded CSV, then +1 day for display
            const scrapedDate = extractReportDate(csvText); // -> Date | null
            const plusOne = scrapedDate ? addDays(scrapedDate, 1) : null;
            csvDate.textContent = plusOne ? formatLocalDate(plusOne) : '—';

            parseCSV(csvText);

            // Upload to Airtable (via Dropbox share link)
            const creds = { appKey, appSecret, refreshToken };
            const sharedUrl = await uploadFileToDropbox(file, dropboxToken, creds);
            if (sharedUrl) {
                console.log("✅ Dropbox Upload Complete:", sharedUrl);
                await uploadNewCSVToAirtable(file, baseId, tableId, airtableApiKey, sharedUrl);
            }

            // Optional: second upload block preserved from previous logic
            if (!dropboxToken) {
                console.warn("⚠️ Dropbox token not available. Skipping Dropbox upload.");
                return;
            }

            try {
                const creds2 = { appKey, appSecret, refreshToken };
                const sharedUrl2 = await uploadFileToDropbox(file, dropboxToken, creds2);
                if (sharedUrl2) {
                    console.log("✅ Dropbox Upload Complete:", sharedUrl2);
                } else {
                    console.error("❌ Dropbox upload failed.");
                }
            } catch (err) {
                console.error("❌ Dropbox upload error:", err);
            }
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
        const lines = csvData.split('\n').slice(10); // skip headers
        const counts = {};
        let totalOccurrences = 0;

        lines.forEach(line => {
            const columns = line.split(',');
            let counterPerson = columns[9]?.trim().replace(/['"]+/g, '');
            if (counterPerson) {
                counterPerson = formatName(counterPerson);
                counts[counterPerson] = (counts[counterPerson] || 0) + 1;
                totalOccurrences++;
            }
        });

        populateTable(counts, totalOccurrences);
    }

    function populateTable(counts, totalOccurrences) {
        const average = totalOccurrences / Object.keys(counts).length;
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

    // ---------- Date scraping helpers ----------
    // Returns a Date object (local time) if found, else null.
    function extractReportDate(csvText) {
        // 1) Try to find a date in the first 10 lines (common spot for report headers)
        const headerLines = csvText.split('\n').slice(0, 10).join(' ');
        const headerFound = findDateInString(headerLines);
        if (headerFound) return headerFound;

        // 2) Otherwise, scan data rows and pick the latest parsable date we can find
        const lines = csvText.split('\n').slice(10);
        let latest = null;
        for (const line of lines) {
            const cols = line.split(',');
            for (const c of cols) {
                const d = findDateInString(c);
                if (d && (!latest || d > latest)) latest = d;
            }
        }
        return latest;
    }

    // Tries several patterns and returns a Date or null
    function findDateInString(str) {
        if (!str) return null;

        // ISO like 2025-10-22 or 2025-10-22 14:33:01
        const iso = /(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}:\d{2})?/;
        const mIso = str.match(iso);
        if (mIso) {
            const d = new Date(`${mIso[1]}-${mIso[2]}-${mIso[3]}T00:00:00`);
            if (!isNaN(d)) return d;
        }

        // US like 10/22/2025 or 10/22/25
        const us = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
        const mUs = str.match(us);
        if (mUs) {
            let yyyy = String(mUs[3]);
            if (yyyy.length === 2) {
                // naive pivot for YY → 20YY
                yyyy = String(Number(yyyy) + 2000);
            }
            const mm = String(mUs[1]).padStart(2, '0');
            const dd = String(mUs[2]).padStart(2, '0');
            const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
            if (!isNaN(d)) return d;
        }

        return null;
    }
});

// (unchanged) Update Airtable with new Dropbox URL for the CSV
function uploadNewCSVToAirtable(file, baseId, tableId, apiKey, dropboxUrl) {
    fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
    })
    .then(res => res.json())
    .then(data => {
        const record = data.records.find(r =>
            r.fields['CSV file']?.trim() === 'OpenPOReportbyVendorSalesmanDateCreated.csv'
        );
        if (!record) throw new Error("Matching record not found to update.");

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
    .then(() => console.log("✅ Airtable CSV record updated successfully."))
    .catch(err => console.error("❌ Upload error:", err));
}
