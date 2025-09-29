const { app, BrowserWindow } = require('electron');
const path = require('path');

// Test to verify that fake data has been removed
console.log('Testing that fake data has been removed...');

// Check if the database monitor HTML file exists
const fs = require('fs');
const monitorFile = path.join(__dirname, '../src/renderer/database-monitor.html');
const mainFile = path.join(__dirname, '../src/main/main.js');

// Test database monitor HTML file
if (fs.existsSync(monitorFile)) {
    console.log('✓ Database monitor HTML file exists');
    
    // Read the file to check for fake data
    try {
        const content = fs.readFileSync(monitorFile, 'utf8');
        console.log('✓ Database monitor HTML file can be read');
        
        // Check if fake data functions have been removed
        if (!content.includes("ipcRenderer.send('get-monitoring-data')") && !content.includes("event.reply('monitoring-data'")) {
            console.log('✓ Fake data functions have been removed from database monitor HTML');
        } else {
            console.log('⚠ Fake data functions may still exist in database monitor HTML');
        }
        
        // Check if mock data event listeners have been removed
        if (!content.includes('database-stats') && !content.includes('process-list') && !content.includes('table-stats')) {
            console.log('✓ Mock data event listeners have been removed from database monitor HTML');
        } else {
            console.log('⚠ Mock data event listeners may still exist in database monitor HTML');
        }
        
    } catch (error) {
        console.log('✗ Error reading database monitor HTML file:', error.message);
    }
} else {
    console.log('✗ Database monitor HTML file does not exist');
}

// Test main.js file
if (fs.existsSync(mainFile)) {
    console.log('✓ Main.js file exists');
    
    // Read the file to check for fake data
    try {
        const content = fs.readFileSync(mainFile, 'utf8');
        console.log('✓ Main.js file can be read');
        
        // Check if fake data functions have been removed
        if (!content.includes("ipcMain.on('get-monitoring-data'") && !content.includes('generateMockMonitoringData')) {
            console.log('✓ Fake data functions have been removed from main.js');
        } else {
            console.log('⚠ Fake data functions may still exist in main.js');
        }
        
        // Check if mock data IPC handlers have been removed
        if (!content.includes('database-stats') && !content.includes('process-list') && !content.includes('table-stats')) {
            console.log('✓ Mock data IPC handlers have been removed from main.js');
        } else {
            console.log('⚠ Mock data IPC handlers may still exist in main.js');
        }
        
    } catch (error) {
        console.log('✗ Error reading main.js file:', error.message);
    }
} else {
    console.log('✗ Main.js file does not exist');
}

console.log('Fake data removal test completed.');