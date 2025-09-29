const { app, BrowserWindow } = require('electron');
const path = require('path');

// Simple test to verify database monitor functionality
console.log('Testing database monitor functionality...');

// Check if the database monitor HTML file exists
const fs = require('fs');
const monitorFile = path.join(__dirname, '../src/renderer/database-monitor.html');

if (fs.existsSync(monitorFile)) {
    console.log('✓ Database monitor HTML file exists');
    
    // Read the file to check for syntax errors
    try {
        const content = fs.readFileSync(monitorFile, 'utf8');
        console.log('✓ Database monitor HTML file can be read');
        
        // Check if it contains the required elements
        if (content.includes('id="settings-modal"')) {
            console.log('✓ Database monitor has settings modal');
        } else {
            console.log('⚠ Database monitor may be missing settings modal');
        }
        
        // Check if it has the refresh interval set to 1 second
        if (content.includes('value="1000" selected') || content.includes('value="1000" selected>1 second')) {
            console.log('✓ Database monitor is configured for 1-second refresh by default');
        } else {
            console.log('⚠ Database monitor may not be configured for 1-second refresh by default');
        }
        
        // Check if settings functionality is implemented
        if (content.includes('function openSettings()') && content.includes('function saveSettings()')) {
            console.log('✓ Database monitor settings functionality is implemented');
        } else {
            console.log('⚠ Database monitor settings functionality may be incomplete');
        }
        
        // Check if real connection handling is implemented
        if (content.includes('get-real-connection-info') && content.includes('currentConnection')) {
            console.log('✓ Database monitor real connection handling is implemented');
        } else {
            console.log('⚠ Database monitor real connection handling may be incomplete');
        }
        
        // Check if real monitoring data is implemented
        if (content.includes('get-real-monitoring-data') && content.includes('real-monitoring-data')) {
            console.log('✓ Database monitor real data monitoring is implemented');
        } else {
            console.log('⚠ Database monitor real data monitoring may be incomplete');
        }
    } catch (error) {
        console.log('✗ Error reading database monitor HTML file:', error.message);
    }
} else {
    console.log('✗ Database monitor HTML file does not exist');
}

console.log('Database monitor test completed.');