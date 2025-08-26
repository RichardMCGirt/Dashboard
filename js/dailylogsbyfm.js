let residentialWinRates88 = {};

document.addEventListener('DOMContentLoaded', function () {
    initializet();

});

async function initializet() {
    displayLoadingMessages2("Loading data, please wait...");

    const airtableApiKey = 'pat1Eu3iQYHDmLSWr.ecfb8470f9c2b8409a0017e65f5b8cf626208e4df1a06905a41019cb38a8534b';
    const airtableBaseId = 'appiNUEHQOPRWZjcn';
    const airtableTableName = 'tblVrmq2waEpElxt4'; // First table
    const airtableTableName2 = 'tblMm1V1Y5vL2lGS5'; // Second table

    const filterFormula = `AND(LEN({PM}) > 0, IS_AFTER({Date Record Created}, DATEADD(TODAY(), -7, 'days')))`;

    
    // Fetch records from both tables
    const residentialRecords = await fetchAirtableDatas4(airtableApiKey, airtableBaseId, airtableTableName, filterFormula);
   
   
    const secondaryRecords = await fetchAirtableDatas4(
        airtableApiKey, 
        airtableBaseId, 
        airtableTableName2, 
        `AND({Position} = "Commercial Project Manager", {Status} = "Active")`
    );


    // Aggregate and sort data
    residentialWinRates88 = calculateTotalRecordsByPM(residentialRecords, secondaryRecords); // ✅ NO `let`
   

    // Populate dropdown with sorted PM names
    const sortedUsers = Object.keys(residentialWinRates88);
   
    populateDropdown4(sortedUsers, 'user-filter3');

    // Display chart with aggregated data
    
displayWinRatesAsBarChart4(residentialWinRates88, 'FDL');

   
    hideLoadingMessages2();
}

function hideLoadingMessages2() {
    const fetchProgress = document.getElementById('fetch-progress3');
    fetchProgress.style.display = 'none';
}

function displayLoadingMessages2(message) {
    const fetchProgress = document.getElementById('fetch-progress3');
    if (fetchProgress) {
        fetchProgress.textContent = message;
        fetchProgress.style.display = 'block';
    } else {
        console.warn('Fetch progress element not found.');
    }
}

function calculateTotalRecordsByPM(records, secondaryRecords) {
    const data = {};


    records.forEach(record => {
        let pm = record.fields['PM'] ? capitalizeName(record.fields['PM'].trim()) : 'Unknown';


        if (!data[pm]) {
            data[pm] = { totalCount: 0 };
        }

        data[pm].totalCount += 1;
    });

    // Merge missing PMs from the second table
    const mergedData = mergeMissingNames(data, secondaryRecords);


    return Object.entries(mergedData)
        .sort(([nameA, a], [nameB, b]) => a.totalCount - b.totalCount || nameA.localeCompare(nameB))
        .reduce((acc, [pm, values]) => {
            acc[pm] = values;
            return acc;
        }, {});
}

function mergeMissingNames(existingData, secondaryRecords) {
    const updatedData = { ...existingData };


    secondaryRecords.forEach(record => {
        const name = record.fields['Full Name'] ? capitalizeName(record.fields['Full Name'].trim()) : 'Unknown';


        if (!updatedData[name]) {
            updatedData[name] = { totalCount: 0 };
        }
    });
    return updatedData;
}

function capitalizeName(name) {
    if (!name) return "Unknown"; // Handle empty names
    return name
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

async function fetchAirtableDatas4(apiKey, baseId, tableName, formula) {
    try {
        let allRecords = [];
        let offset;
        const encodedFormula = encodeURIComponent(formula);

      

        do {
            const url = `https://api.airtable.com/v0/${baseId}/${tableName}?filterByFormula=${encodedFormula}${offset ? `&offset=${offset}` : ''}`;

            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Airtable API Error:", errorText);
                throw new Error(`Airtable API error: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();

            // Convert Date to NYC Time after fetching
            data.records.forEach(record => {
                if (record.fields['Date Record Created']) {
                    const utcDate = new Date(record.fields['Date Record Created']);
                    record.fields['NYC_Time'] = utcDate.toLocaleString("en-US", { timeZone: "America/New_York" });
                }
            });

            allRecords = allRecords.concat(data.records);

            offset = data.offset;
            if (offset) {
            }
        } while (offset);

        return allRecords;
    } catch (error) {
        console.error("Error fetching data:", error);
        return [];
    }
}

function populateDropdown4(users, dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) {
        console.error(`Dropdown with ID '${dropdownId}' not found.`);
        return;
    }

    dropdown.innerHTML = '<option value="all">All FMs</option>';

    const validUsers = users
        .filter(user => user.trim().toLowerCase() !== 'heath kornegay')
        .map(user => capitalizeName(user.trim()))
        .sort((a, b) => a.localeCompare(b));

    validUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user;
        option.textContent = `${user}`;
        dropdown.appendChild(option);
    });

    dropdown.addEventListener('change', event => {
        const rawValue = event.target.value.trim();
        const selectedUser = rawValue.toLowerCase() === "all" ? "All" : capitalizeName(rawValue);
        
        // ✅ Add this check here
        if (!residentialWinRates || Object.keys(residentialWinRates).length === 0) {
            console.warn("No residential win rates data available.");
            return;
        }

        const filteredData =
        selectedUser === 'All'
            ? residentialWinRates88
            : residentialWinRates88[selectedUser]
            ? { [selectedUser]: residentialWinRates88[selectedUser] }
            : {};
        displayWinRatesAsBarChart4(filteredData, 'FDL');
    });
}

function displayWinRatesAsBarChart4(data, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas with ID '${canvasId}' not found.`);
        return;
    }

    const ctx = canvas.getContext('2d');

    if (canvas.chartInstance) {
        canvas.chartInstance.destroy();
    }

    // Filter out "Unknown" values
    const validData = Object.entries(data)
        .filter(([key, value]) => key !== "Unknown" && value.totalCount !== undefined);

    if (!validData.length) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText("No data available for the selected user.", canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = validData.map(([key]) => key); // Names of PMs
    const totalCounts = validData.map(([_, value]) => value.totalCount); // Total records per PM

    canvas.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Logs Recorded',
                data: totalCounts,
                backgroundColor: 'rgba(173, 13, 28, 0.8)',
                borderColor: 'rgba(173, 13, 28, 0.8)',
                borderWidth: 1,
            }],
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { display: true } },
        },
    });
}

