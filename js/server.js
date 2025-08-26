const express = require('express');
const ftp = require('ftp');
const app = express();
const port = 4002; // Ensure this port is not already in use

const ftpConfig = {
    host: '174.108.187.19', 
    user: 'richard.mcgirt',        
    password: 'vanir',     
};

// Start server
app.listen(port, () => {
    console.log(`✅ Server running on http://localhost:${port}`);
});

// Fetch report from FTP
app.get('/fetch-report', (req, res) => {
    const client = new ftp();

    client.on('ready', () => {
        client.get('/downloads/SalesRegisterSummaryReport-1730994522-1793612095.csv', (err, stream) => {
            if (err) {
                console.error('❌ Error fetching FTP file:', err);
                res.status(500).send('Error fetching FTP file');
                client.end();
                return;
            }

            let fileContent = '';
            stream.on('data', chunk => (fileContent += chunk.toString()));
            stream.on('end', () => {
                res.send(fileContent); // Send the file content as response
                client.end();
            });
        });
    });

    client.connect(ftpConfig);
});

// **Delete a file from FTP**
app.delete('/delete-file', (req, res) => {
    const client = new ftp();
    const filePath = '/downloads/SalesRegisterSummaryReport-1730994522-1793612095.csv'; 

    client.on('ready', () => {
        client.delete(filePath, (err) => {
            if (err) {
                console.error('❌ Error deleting FTP file:', err);
                res.status(500).json({ message: 'Error deleting FTP file', error: err.message });
            } else {
                console.log(`✅ File deleted successfully: ${filePath}`);
                res.json({ message: `File deleted successfully: ${filePath}` });
            }
            client.end();
        });
    });

    client.connect(ftpConfig);
});
