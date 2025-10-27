// --- GOOGLE SHEETS + GIS SIGNIN LOGIC ---
const CLIENT_ID = "518347118969-drq9o3vr7auf78l16qcteor9ng4nv7qd.apps.googleusercontent.com";
const API_KEY = "AIzaSyBGYsHkTEvE9eSYo9mFCUIecMcQtT8f0hg";
const SHEET_ID = "1-odgue-k8jX-QbnTvi-7_jUK4O2Q---ZnMzuuBfKYdE";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";

let tokenClient;
let gapiInited = false;
let gisInited = false;

function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"]
    });
    gapiInited = true;
    maybeEnableButtons();
  });
}

window.gisLoaded = gisLoaded;

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (tokenResponse) => {
      authInProgress = false;

      console.log("[GIS] Token callback triggered.");
      if (tokenResponse.error) {
        console.error("[GIS] Token error:", tokenResponse.error);
        alert(JSON.stringify(tokenResponse, null, 2));
        return;
      }
      console.log("[GIS] Token received, user authorized!]");

      document.getElementById('authorize_button').style.display = 'none';
      document.getElementById('refresh_button').style.display = 'inline-block';
      document.getElementById('loadingBarOverlay').style.display = 'none';
      document.getElementById('table-container').style.display = 'block';

      console.log("[GIS] UI updated for logged-in user. Loading sheet data...");
      await listSheetData();
      console.log("[GIS] Sheet data loaded and displayed.");
    },
  });
  gisInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    console.log("[Buttons] Setting up button click handlers...");

    let authInProgress = false;
    document.getElementById('authorize_button').onclick = () => {
      if (authInProgress) return;
      authInProgress = true;
      tokenClient.requestAccessToken();
    };

    document.getElementById('refresh_button').onclick = () => {
      document.getElementById('loadingBarOverlay').style.display = 'block';
      listSheetData().then(() => showToast("Sheet manually refreshed!"));
    };
    console.log("[Buttons] Button click handlers set.");
  } else {
    console.log("[Buttons] Waiting for GAPI and GIS initialization...");
  }
}

// Utility: show toast
function showToast(message = "Refreshed!") {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = "show";
  toast.style.opacity = 1;
  toast.style.visibility = "visible";
  setTimeout(() => {
    toast.className = toast.className.replace("show", "");
    toast.style.opacity = 0;
    toast.style.visibility = "hidden";
  }, 1800);
}

// ----- MAIN TABLE RENDER -----
async function listSheetData() {
  const DateTime = luxon.DateTime; // timezone safe
  const nowNY = DateTime.now().setZone('America/New_York').startOf('day');

  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Weekly Goals'!A1:Z100"
  });
  const rows = res.result.values;
  if (!rows || rows.length === 0) {
    document.getElementById('table-container').innerHTML = "<p>No data found in sheet.</p>";
    return;
  }

  // parse $ currency safely
  function parseCurrency(val) {
    if (typeof val !== "string") return NaN;
    return parseFloat(val.replace(/\$/g, '').replace(/,/g, '').replace(/\s/g, ''));
  }

  const headers = rows[0];

  // Identify which columns should be visible: keep any non-MM/DD header, and any MM/DD <= today
  const weekColIdxs = [];
  let visibleColIdxs = headers.map((h, idx) => {
    const text = (h || "").trim();
    const match = text.match(/^(\d{2})\/(\d{2})$/);
    if (!match) return idx; // keep non-date
    const colDate = DateTime.fromFormat(`${match[1]}/${match[2]}/${nowNY.year}`, 'MM/dd/yyyy', { zone: 'America/New_York' });
    return (colDate <= nowNY) ? (weekColIdxs.push(idx), idx) : -1;
  }).filter(idx => idx !== -1);

  // Find important helper indices
  const goalIdx = headers.findIndex(h => (h || '').trim().toLowerCase() === 'goal');

  const PIPELINE_ROWS = [
    "Opportunity Pipeline $'s - Residential",
    "Opportunity Pipeline $'s - Commercial"
  ];
  const NO_DELTA_ROWS = [
    "Weeks Remaining FY"
  ];

  // Build table HTML
  let html = "<table><thead><tr>";
  visibleColIdxs.forEach(idx => {
    html += `<th>${headers[idx] ?? ''}</th>`;
  });
  html += "</tr></thead><tbody>";

  for (let i = 1; i < rows.length; i++) {
    html += "<tr>";
    const rowLabel = (rows[i][1] || '').trim();
    const shouldBoldRow = ["PreCon", "Sales", "Estimating", "Administration", "Field"].includes(rowLabel);

    visibleColIdxs.forEach(idx => {
      const cell = rows[i][idx];
      let deltaHTML = '';

      if (NO_DELTA_ROWS.includes(rowLabel)) {
        const cellContent = `${cell || ''}`;
        html += shouldBoldRow ? `<td><strong>${cellContent}</strong></td>` : `<td>${cellContent}</td>`;
        return;
      }

      if (PIPELINE_ROWS.includes(rowLabel) && weekColIdxs.includes(idx)) {
        // show delta to previous visible week
        let prevWeekIdx = null;
        for (let j = weekColIdxs.indexOf(idx) - 1; j >= 0; j--) {
          if (visibleColIdxs.includes(weekColIdxs[j])) { prevWeekIdx = weekColIdxs[j]; break; }
        }
        if (prevWeekIdx !== null && idx > prevWeekIdx) {
          const currentVal = parseCurrency(cell);
          const prevVal = parseCurrency(rows[i][prevWeekIdx]);
          if (!isNaN(currentVal) && !isNaN(prevVal)) {
            const delta = currentVal - prevVal;
            const color = delta === 0 ? 'gray' : (delta > 0 ? 'green' : 'red');
            deltaHTML = `<div style="font-size:0.9em;color:${color};font-weight:bold;">${delta > 0 ? '+' : ''}${delta.toLocaleString()}</div>`;
          }
        }
        const cellContent = `${cell || ''}${deltaHTML}`;
        html += shouldBoldRow ? `<td><strong>${cellContent}</strong></td>` : `<td>${cellContent}</td>`;
        return;
      }

      if (weekColIdxs.includes(idx) && goalIdx !== -1) {
        const goalRaw = rows[i][goalIdx];
        const actualRaw = cell;
        const goal = parseCurrency(goalRaw);
        const actual = parseCurrency(actualRaw);
        if (!isNaN(goal) && !isNaN(actual)) {
          const delta = actual - goal;
          const color = delta === 0 ? 'gray' : (delta > 0 ? 'green' : 'red');
          deltaHTML = `<div style="font-size:0.9em;color:${color};font-weight:bold;">${delta > 0 ? '+' : ''}${delta.toLocaleString()}</div>`;
        }
      }

      const cellContent = `${cell || ''}${deltaHTML}`;
      html += shouldBoldRow ? `<td><strong>${cellContent}</strong></td>` : `<td>${cellContent}</td>`;
    });

    html += "</tr>";
  }

  html += "</tbody></table>";
  const container = document.getElementById('table-container');
  container.innerHTML = html;

  // Ensure scroll is enabled
  container.style.overflowX = 'auto';
  container.style.overflowY = 'hidden';

  // AFTER the table is in the DOM, mark the “Data Source” column sticky
  makeColumnStickyByHeaderText("Data Source");

  showToast("Sheet refreshed!");
}

/**
 * Make a column sticky (frozen on the left) by matching the rendered header cell text.
 * Works even if the header text was populated/modified by JS after table creation.
 * - headerText: string to match (case-insensitive, trimmed)
 */
function makeColumnStickyByHeaderText(headerText) {
  const container = document.getElementById('table-container');
  const table = container.querySelector('table');
  if (!table) return;

  // Remove any previous sticky marks
  table.querySelectorAll('.sticky-col').forEach(el => el.classList.remove('sticky-col'));

  const theadThs = Array.from(table.querySelectorAll('thead th'));
  if (!theadThs.length) return;

  // Find the index of the header whose text matches (case-insensitive, trimmed).
  const target = headerText.trim().toLowerCase();
  let stickyIdx = theadThs.findIndex(th => th.textContent.trim().toLowerCase() === target);

  // If not found, bail out (or you could add aliases here).
  if (stickyIdx === -1) {
    console.warn(`[sticky] Header "${headerText}" not found in rendered thead th list.`);
    return;
  }

  // Mark header cell sticky
  theadThs[stickyIdx].classList.add('sticky-col');

  // Mark each row's cell in that column sticky
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  rows.forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds[stickyIdx]) tds[stickyIdx].classList.add('sticky-col');
  });
}

// Auto-refresh every 5 minutes
setInterval(() => {
  if (document.getElementById('signout_button').style.display === 'inline-block') {
    document.getElementById('loadingBarOverlay').style.display = 'block';
    listSheetData().then(() => showToast("Sheet auto-refreshed!"));
  }
}, 300000);

window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;
