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
      console.log("[GIS] Token received, user authorized!");

      document.getElementById('authorize_button').style.display = 'none';
      document.getElementById('refresh_button').style.display = 'inline-block'; // Show after login
      document.getElementById('loadingBarOverlay').style.display = 'none';
        document.getElementById('table-container').style.display = 'block'; // SHOW table


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
        document.getElementById('authorize_button').onclick = () => tokenClient.requestAccessToken();
          google.accounts.oauth2.revoke(tokenClient.clientId, () => {
            document.getElementById('authorize_button').style.display = 'inline-block';
            document.getElementById('table-container').innerHTML = "";
          });
        };
      }
    
   async function listSheetData() {
  const DateTime = luxon.DateTime; // Use Luxon for timezone
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

  // Helper for currency
  function parseCurrency(val) {
    if (typeof val !== "string") return NaN;
    return parseFloat(val.replace(/\$/g, '').replace(/,/g, '').replace(/\s/g, ''));
  }

  // Determine visible columns: always show non-date columns and any week columns ≤ today
  const headers = rows[0];
  const weekColIdxs = [];
  const visibleColIdxs = headers.map((h, idx) => {
    const match = h.trim().match(/^(\d{2})\/(\d{2})$/);
    if (!match) return idx; // Keep non-date columns

    // Parse header as MM/DD of current year
    let colDate = DateTime.fromFormat(`${match[1]}/${match[2]}/${nowNY.year}`, 'MM/dd/yyyy', { zone: 'America/New_York' });
    if (colDate <= nowNY) {
      weekColIdxs.push(idx);
      return idx;
    }
    return -1; // Hide if in future
  }).filter(idx => idx !== -1);

  // Find Goal column (needed for deltas)
  const goalIdx = headers.findIndex(h => h.trim().toLowerCase() === 'goal');
  const PIPELINE_ROWS = [
    "Opportunity Pipeline $'s - Residential",
    "Opportunity Pipeline $'s - Commercial"
  ];
  const NO_DELTA_ROWS = [
    "Weeks Remaining FY"
  ];

  // Table HTML
  let html = "<table><thead><tr>";
  visibleColIdxs.forEach(idx => {
    html += `<th>${headers[idx]}</th>`;
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
      let prevWeekIdx = null;
      for (let j = weekColIdxs.indexOf(idx) - 1; j >= 0; j--) {
        if (visibleColIdxs.includes(weekColIdxs[j])) {
          prevWeekIdx = weekColIdxs[j];
          break;
        }
      }
      if (prevWeekIdx !== null && idx > prevWeekIdx) {
        const currentVal = parseCurrency(cell);
        const prevVal = parseCurrency(rows[i][prevWeekIdx]);
        if (!isNaN(currentVal) && !isNaN(prevVal)) {
          const delta = currentVal - prevVal;
          let color = delta === 0 ? 'gray' : (delta > 0 ? 'green' : 'red');
          deltaHTML = `<div style="font-size:0.9em;color:${color};font-weight:bold;">
            ${delta > 0 ? '+' : ''}${delta.toLocaleString()}
          </div>`;
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
        let color = delta === 0 ? 'gray' : (delta > 0 ? 'green' : 'red');
        deltaHTML = `<div style="font-size:0.9em;color:${color};font-weight:bold;">
          ${delta > 0 ? '+' : ''}${delta.toLocaleString()}
        </div>`;
      }
    }

    const cellContent = `${cell || ''}${deltaHTML}`;
    html += shouldBoldRow ? `<td><strong>${cellContent}</strong></td>` : `<td>${cellContent}</td>`;
  });
  html += "</tr>";
}

  html += "</tbody></table>";
  document.getElementById('table-container').innerHTML = html;
  showToast("Sheet refreshed!");

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

    // Manual refresh
   document.getElementById('refresh_button').onclick = () => {
  document.getElementById('loadingBarOverlay').style.display = 'block';
  listSheetData().then(() => showToast("Sheet manually refreshed!"));
};
    console.log("[Buttons] Button click handlers set.");
  } else {
    console.log("[Buttons] Waiting for GAPI and GIS initialization...");
  }
}

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
  }, 1800); // Toast stays for 1.8s
}

// Auto-refresh every 5 minutes (300,000 ms)
setInterval(() => {
  if (document.getElementById('signout_button').style.display === 'inline-block') {
    document.getElementById('loadingBarOverlay').style.display = 'block';
    listSheetData().then(() => showToast("Sheet auto-refreshed!"));
  }
}, 300000);

    window.gapiLoaded = gapiLoaded;
    window.gisLoaded = gisLoaded;

   