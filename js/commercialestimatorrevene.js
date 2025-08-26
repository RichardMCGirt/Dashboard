document.addEventListener('DOMContentLoaded', async function () {
    const airtableApiKey = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
    const airtableBaseId = 'appK9gZS77OmsIK50';
    const airtableTableName = 'tblQo2148s04gVPq1';
    let chartInstance = null;

    const exportButton = document.getElementById('export-button');

    exportButton.disabled = true;
    exportButton.textContent = "Fetching data...";
    exportButton.style.backgroundColor = "#ccc";
    exportButton.style.cursor = "not-allowed";

    async function fetchData(offset = null) {
        const today = new Date();
        const sixtyDaysAgo = new Date(today);
        sixtyDaysAgo.setDate(today.getDate() - 30);
        const formattedDate = sixtyDaysAgo.toISOString().split('T')[0];
    
        let url = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}?pageSize=100&filterByFormula=AND({Project%20Type}='Commercial',NOT({Estimator}=''),IS_AFTER({Date%20Marked%20Completed},'${formattedDate}'))&sort[0][field]=Estimator&sort[0][direction]=asc&expand[]=Estimator`;
    
        if (offset) {
            url += `&offset=${offset}`;
        }
    
        try {
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${airtableApiKey}`
                }
            });
    
            if (!response.ok) {
                const errorDetails = await response.json();
                console.error('Error fetching data from Airtable:', errorDetails);
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
    
            const data = await response.json();
    
            // Extract Employee values per estimator
            const recordsWithEmployee = data.records.map(record => {
                const estimator = record.fields.Estimator?.[0]; // Expanded estimator record
                const employeeName = estimator?.fields?.Employee || "Unknown";
                return {
                    ...record,
                    employeeName
                };
            });
    
            console.log("🧾 Records with Employee values:", recordsWithEmployee);
            return { ...data, records: recordsWithEmployee };
    
        } catch (error) {
            console.error('Error fetching data from Airtable:', error.message);
            return { records: [] };
        }
    }
    
    
    async function fetchEstimatorsMap() {
        const url = `https://api.airtable.com/v0/${airtableBaseId}/Estimators?pageSize=100`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${airtableApiKey}` }
        });
        const data = await response.json();
    
        const estimatorMap = {};
        data.records.forEach(record => {
            if (record.id && record.fields['Full Name']) {
                estimatorMap[record.id] = record.fields['Full Name'];
            }
        });
    
        console.log("🗺️ Estimator ID to Name Map:", estimatorMap);
        return estimatorMap;
    }

    async function fetchAllData() {
        let allRecords = [];
        let offset = null;
        const today = new Date();
        const sixtyDaysAgo = new Date(today);
        sixtyDaysAgo.setDate(today.getDate() - 60);

        do {
            const data = await fetchData(offset);
            const filteredRecords = data.records.filter(record => {
                const anticipatedEndDate = new Date(record.fields['Date Marked Completed']);
                return anticipatedEndDate >= sixtyDaysAgo && anticipatedEndDate <= today;
            });

            allRecords = allRecords.concat(filteredRecords);
            offset = data.offset;

            document.getElementById('record-countE60').textContent = `Records fetched: ${allRecords.length}`;
        } while (offset);

        return allRecords;
    }

    async function processRecords() {
        const [allRecords, estimatorsMap] = await Promise.all([
            fetchAllData(),
            fetchEstimatorsMap()
        ]);
        const revenueByEstimator = {};  // <-- MISSING DECLARATION FIXED HERE
        const bidNamesByEstimator = {};
allRecords.forEach(record => {
    const estimatorId = record.fields['Estimator']?.[0];
    const estimatorName = estimatorsMap[estimatorId] || "Unknown";
    const bidValue = parseFloat(record.fields['Bid Value']) || 0;
    const bidName = record.fields['Employee'] || "Unnamed Bid";

    if (!revenueByEstimator[estimatorName]) {
        revenueByEstimator[estimatorName] = 0;
        bidNamesByEstimator[estimatorName] = [];
    }

    revenueByEstimator[estimatorName] += bidValue;
    bidNamesByEstimator[estimatorName].push(bidName);
});

        console.log("📊 Final revenue by estimator:", revenueByEstimator);
    
        createBarChart(revenueByEstimator, bidNamesByEstimator);
    
        exportButton.disabled = false;
        exportButton.textContent = "Export to CSV";
        exportButton.style.backgroundColor = "";
        exportButton.style.cursor = "pointer";
    
        exportButton.addEventListener('click', () => {
            downloadCSV(allRecords);
        });
    }
    
    function createBarChart(revenueByEstimator, bidNamesByEstimator) {
        const sortedData = Object.entries(revenueByEstimator)
            .sort((a, b) => a[1] - b[1]); // ascending
    
        const estimatorNames = sortedData.map(entry => entry[0]);
        const revenueValues = sortedData.map(entry => entry[1]);
    
        const ctx = document.getElementById('60daysEChart').getContext('2d');
    
        if (chartInstance !== null) {
            chartInstance.destroy();
        }
    
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: estimatorNames,
                datasets: [{
                    label: 'Bid Value',
                    data: revenueValues,
                    backgroundColor: 'rgba(23, 162, 184, 0.8)',
                    borderColor: 'rgba(23, 162, 184, 1)',
                    borderWidth: 2,
                    barThickness: 40
                }]
            },
            options: {
                indexAxis: 'x',
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => `$${value.toLocaleString()}`
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return `Estimator: ${context[0].label}`;
                            },
                            label: function(context) {
                                const estimator = context.label;
                                const bidList = bidNamesByEstimator[estimator] || [];
                                return bidList.map((bid, i) => `${i + 1}. ${bid}`);
                            },
                            afterLabel: function(context) {
                                const value = context.raw;
                                return `Total Bid Value: $${value.toLocaleString()}`;
                            }
                        }
                    }
                }
            }
        });
    }
    await processRecords();
});
