document.addEventListener('DOMContentLoaded', async function () {

    const airtableApiKey = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
    const airtableBaseId = 'appK9gZS77OmsIK50';
    const airtableTableName = 'tblQo2148s04gVPq1';
    const exportButton = document.getElementById('export-button');

    async function fetchData(offset = null) {
        const currentYear = new Date().getFullYear();
        let url = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}?pageSize=100&filterByFormula=YEAR({Created})=${currentYear}`;
        if (offset) url += `&offset=${offset}`;

        try {
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${airtableApiKey}` }
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching data from Airtable:', error.message);
            return { records: [] };
        }
    }

    async function fetchAllData() {
    
        let allRecords = [];
        let offset = null;

        do {
            const data = await fetchData(offset);
            allRecords = allRecords.concat(data.records);
            offset = data.offset;

            document.getElementById('record-count3').textContent = `Records fetched: ${allRecords.length}`;
        } while (offset);

        const currentYear = new Date().getFullYear();
        const currentYearRecords = allRecords.filter(record => {
            const dateReceived = new Date(record.fields['Date Received']);
            return dateReceived.getFullYear() === currentYear;
        });

        return currentYearRecords;
    }

    function createBarChart(records) {
    
        const bidCounts = {};
        records.forEach(record => {
            const branch = record.fields['Branch'];
            if (branch !== "Test Branch") {
                if (!bidCounts[branch]) {
                    bidCounts[branch] = 0;
                }
                bidCounts[branch] += 1;
            }
        });

        const branches = Object.keys(bidCounts);
        const bidData = branches.map(branch => bidCounts[branch]);

        const sortedData = branches
            .map((branch, index) => ({ branch, count: bidData[index] }))
            .sort((a, b) => a.count - b.count);

        const sortedBranches = sortedData.map(item => item.branch);
        const sortedBidData = sortedData.map(item => item.count);

        const ctx = document.getElementById('bidsChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedBranches,
                datasets: [{
                    label: `Number of Bids (${new Date().getFullYear()})`,
                    data: sortedBidData,
                    backgroundColor: 'rgba(2, 20, 104, 0.8)',
                    borderColor: 'rgba(2, 20, 104, 0.8)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Bids'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: ''
                        }
                    }
                }
            }
        });
    }

    // Fetch data, create chart, and set up the export button
    const allRecords = await fetchAllData();
    createBarChart(allRecords);

   
});

setTimeout(() => {
  console.log("⏳ 45 seconds passed, hiding elements...");

  document.querySelectorAll(
    "#record-count3, #record-count2, #live-update-container, #record-countNew"
  ).forEach(el => {
    if (el) {
      console.log("✅ Hiding element:", el.id);
      el.style.display = "none";
    } else {
      console.log("⚠️ Element not found.");
    }
  });

  console.log("🎉 Done hiding specified elements.");
}, 50000); // 50000 ms = 50 seconds
