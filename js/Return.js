document.addEventListener('DOMContentLoaded', async function () {

    const airtableApiKey = 'patTGK9HVgF4n1zqK.cbc0a103ecf709818f4cd9a37e18ff5f68c7c17f893085497663b12f2c600054';
    const airtableBaseId = 'appeNSp44fJ8QYeY5';
    const airtableTableName = 'tbl6eZYBPK79a8qqo';
    const exportButton = document.getElementById('export-button');
    const locationDropdown = document.getElementById('locationDropdown');


    exportButton.textContent = "Fetching data...";
    exportButton.style.backgroundColor = "#ccc";
    exportButton.style.cursor = "not-allowed";

    async function fetchData(offset = null) {
        const now = new Date();
        const lastYear = new Date(now.setFullYear(now.getFullYear() - 1));
        const isoDate = lastYear.toISOString(); // e.g., "2024-05-19T14:00:00.000Z"
    
        const filterFormula = `filterByFormula=IS_AFTER({Date Created}, "${isoDate}")`;
        let url = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}?pageSize=100&${filterFormula}`;
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
            document.getElementById('record-count2').textContent = `Records fetched: ${allRecords.length}`;
        } while (offset);

        return allRecords;
    }

    // Function to get unique branches and populate the dropdown
    function populateDropdown(records) {
    
        const uniqueBranches = new Set();
        
        records.forEach(record => {
            let branch = record.fields['Branch'];
            if (branch === "Greenville,SC") {
                branch = "Greenville";
            }
            if (branch && branch !== "Test Branch" && !uniqueBranches.has(branch)) {
                uniqueBranches.add(branch);
    
                // Create an option element for each new branch and add it to the dropdown
                const option = document.createElement("option");
                option.value = branch;
                option.textContent = branch;
                locationDropdown.appendChild(option);
                
               
            }
        });
    
        // Convert Set to an array and sort it alphabetically
        const sortedBranches = Array.from(uniqueBranches).sort();
    
        // Clear dropdown and re-populate in sorted order
        locationDropdown.innerHTML = ""; // Clear dropdown to add sorted options
        sortedBranches.forEach(branch => {
            const option = document.createElement("option");
            option.value = branch;
            option.textContent = branch;
            locationDropdown.appendChild(option);
        });
    
        // Set "Raleigh" as the default selection if available
        if (sortedBranches.includes("Raleigh")) {
            locationDropdown.value = "Raleigh";
        }
    }

    function filterRecordsByLocation(records, location) {
       
        const filteredRecords = records.filter(record => {
            let branch = record.fields['Branch'] === "Greenville,SC" ? "Greenville" : record.fields['Branch'];
            return branch === location;
        });
        
        return filteredRecords;
    }

    function formatDateToMonthYear(dateString) {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const monthName = date.toLocaleString('default', { month: 'long' });
        return `${monthName} ${year}`;
    }

    function createBarChart(records, location) {
       

        if (records.length === 0) {
            console.warn("No data available to create the chart.");
            return;
        }

        const labels = [];
        const dataValues = [];

        records.forEach(record => {
            const monthYear = formatDateToMonthYear(record.fields['Date Created']);
            const cost = parseFloat(record.fields['Actual $ Credit Amount']) || 0;

            if (!labels.includes(monthYear)) {
                labels.push(monthYear);
                dataValues.push(cost);
            } else {
                const index = labels.indexOf(monthYear);
                dataValues[index] += cost;
            }
        });

        const chartData = labels.map((label, index) => ({ label, value: dataValues[index] }));
        chartData.sort((a, b) => new Date(a.label) - new Date(b.label));

        const sortedLabels = chartData.map(item => item.label);
        const sortedDataValues = chartData.map(item => item.value);

       const canvas = document.getElementById('chartContainer');


        if (window.myChartInstance) {
            window.myChartInstance.destroy();
        }

        window.myChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: sortedLabels,
                datasets: [{
                    label: `Total Returns for ${location}`,
                    data: sortedDataValues,
                    backgroundColor: 'rgba(2, 20, 104, 0.8)',
                    borderColor: 'rgba(2, 20, 104, 0.8)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: ''
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Total Cost of Return ($)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `$${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function exportToCSV(records) {
       

        // Define the CSV headers
        const headers = ['Branch', 'Date Created', 'Actual $ Credit Amount'];
        const rows = records.map(record => [
            record.fields['Branch'],
            record.fields['Date Created'],
            record.fields['Actual $ Credit Amount'] || 0
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(item => `"${item || ''}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `Returns_per_Branch${new Date().getFullYear()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    const allRecords = await fetchAllData();

    populateDropdown(allRecords);

    if (locationDropdown.value === "Raleigh") {
        const raleighRecords = filterRecordsByLocation(allRecords, "Raleigh");
        createBarChart(raleighRecords, "Raleigh");
    }

    exportButton.textContent = "Export to CSV";
    exportButton.style.backgroundColor = "#007bff";
    exportButton.style.cursor = "pointer";

    locationDropdown.addEventListener('change', function () {
        const selectedLocation = locationDropdown.value;
        
        if (selectedLocation) {
            const filteredRecords = filterRecordsByLocation(allRecords, selectedLocation);
            createBarChart(filteredRecords, selectedLocation);
        }
    });

    // Add event listener for export button
    exportButton.addEventListener('click', function () {
        exportToCSV(allRecords);
    });
});
