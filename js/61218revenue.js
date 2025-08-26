document.addEventListener('DOMContentLoaded', async function () {
    const airtableApiKey = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
    const airtableBaseId = 'appX1Saz7wMYh4hhm';
    const airtableTableName = 'tblfCPX293KlcKsdp';
    let expectedRevenueChartInstance = null;

    async function fetchData(offset = null) {
        let url = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}?pageSize=100`;
        if (offset) url += `&offset=${offset}`;

        try {
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${airtableApiKey}` }
            });

            if (!response.ok) {
                const errorDetails = await response.json();
                console.error('Error fetching data from Airtable:', errorDetails);
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  do {
    const data = await fetchData(offset);

    const filteredRecords = data.records.filter(record => {
      const bidValue = parseFloat(record.fields['Bid Value']) || 0;
      const anticipatedStartDate = record.fields['Anticipated Start Date']
        ? new Date(record.fields['Anticipated Start Date'])
        : null;
      const anticipatedEndDate = record.fields['Anticipated End Date']
        ? new Date(record.fields['Anticipated End Date'])
        : null;
      const outcome = record.fields['Outcome'] || '';

      if (bidValue <= 0) return false;
      if (outcome.toLowerCase() !== 'win') return false;

      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);

      let overlapsCurrentMonth = false;
      if (anticipatedStartDate && anticipatedEndDate) {
        overlapsCurrentMonth = anticipatedStartDate <= monthEnd && anticipatedEndDate >= monthStart;
      }

      return (
        (anticipatedEndDate && anticipatedEndDate >= today) ||
        (anticipatedStartDate && anticipatedStartDate >= today) ||
        overlapsCurrentMonth
      );
    });

    // ✅ Debug: log Savannah records passing filter
    filteredRecords.forEach(record => {
      if (
        record.fields['Division'] &&
        record.fields['Division'].toLowerCase() === 'savannah'
      ) {
        console.log("Savannah Record Passing Filter:", {
          Name: record.fields['Name'] || '',
          BidValue: record.fields['Bid Value'] || '',
          Outcome: record.fields['Outcome'] || '',
          AnticipatedStartDate: record.fields['Anticipated Start Date'] || '',
          AnticipatedEndDate: record.fields['Anticipated End Date'] || ''
        });
      }
    });

    allRecords = allRecords.concat(filteredRecords);
    offset = data.offset;

    document.getElementById('record-countNew').textContent = `Records fetched: ${allRecords.length}`;
  } while (offset);

  return allRecords;
}

async function processRecords(allRecords) {
  if (!allRecords || allRecords.length === 0) {
    console.warn("No records to process.");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const revenueByDivision = {};
  const allMonths = new Set();

  console.log(`Processing ${allRecords.length} records...`);

  allRecords.forEach((record, idx) => {
    const divisionName = record.fields['Division'] || "Unknown Division";
    const bidValue = parseFloat(record.fields['Bid Value']) || 0;

    if (bidValue === 0) {
      console.log(`Skipping record ${idx + 1}: Bid Value is zero or invalid.`);
      return;
    }

    const anticipatedStartDate = record.fields['Anticipated Start Date']
      ? new Date(record.fields['Anticipated Start Date'])
      : null;

    const anticipatedEndDate = record.fields['Anticipated End Date']
      ? new Date(record.fields['Anticipated End Date'])
      : null;

    if (!anticipatedStartDate || !anticipatedEndDate || anticipatedEndDate < anticipatedStartDate) {
      if (divisionName.toLowerCase() === 'savannah') {
        console.log(`Skipping record ${idx + 1} for Savannah: Invalid dates`, {
          anticipatedStartDate,
          anticipatedEndDate
        });
      } else {
        console.log(`Skipping record ${idx + 1}: Invalid start/end dates.`, {
          anticipatedStartDate,
          anticipatedEndDate
        });
      }
      return;
    }

    // ✅ Count full months: inclusive
    let monthsDiff = (anticipatedEndDate.getFullYear() - anticipatedStartDate.getFullYear()) * 12 +
                     (anticipatedEndDate.getMonth() - anticipatedStartDate.getMonth()) + 1;

    monthsDiff = Math.max(monthsDiff, 1);

    const portionPerMonth = bidValue / monthsDiff;

    if (divisionName.toLowerCase() === 'savannah') {
      console.log(`Savannah record ${idx + 1}:`);
      console.log(`BidValue: ${bidValue}`);
      console.log(`Start: ${anticipatedStartDate}`);
      console.log(`End: ${anticipatedEndDate}`);
      console.log(`MonthsDiff: ${monthsDiff}`);
      console.log(`PortionPerMonth: ${portionPerMonth}`);
    }

    let current = new Date(anticipatedStartDate.getFullYear(), anticipatedStartDate.getMonth(), 1);

    for (let i = 0; i < monthsDiff; i++) {
      const monthName = current.toLocaleString('default', { month: 'short', year: 'numeric' });
      allMonths.add(monthName);

      if (!revenueByDivision[divisionName]) {
        revenueByDivision[divisionName] = {};
      }
      if (!revenueByDivision[divisionName][monthName]) {
        revenueByDivision[divisionName][monthName] = 0;
      }
      revenueByDivision[divisionName][monthName] += portionPerMonth;

      // Move to next month
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
  });

  // ✅ Sort and filter months after processing all records
  let sortedMonths = Array.from(allMonths).sort((a, b) => {
    const [monthA, yearA] = a.split(' ');
    const [monthB, yearB] = b.split(' ');
    const dateA = new Date(`${monthA} 1, ${yearA}`);
    const dateB = new Date(`${monthB} 1, ${yearB}`);
    return dateA - dateB;
  });

  sortedMonths = sortedMonths.filter(monthName => {
    const [month, year] = monthName.split(' ');
    const monthDate = new Date(`${month} 1, ${year}`);
    monthDate.setHours(0, 0, 0, 0);
    return monthDate >= new Date(today.getFullYear(), today.getMonth(), 1);
  });

  sortedMonths = sortedMonths.slice(0, 6);

  console.log("Filtered months (next six months):", sortedMonths);

  if (revenueByDivision['Savannah']) {
    console.log("Final Savannah revenueByDivision:", revenueByDivision['Savannah']);
    const total = Object.values(revenueByDivision['Savannah']).reduce((sum, val) => sum + val, 0);
    console.log(`Savannah total: ${total.toFixed(2)}`);
  }

  createRevenueChart(revenueByDivision, sortedMonths);
}

 function createRevenueChart(revenueByDivision, months) {
    // 👉 Get division names and sort them alphabetically
    const divisions = Object.keys(revenueByDivision).sort((a, b) => {
        return a.localeCompare(b);
    });

    const datasets = [];

const colors = [
  'rgba(0, 82, 155, 0.8)',   // Deep blue
  'rgba(230, 85, 13, 0.8)',  // Rich orange
  'rgba(49, 163, 84, 0.8)',  // Medium green
  'rgba(165, 15, 21, 0.8)',  // Deep red
  'rgba(106, 61, 154, 0.8)', // Royal purple
  'rgba(255, 127, 0, 0.8)',  // Bright orange
  'rgba(102, 194, 165, 0.8)',// Mint teal
  'rgba(120, 120, 120, 0.8)',// Neutral gray
  'rgba(153, 142, 60, 0.8)', // Olive gold
  'rgba(38, 139, 210, 0.8)'  // Soft sky blue
];

    divisions.forEach((division, index) => {
        const data = months.map(month => revenueByDivision[division][month] || 0);

        datasets.push({
            label: division,
            data: data,
            backgroundColor: colors[index % colors.length],
            borderWidth: 1
        });
    });

    const ctx = document.getElementById('expectedRevenueChart').getContext('2d');

    if (expectedRevenueChartInstance !== null) {
        expectedRevenueChartInstance.destroy();
    }

    expectedRevenueChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: datasets
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            stacked: true,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Month'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Expected Revenue'
                    },
                    ticks: {
                        callback: function (value) {
                            return `$${value.toLocaleString()}`;
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (tooltipItem) {
                            return `${tooltipItem.dataset.label}: $${tooltipItem.raw.toLocaleString()}`;
                        }
                    }
                },
                legend: {
                    // Chart.js legend uses dataset order, so sorting datasets does the trick!
                }
            }
        }
    });
}

    const allRecords = await fetchAllData();
    await processRecords(allRecords);

});
