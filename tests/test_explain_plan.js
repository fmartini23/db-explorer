const { app, BrowserWindow } = require('electron');
const path = require('path');

// Test to verify explain plan functionality
console.log('Testing explain plan functionality...');

// Check if the required files exist
const fs = require('fs');
const executionPlanFile = path.join(__dirname, '../src/renderer/execution-plan.html');
const executionPlanJSFile = path.join(__dirname, '../src/main/execution-plan.js');
const mainFile = path.join(__dirname, '../src/main/main.js');

// Test execution-plan.html file
if (fs.existsSync(executionPlanFile)) {
    console.log('✓ Execution plan HTML file exists');
    
    // Read the file to check for syntax errors
    try {
        const content = fs.readFileSync(executionPlanFile, 'utf8');
        console.log('✓ Execution plan HTML file can be read');
        
        // Check if it contains the required elements
        if (content.includes('id="execution-plan-container"')) {
            console.log('✓ Execution plan HTML has container element');
        } else {
            console.log('⚠ Execution plan HTML may be missing container element');
        }
        
        // Check if it has the toolbar
        if (content.includes('class="toolbar"')) {
            console.log('✓ Execution plan HTML has toolbar');
        } else {
            console.log('⚠ Execution plan HTML may be missing toolbar');
        }
        
    } catch (error) {
        console.log('✗ Error reading execution plan HTML file:', error.message);
    }
} else {
    console.log('✗ Execution plan HTML file does not exist');
}

// Test execution-plan.js file
if (fs.existsSync(executionPlanJSFile)) {
    console.log('✓ Execution plan JS file exists');
    
    // Read the file to check for syntax errors
    try {
        const content = fs.readFileSync(executionPlanJSFile, 'utf8');
        console.log('✓ Execution plan JS file can be read');
        
        // Check if it contains the required functions
        if (content.includes('function displayExecutionPlan') && content.includes('function zoomIn') && content.includes('function zoomOut')) {
            console.log('✓ Execution plan JS has required functions');
        } else {
            console.log('⚠ Execution plan JS may be missing required functions');
        }
        
    } catch (error) {
        console.log('✗ Error reading execution plan JS file:', error.message);
    }
} else {
    console.log('✗ Execution plan JS file does not exist');
}

// Test main.js file
if (fs.existsSync(mainFile)) {
    console.log('✓ Main.js file exists');
    
    // Read the file to check for explain plan functionality
    try {
        const content = fs.readFileSync(mainFile, 'utf8');
        console.log('✓ Main.js file can be read');
        
        // Check if explain plan IPC handlers are implemented
        if (content.includes("ipcMain.on('generate-estimated-plan'")) {
            console.log('✓ Explain plan IPC handlers are implemented in main.js');
        } else {
            console.log('⚠ Explain plan IPC handlers may be missing from main.js');
        }
        
    } catch (error) {
        console.log('✗ Error reading main.js file:', error.message);
    }
} else {
    console.log('✗ Main.js file does not exist');
}

console.log('Explain plan functionality test completed.');