document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        initializez();
    }, 500);
});

let residentialWinRates = {};
let commercialWinRates = {};

async function initializez() {
    displayLoadingMessages2("Loading data, please wait...");

    const airtableApiKey = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
    const airtableBaseId = 'appK9gZS77OmsIK50';
    const airtableTableName = 'tblQo2148s04gVPq1';

const filterFormula = `
  AND(
    IS_AFTER({Last Time Outcome Modified}, DATEADD(TODAY(), -30, 'days')),
    OR(
      {Outcome} = 'Win',
      {Outcome} = 'Loss',
      {Outcome} = ''
    )
  )
`;
    const residentialRecords = await fetchAirtableDatas2(
        airtableApiKey,
        airtableBaseId,
        airtableTableName,
        filterFormula
    );
    if (!residentialRecords.length) {
        console.error("No records fetched from Airtable.");
        return;
    }
       
    residentialWinRates = calculateWinRates2(residentialRecords);

    // Filter out "Unknown User"
    residentialWinRates = Object.fromEntries(
        Object.entries(residentialWinRates).filter(([user]) => user !== 'Empty')
    );

    // Sort data for graph in ascending order of win rate percentage
    residentialWinRates = Object.fromEntries(
        Object.entries(residentialWinRates).sort(
            (a, b) => a[1].winRatePercentage - b[1].winRatePercentage
        )
    );

    // Populate dropdown with sorted user names
    const sortedUsers9 = Object.keys(residentialWinRates).sort((a, b) => a.localeCompare(b));
    populateDropdown9(sortedUsers9, 'user-filter');

    // Display chart with sorted data
    displayWinRatesAsBarChart2(residentialWinRates, 'winRateChart');

    hideLoadingMessages2();
}

function populateDropdown9(users, dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) {
        console.error(`Dropdown with ID '${dropdownId}' not found.`);
        return;
    } else {
    }
   
    // Clear existing options
    dropdown.innerHTML = '<option value="all">All ACs</option>';

    // Filter out users with "0 / 0" or undefined fractions
    const validUsers = users.filter(user => {
        const fraction = residentialWinRates[user]?.fraction;
        return fraction && fraction !== '0 / 0'; // Exclude "0 / 0" or undefined
    });

    // Add valid user options sorted alphabetically with fractions
    validUsers.forEach(user => {
        const fraction = residentialWinRates[user]?.fraction || '0 / 0';
        const option = document.createElement('option');
        option.value = user;
        option.textContent = `${user} (${fraction})`;
        dropdown.appendChild(option);
    });

    dropdown.addEventListener('change', event => {
        const selectedUser = event.target.value;
    
        let filteredData;
        if (selectedUser === 'all') {
            // Reset dataset to include all fetched records
            filteredData = { ...residentialWinRates };
        } else {
            // Filter for only the selected user
            filteredData = { [selectedUser]: residentialWinRates[selectedUser] || null };
        }
    
        displayWinRatesAsBarChart2(filteredData, 'winRateChart');
    });
    
}

async function fetchAirtableDatas2(apiKey, baseId, tableName) {
    try {
        let allRecords = [];
        let offset;

        // Formula to filter records created in the last 90 days
const filterFormula = `
  AND(
    IS_AFTER({Last Time Outcome Modified}, DATEADD(TODAY(), -30, 'days')),
    OR(
      {Outcome} = 'Win',
      {Outcome} = 'Loss'
    )
  )
`;
        const encodedFormula = encodeURIComponent(filterFormula);

        do {
            const url = `https://api.airtable.com/v0/${baseId}/${tableName}?filterByFormula=${encodedFormula}${
                offset ? `&offset=${offset}` : ''
            }`;

            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Airtable API Error:", errorText);
                throw new Error(`Airtable API error: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();
            allRecords = allRecords.concat(data.records);
            offset = data.offset; // Continue fetching if there are more records
        } while (offset);

        console.log(`Total records fetched: ${allRecords.length}`);
        return allRecords;
    } catch (error) {
        console.error("Error fetching data:", error);
        return [];
    }
}

function displayLoadingMessages2(message) {
    const fetchProgress = document.getElementById('fetch-progress');
    if (fetchProgress) {
        fetchProgress.textContent = message;
        fetchProgress.style.display = 'block';
    } else {
        console.warn('Fetch progress element not found.');
    }
}

function hideLoadingMessages2() {
    const fetchProgress = document.getElementById('fetch-progress');
    fetchProgress.style.display = 'none';
}

function calculateWinRates2(records) {
    const data = {};

    records.forEach(record => {
        // Directly access the ACM field value
        const submittedBy = record.fields['SubmitedBY'] || 'Empty';

        if (!data[submittedBy]) {
            data[submittedBy] = { winCount: 0, lossCount: 0, totalCount: 0 };
        }

        const outcome = record.fields['Outcome'];

        if (outcome === 'Win') {
            data[submittedBy].winCount += 1;
        } else if (outcome === 'Loss') {
            data[submittedBy].lossCount += 1;
        }

        data[submittedBy].totalCount += 1;
    });

    const winRates = {};
    for (const submittedBy in data) {
        const { winCount, lossCount, totalCount } = data[submittedBy];
        winRates[submittedBy] = {
            winCount,
            lossCount,
            totalCount,
            fraction: `${winCount} / ${totalCount}`,
            winRatePercentage: totalCount > 0 ? (winCount / totalCount) * 100 : 0
        };
    }
    return winRates;
}

function displayWinRatesAsBarChart2(data, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas with ID '${canvasId}' not found.`);
        return;
    }

    const ctx = canvas.getContext('2d');

    // Clear any existing chart instance
    if (canvas.chartInstance) {
        canvas.chartInstance.destroy();
    }

    // Filter out invalid data
    const validData = Object.entries(data).filter(([key, value]) => value && value.winRatePercentage !== undefined);

    // Handle empty data gracefully
    if (validData.length === 0) {
        console.warn("No valid data to display in the chart.");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const message = "No data available for the selected user.";
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
        return;
    }

    // Extract labels and win rates from valid data
    const labels = validData.map(([key]) => key);
    const winRates = validData.map(([key, value]) => value.winRatePercentage);

    canvas.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Win Rate (%)',
                    data: winRates,
                    backgroundColor: labels.map(user =>
                        user === 'Heath Kornegay' ? 'rgba(4, 124, 33, 0.8)' : 'rgba(4, 124, 33, 0.8)'
                    ),
                    borderColor: labels.map(user =>
                        user === 'Heath Kornegay' ? 'rgba(4, 124, 33, 0.8)' : 'rgba(4, 124, 33, 0.8)'
                    ),
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => `${value}%`,
                    },
                },
            },
        },
    });
}


