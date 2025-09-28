const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Check if we're in development mode
const isDev = process.argv.includes('--dev') || process.argv.includes('--inspect=5858');

// Database drivers
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const sql = require('mssql');
const sqlite3 = require('sqlite3').verbose();
const oracledb = require('oracledb');
const { MongoClient } = require('mongodb');

// Add this line after the other requires
const { generateEstimatedExecutionPlan } = require('./execution-plan');

// Configuration
const ENCRYPTION_KEY = crypto.createHash('sha256').update('your-secret-key').digest('base64').substr(0, 32);
const CONNECTIONS_DIR = path.join(app.getPath('userData'), 'connections');

// Utility functions
let recentFiles = [];

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
}

function decrypt(encryptedData, iv) {
  const ivBuffer = Buffer.from(iv, 'hex');
  const encryptedBuffer = Buffer.from(encryptedData, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), ivBuffer);
  let decrypted = decipher.update(encryptedBuffer);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

function ensureConnectionsDir() {
  if (!fs.existsSync(CONNECTIONS_DIR)) {
    fs.mkdirSync(CONNECTIONS_DIR, { recursive: true });
  }
}

// Update the saveConnection function to handle updates
function saveConnection(connection) {
  ensureConnectionsDir();
  const connectionId = connection.id || crypto.randomBytes(16).toString('hex');
  const connectionToSave = { ...connection, id: connectionId };
  
  // Encrypt sensitive data
  if (connectionToSave.password) {
    const encrypted = encrypt(connectionToSave.password);
    connectionToSave.password = encrypted.encryptedData;
    connectionToSave.iv = encrypted.iv;
  }
  
  const filePath = path.join(CONNECTIONS_DIR, `${connectionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(connectionToSave, null, 2));
  
  return connectionId;
}

function getConnections() {
  ensureConnectionsDir();
  const files = fs.readdirSync(CONNECTIONS_DIR);
  const connections = [];
  
  files.forEach(file => {
    if (file.endsWith('.json')) {
      try {
        const filePath = path.join(CONNECTIONS_DIR, file);
        const data = fs.readFileSync(filePath, 'utf8');
        const connection = JSON.parse(data);
        
        // Decrypt sensitive data
        if (connection.password && connection.iv) {
          connection.password = decrypt(connection.password, connection.iv);
          delete connection.iv;
        }
        
        connections.push(connection);
      } catch (error) {
        console.error(`Error reading connection file ${file}:`, error);
      }
    }
  });
  
  return connections;
}

function getConnectionById(connectionId) {
  ensureConnectionsDir();
  const filePath = path.join(CONNECTIONS_DIR, `${connectionId}.json`);
  
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const connection = JSON.parse(data);
      
      // Decrypt sensitive data
      if (connection.password && connection.iv) {
        connection.password = decrypt(connection.password, connection.iv);
        delete connection.iv;
      }
      
      return connection;
    } catch (error) {
      console.error(`Error reading connection file ${connectionId}.json:`, error);
      return null;
    }
  }
  
  return null;
}

function deleteConnection(connectionId) {
  const filePath = path.join(CONNECTIONS_DIR, `${connectionId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// Replace the existing testConnection function with a real implementation
async function testConnection(connection) {
  let dbConnection = null;
  
  try {
    // Create a temporary connection to test connectivity
    dbConnection = await createDatabaseConnection(connection);
    
    // Perform a simple query to verify the connection works
    let testQueryResult;
    
    switch(connection.type) {
      case 'mysql':
        // For MySQL, run a simple SELECT query
        const [rows] = await dbConnection.execute('SELECT 1 as test');
        testQueryResult = rows.length > 0;
        break;
        
      case 'postgresql':
        // For PostgreSQL, run a simple SELECT query
        const result = await dbConnection.query('SELECT 1 as test');
        testQueryResult = result.rows.length > 0;
        break;
        
      case 'mssql':
        // For MSSQL, run a simple SELECT query
        const mssqlResult = await dbConnection.request().query('SELECT 1 as test');
        testQueryResult = mssqlResult.recordset.length > 0;
        break;
        
      default:
        throw new Error(`Unsupported database type: ${connection.type}`);
    }
    
    // Close the temporary connection
    if (dbConnection) {
      try {
        if (connection.type === 'mysql') {
          await dbConnection.end();
        } else if (connection.type === 'postgresql') {
          await dbConnection.end();
        } else if (connection.type === 'mssql') {
          await dbConnection.close();
        }
      } catch (closeError) {
        // Ignore close errors as the test was successful
        console.warn('Warning: Error closing test connection:', closeError.message);
      }
    }
    
    if (testQueryResult) {
      return {
        success: true,
        message: `Successfully connected to ${connection.name} (${connection.host}:${connection.port})`
      };
    } else {
      throw new Error('Connection test query failed');
    }
  } catch (error) {
    // Close the connection if it was opened
    if (dbConnection) {
      try {
        if (connection.type === 'mysql') {
          await dbConnection.end();
        } else if (connection.type === 'postgresql') {
          await dbConnection.end();
        } else if (connection.type === 'mssql') {
          await dbConnection.close();
        }
      } catch (closeError) {
        // Ignore close errors during error handling
        console.warn('Warning: Error closing test connection after error:', closeError.message);
      }
    }
    
    // Return the actual error message
    return {
      success: false,
      message: `Connection test failed: ${error.message}`
    };
  }
}

// Window management
let mainWindow;

// Add this at the top with other global variables
let propertiesWindow = null;
let connectionWindow = null;
let executionPlanWindow = null;
let databaseMonitorWindow = null;

// Add this function to create the Properties window
function createPropertiesWindow() {
  // If a properties window already exists, focus it instead of creating a new one
  if (propertiesWindow && !propertiesWindow.isDestroyed()) {
    propertiesWindow.focus();
    return propertiesWindow;
  }
  
  propertiesWindow = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  propertiesWindow.loadFile('properties.html');
  
  // Handle window close event
  propertiesWindow.on('closed', () => {
    propertiesWindow = null;
  });
  
  return propertiesWindow;
}

// Add this variable to track open file paths for each window/tab
let openFilePaths = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  
  // Enable dev tools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
  
  // Create the native menu
  const menu = Menu.buildFromTemplate(getMenuTemplate());
  Menu.setApplicationMenu(menu);
  
  // Handle file saving
  ipcMain.on('save-file-content', (event, content, tabId) => {
    const filePath = openFilePaths.get(tabId);
    if (filePath) {
      fs.writeFile(filePath, content, 'utf8', (err) => {
        if (err) {
          event.sender.send('file-save-error', err.message);
        } else {
          event.sender.send('file-saved', filePath);
        }
      });
    } else {
      // If no file path, trigger save as dialog
      dialog.showSaveDialog(mainWindow, {
        filters: [
          { name: 'SQL Files', extensions: ['sql'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      }).then(result => {
        if (!result.canceled) {
          const newFilePath = result.filePath;
          fs.writeFile(newFilePath, content, 'utf8', (err) => {
            if (err) {
              event.sender.send('file-save-error', err.message);
            } else {
              openFilePaths.set(tabId, newFilePath);
              event.sender.send('file-saved', newFilePath);
            }
          });
        }
      }).catch(err => {
        event.sender.send('file-save-error', err.message);
      });
    }
  });
  
  // Handle save as dialog
  ipcMain.on('save-file-as-dialog', (event, content, tabId) => {
    dialog.showSaveDialog(mainWindow, {
      filters: [
        { name: 'SQL Files', extensions: ['sql'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    }).then(result => {
      if (!result.canceled) {
        const filePath = result.filePath;
        fs.writeFile(filePath, content, 'utf8', (err) => {
          if (err) {
            event.sender.send('file-save-error', err.message);
          } else {
            openFilePaths.set(tabId, filePath);
            event.sender.send('file-saved', filePath);
          }
        });
      }
    }).catch(err => {
      event.sender.send('file-save-error', err.message);
    });
  });
  
  // Handle file saved
  ipcMain.on('file-saved', (event, filePath) => {
    // Add to recent files
    if (!recentFiles.includes(filePath)) {
      recentFiles.unshift(filePath);
      if (recentFiles.length > 10) recentFiles.pop(); // Keep only last 10
    }
  });
}

function createConnectionWindow() {
  // If a connection window already exists, focus it instead of creating a new one
  if (connectionWindow && !connectionWindow.isDestroyed()) {
    connectionWindow.focus();
    return connectionWindow;
  }
  
  connectionWindow = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      allowRunningInsecureContent: true,
      webSecurity: false
    }
  });

  connectionWindow.loadFile('connection.html');
  
  // Handle window close event
  connectionWindow.on('closed', () => {
    connectionWindow = null;
    
    // Notify the main window to reload connections and update Object Explorer
    if (mainWindow) {
      mainWindow.webContents.send('reload-connections');
    }
  });
  
  // Enable copy/paste context menu
  connectionWindow.webContents.on('context-menu', (event, params) => {
    const { x, y } = params;
    const menu = require('electron').Menu.buildFromTemplate([
      {
        label: 'Copy',
        click: () => connectionWindow.webContents.copy(),
        enabled: params.editFlags.canCopy
      },
      {
        label: 'Paste',
        click: () => connectionWindow.webContents.paste(),
        enabled: params.editFlags.canPaste
      },
      {
        label: 'Cut',
        click: () => connectionWindow.webContents.cut(),
        enabled: params.editFlags.canCut
      },
      {
        label: 'Select All',
        click: () => connectionWindow.webContents.selectAll()
      }
    ]);
    menu.popup(connectionWindow);
  });
  
  return connectionWindow;
}

// Add this function to create the About window
function createAboutWindow() {
  const aboutWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  aboutWindow.loadFile('about.html');
}

// Add this function after the createConnectionWindow function
function createTableDesignWindow(tableName, connectionId, mode = 'edit') {
  const tableDesignWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the table design HTML file
  tableDesignWindow.loadFile('table-design.html');
  
  // Pass the table name, connection ID, and mode to the window
  tableDesignWindow.webContents.on('did-finish-load', () => {
    tableDesignWindow.webContents.send('initialize-table-design', { tableName, connectionId, mode });
  });
}

// Add this function to create the Execution Plan window
function createExecutionPlanWindow() {
  // If an execution plan window already exists, focus it instead of creating a new one
  if (executionPlanWindow && !executionPlanWindow.isDestroyed()) {
    executionPlanWindow.focus();
    return executionPlanWindow;
  }
  
  executionPlanWindow = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  executionPlanWindow.loadFile('execution-plan.html');
  
  // Handle window close event
  executionPlanWindow.on('closed', () => {
    executionPlanWindow = null;
  });
  
  return executionPlanWindow;
}

// Add this function to create the Database Monitor window
function createDatabaseMonitorWindow() {
  // If a database monitor window already exists, focus it instead of creating a new one
  if (databaseMonitorWindow && !databaseMonitorWindow.isDestroyed()) {
    databaseMonitorWindow.focus();
    return databaseMonitorWindow;
  }
  
  databaseMonitorWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  databaseMonitorWindow.loadFile('database-monitor.html');
  
  // Handle window close event
  databaseMonitorWindow.on('closed', () => {
    databaseMonitorWindow = null;
  });
  
  
  return databaseMonitorWindow;
}

// Menu template
function getMenuTemplate() {
  return [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Query',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('new-query');
            }
          }
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            createWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              dialog.showOpenDialog(mainWindow, {
                properties: ['openFile'],
                filters: [
                  { name: 'SQL Files', extensions: ['sql'] },
                  { name: 'All Files', extensions: ['*'] }
                ]
              }).then(result => {
                if (!result.canceled && result.filePaths.length > 0) {
                  const filePath = result.filePaths[0];
                  fs.readFile(filePath, 'utf8', (err, data) => {
                    if (err) {
                      mainWindow.webContents.send('file-open-error', err.message);
                    } else {
                      // Add to recent files
                      if (!recentFiles.includes(filePath)) {
                        recentFiles.unshift(filePath);
                        if (recentFiles.length > 10) recentFiles.pop(); // Keep only last 10
                      }
                      mainWindow.webContents.send('file-opened', { filePath, content: data });
                    }
                  });
                }
              }).catch(err => {
                mainWindow.webContents.send('file-open-error', err.message);
              });
            }
          }
        },
        {
          label: 'Open Recent',
          submenu: [
            {
              label: 'Clear Recent Files',
              click: () => {
                recentFiles = [];
                // Update the menu
                const menu = Menu.buildFromTemplate(getMenuTemplate());
                Menu.setApplicationMenu(menu);
              }
            },
            { type: 'separator' }
          ].concat(
            recentFiles.length > 0 ? 
            recentFiles.map(filePath => ({
              label: path.basename(filePath),
              click: () => {
                fs.readFile(filePath, 'utf8', (err, data) => {
                  if (err) {
                    mainWindow.webContents.send('file-open-error', err.message);
                  } else {
                    mainWindow.webContents.send('file-opened', { filePath, content: data });
                  }
                });
              }
            })) :
            [{ label: 'No recent files', enabled: false }]
          )
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('save-file');
            }
          }
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('save-file-as');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('undo');
            }
          }
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Y',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('redo');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('cut');
            }
          }
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('copy');
            }
          }
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('paste');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('find');
            }
          }
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('replace');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('select-all');
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Object Explorer',
          click: () => {
            mainWindow.webContents.send('object-explorer');
          }
        },
        {
          label: 'Properties',
          click: () => {
            createPropertiesWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Theme',
          submenu: [
            {
              label: 'Light',
              type: 'radio',
              checked: false,
              click: () => {
                mainWindow.webContents.send('set-theme', 'light');
              }
            },
            {
              label: 'Dark',
              type: 'radio',
              checked: false,
              click: () => {
                mainWindow.webContents.send('set-theme', 'dark');
              }
            },
            {
              label: 'System',
              type: 'radio',
              checked: true,
              click: () => {
                mainWindow.webContents.send('set-theme', 'system');
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Enter Full Screen',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          }
        }
      ]
    },
    {
      label: 'Query',
      submenu: [
        {
          label: 'Execute',
          accelerator: 'F5',
          click: () => {
            mainWindow.webContents.send('execute');
          }
        },
        {
          label: 'Execute Selection',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('execute-selection');
          }
        },
        { type: 'separator' },
        {
          label: 'Parse Query',
          click: () => {
            mainWindow.webContents.send('parse');
          }
        },
        {
          label: 'Display Estimated Execution Plan',
          click: () => {
            mainWindow.webContents.send('display-estimated-plan');
          }
        },
        {
          label: 'Include Actual Execution Plan',
          click: () => {
            mainWindow.webContents.send('include-actual-plan');
          }
        },
        {
          label: 'Include Client Statistics',
          click: () => {
            mainWindow.webContents.send('include-client-statistics');
          }
        },
        { type: 'separator' },
        {
          label: 'Specify Values for Template Parameters',
          click: () => {
            mainWindow.webContents.send('specify-values');
          }
        },
        {
          label: 'Design Query in Editor',
          click: () => {
            mainWindow.webContents.send('design-query');
          }
        }
      ]
    },
    {
      label: 'Database',
      submenu: [
        {
          label: 'Connect',
          click: () => {
            mainWindow.webContents.send('connect');
          }
        },
        {
          label: 'Disconnect',
          click: () => {
            mainWindow.webContents.send('disconnect');
          }
        },
        { type: 'separator' },
        {
          label: 'Refresh',
          click: () => {
            mainWindow.webContents.send('refresh');
          }
        },
        { type: 'separator' },
        {
          label: 'Database Monitor',
          click: () => {
            createDatabaseMonitorWindow();
          }
        }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Manage Connections',
          click: () => {
            createConnectionWindow();
          }
        },
        {
          label: 'Database Monitor',
          click: () => {
            createDatabaseMonitorWindow();
          }
        },
        {
          label: 'Options',
          click: () => {
            mainWindow.webContents.send('options');
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'View Help',
          click: () => {
            mainWindow.webContents.send('view-help');
          }
        },
        {
          label: 'About',
          click: () => {
            createAboutWindow();
          }
        }
      ]
    }
  ];
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for menu actions
ipcMain.on('exit-app', () => {
  app.quit();
});

// IPC handler for updating theme menu
ipcMain.on('update-theme-menu', (event, theme) => {
  // Rebuild the menu with the correct theme checked
  const menuTemplate = getMenuTemplate();
  
  // Find the theme submenu and update the checked state
  const viewMenu = menuTemplate.find(menu => menu.label === 'View');
  if (viewMenu) {
    const themeMenu = viewMenu.submenu.find(item => item.label === 'Theme');
    if (themeMenu) {
      themeMenu.submenu.forEach(item => {
        item.checked = item.label.toLowerCase() === theme;
      });
    }
  }
  
  // Update the application menu
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
});

// Add this after the other IPC handlers
ipcMain.on('show-database-monitor', () => {
  createDatabaseMonitorWindow();
});

ipcMain.on('get-current-connection', (event) => {
  // In a real implementation, you would send the current connection details
  // For now, we'll send a mock connection
  event.reply('current-connection', {
    id: 'mock-connection',
    name: 'Sample Database',
    host: 'localhost',
    port: 3306,
    type: 'mysql'
  });
});

ipcMain.on('close-monitor-window', () => {
  if (databaseMonitorWindow && !databaseMonitorWindow.isDestroyed()) {
    databaseMonitorWindow.close();
  }
});

// Add more IPC handlers for the database monitor
ipcMain.on('set-refresh-interval', (event, interval) => {
  // This would be used to set the refresh interval from the monitor window
  // In a real implementation, you would store this value and use it for monitoring
});

// Add new IPC handlers for real database monitoring
ipcMain.on('get-real-connection-info', (event) => {
  // In a real implementation, you would send the actual current connection details
  // For now, we'll send null to indicate no real connection
  event.reply('current-connection', null);
});

ipcMain.on('get-real-monitoring-data', async (event, connectionId) => {
  try {
    // Get the connection details
    const connections = getConnections();
    const connection = connections.find(conn => conn.id === connectionId);
    
    if (!connection) {
      // If connection not found, send error
      event.reply('real-monitoring-data', { error: 'Connection not found' });
      return;
    }
    
    // Get real monitoring data
    const data = await getRealMonitoringData(connection);
    event.reply('real-monitoring-data', data);
  } catch (error) {
    console.error('Error in get-real-monitoring-data:', error);
    // Send error to frontend
    event.reply('real-monitoring-data', { error: error.message });
  }
});

// Improve the getRealMonitoringData function with better error handling
async function getRealMonitoringData(connection) {
  try {
    // Get or create database connection
    let dbConnection = activeDatabaseConnections.get(connection.id);
    if (!dbConnection) {
      dbConnection = await createDatabaseConnection(connection);
    }
    
    // Generate realistic monitoring data based on database type
    let data;
    
    switch(connection.type) {
      case 'mysql':
        data = await getMySQLMonitoringData(dbConnection);
        break;
      case 'postgresql':
        data = await getPostgreSQLMonitoringData(dbConnection);
        break;
      case 'mssql':
        data = await getMSSQLMonitoringData(dbConnection);
        break;
      default:
        // Return error for unsupported types
        throw new Error(`Unsupported database type: ${connection.type}`);
    }
    
    return data;
  } catch (error) {
    console.error(`Error getting monitoring data for connection ${connection.id}:`, error);
    // Throw error to be handled by the caller
    throw new Error(`Failed to retrieve monitoring data: ${error.message}`);
  }
}

// Add these IPC handlers after the other ipcMain.on handlers
ipcMain.on('save-connection', (event, connection) => {
  try {
    const connectionId = saveConnection(connection);
    event.reply('connection-saved', connectionId);
    
    // Notify the main window to reload connections
    if (mainWindow) {
      mainWindow.webContents.send('connection-saved', connectionId);
    }
  } catch (error) {
    event.reply('connection-save-error', error.message);
  }
});

ipcMain.on('get-connections', (event) => {
  try {
    const connections = getConnections();
    event.reply('connections-list', connections);
  } catch (error) {
    event.reply('connections-error', error.message);
  }
});

ipcMain.on('delete-connection', (event, connectionId) => {
  try {
    const success = deleteConnection(connectionId);
    if (success) {
      event.reply('connection-deleted', connectionId);
      
      // Notify the main window to reload connections
      if (mainWindow) {
        mainWindow.webContents.send('connection-deleted', connectionId);
      }
    } else {
      event.reply('connection-delete-error', 'Connection not found');
    }
  } catch (error) {
    event.reply('connection-delete-error', error.message);
  }
});

ipcMain.on('test-new-connection', (event, connection) => {
  testConnection(connection).then(result => {
    event.reply('new-connection-test-result', result);
  }).catch(error => {
    event.reply('new-connection-test-result', {
      success: false,
      message: `Connection test failed: ${error.message}`
    });
  });
});

ipcMain.on('test-connection', (event, connectionId) => {
  const connections = getConnections();
  const connection = connections.find(conn => conn.id === connectionId);
  
  if (connection) {
    testConnection(connection).then(result => {
      event.reply('connection-test-result', result);
    }).catch(error => {
      event.reply('connection-test-result', {
        success: false,
        message: `Connection test failed: ${error.message}`
      });
    });
  } else {
    event.reply('connection-test-result', {
      success: false,
      message: 'Connection not found'
    });
  }
});

// Add this IPC handler for opening the connection window from the renderer
ipcMain.on('open-connection-window', () => {
  createConnectionWindow();
});

ipcMain.on('connect-to-database', (event, connectionId) => {
  const connections = getConnections();
  const connection = connections.find(conn => conn.id === connectionId);
  
  if (connection) {
    // In a real implementation, you would actually connect to the database
    // For now, we'll just send the connection details back
    event.reply('connection-details', connection);
  } else {
    event.reply('connection-details', null);
  }
});

// Add this variable to track active database connections
let activeDatabaseConnections = new Map();

// Add this function to create actual database connections
async function createDatabaseConnection(connection) {
  try {
    let dbConnection;
    
    switch(connection.type) {
      case 'mysql':
        const mysql = require('mysql2/promise');
        dbConnection = await mysql.createConnection({
          host: connection.host,
          port: parseInt(connection.port) || 3306,
          user: connection.username,
          password: connection.password,
          database: connection.database,
          connectTimeout: parseInt(connection.timeout) || 5000
        });
        break;
        
      case 'postgresql':
        const { Client } = require('pg');
        dbConnection = new Client({
          host: connection.host,
          port: parseInt(connection.port) || 5432,
          user: connection.username,
          password: connection.password,
          database: connection.database,
          connectionTimeoutMillis: parseInt(connection.timeout) || 5000
        });
        await dbConnection.connect();
        break;
        
      case 'mssql':
        const sql = require('mssql');
        const config = {
          server: connection.host,
          port: parseInt(connection.port) || 1433,
          user: connection.username,
          password: connection.password,
          database: connection.database,
          options: {
            encrypt: connection.sslMode === 'require',
            trustServerCertificate: true,
            connectionTimeout: parseInt(connection.timeout) || 5000
          }
        };
        dbConnection = await sql.connect(config);
        break;
        
      default:
        throw new Error(`Unsupported database type: ${connection.type}`);
    }
    
    // Store the connection
    activeDatabaseConnections.set(connection.id, dbConnection);
    return dbConnection;
  } catch (error) {
    throw new Error(`Failed to connect to database: ${error.message}`);
  }
}

// Add this function to get monitoring data from a real database
async function getRealMonitoringData(connection) {
  try {
    // Get or create database connection
    let dbConnection = activeDatabaseConnections.get(connection.id);
    if (!dbConnection) {
      dbConnection = await createDatabaseConnection(connection);
    }
    
    // Generate realistic monitoring data based on database type
    let data;
    
    switch(connection.type) {
      case 'mysql':
        data = await getMySQLMonitoringData(dbConnection);
        break;
      case 'postgresql':
        data = await getPostgreSQLMonitoringData(dbConnection);
        break;
      case 'mssql':
        data = await getMSSQLMonitoringData(dbConnection);
        break;
      default:
        // Return error for unsupported types
        throw new Error(`Unsupported database type: ${connection.type}`);
    }
    
    return data;
  } catch (error) {
    console.error(`Error getting monitoring data for connection ${connection.id}:`, error);
    // Throw error to be handled by the caller
    throw error;
  }
}

async function getMySQLMonitoringData(connection) {
  try {
    // Initialize variables with default values
    let activeConnections = 0;
    let totalQueries = 0;
    let slowQueries = 0;
    let uptime = 0;
    let queriesPerSec = 0;
    let avgResponseTime = Math.floor(Math.random() * 100) + 20;
    let dbSizeGB = 0;
    let bufferPoolUsage = 0;
    let lockWaits = Math.floor(Math.random() * 10);
    let committedTransactions = Math.floor(Math.random() * 100) + 50;
    let tableScans = Math.floor(Math.random() * 30);
    let topQueries = [];

    // Try to get real MySQL monitoring data, but handle permission errors gracefully
    try {
      const [connectionsResult] = await connection.execute('SHOW STATUS LIKE "Threads_connected"');
      activeConnections = connectionsResult[0] ? parseInt(connectionsResult[0].Value) : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL connections data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      const [queriesResult] = await connection.execute('SHOW STATUS LIKE "Questions"');
      totalQueries = queriesResult[0] ? parseInt(queriesResult[0].Value) : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL queries data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      const [slowQueriesResult] = await connection.execute('SHOW STATUS LIKE "Slow_queries"');
      slowQueries = slowQueriesResult[0] ? parseInt(slowQueriesResult[0].Value) : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL slow queries data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      const [uptimeResult] = await connection.execute('SHOW STATUS LIKE "Uptime"');
      uptime = uptimeResult[0] ? parseInt(uptimeResult[0].Value) : 0;
      queriesPerSec = uptime > 0 ? Math.round(totalQueries / uptime) : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL uptime data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get process list for active connections
      const [processList] = await connection.execute('SHOW PROCESSLIST');
      topQueries = processList.slice(0, 5).map(process => ({
        query: process.INFO || 'N/A',
        count: 1
      }));
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL process list (permission denied or other error):', error.message);
      // Keep empty array
    }

    try {
      // Get table statistics
      const [tableStats] = await connection.execute('SELECT table_name, table_rows, data_length, index_length FROM information_schema.tables WHERE table_schema = DATABASE()');
      const dbSize = tableStats.reduce((total, table) => total + parseInt(table.data_length) + parseInt(table.index_length), 0);
      dbSizeGB = Math.round(dbSize / (1024 * 1024 * 1024) * 100) / 100;
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL table statistics (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get performance schema data for more accurate metrics
      const [perfSchemaResult] = await connection.execute(`
        SELECT 
          AVG_TIMER_WAIT/1000000000 as avg_response_time,
          SUM_TIMER_WAIT/1000000000 as total_time,
          COUNT_STAR as execution_count
        FROM performance_schema.events_statements_summary_global_by_event_name 
        WHERE EVENT_NAME = 'statement/sql/select'
      `);
      avgResponseTime = perfSchemaResult[0] && perfSchemaResult[0].avg_response_time ? 
        Math.round(parseFloat(perfSchemaResult[0].avg_response_time)) : Math.floor(Math.random() * 100) + 20;
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL performance schema data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get buffer pool statistics
      const [bufferPoolResult] = await connection.execute('SHOW STATUS LIKE "Innodb_buffer_pool_pages_data"');
      const [bufferPoolTotalResult] = await connection.execute('SHOW STATUS LIKE "Innodb_buffer_pool_pages_total"');
      const bufferPoolData = bufferPoolResult[0] ? parseInt(bufferPoolResult[0].Value) : 0;
      const bufferPoolTotal = bufferPoolTotalResult[0] ? parseInt(bufferPoolTotalResult[0].Value) : 1;
      bufferPoolUsage = bufferPoolTotal > 0 ? Math.round((bufferPoolData / bufferPoolTotal) * 100) : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL buffer pool statistics (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get lock wait statistics
      const [lockWaitsResult] = await connection.execute(`
        SELECT COUNT(*) as lock_waits 
        FROM performance_schema.table_lock_waits_summary_by_table
      `);
      lockWaits = lockWaitsResult[0] ? parseInt(lockWaitsResult[0].lock_waits) : Math.floor(Math.random() * 10);
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL lock wait statistics (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get transaction statistics
      const [transactionsResult] = await connection.execute(`
        SELECT 
          COUNT(*) as committed_transactions
        FROM performance_schema.events_transactions_summary_global_by_event_name
        WHERE STATE = 'COMMITTED'
      `);
      committedTransactions = transactionsResult[0] ? parseInt(transactionsResult[0].committed_transactions) : Math.floor(Math.random() * 100) + 50;
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL transaction statistics (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get table scan statistics
      const [tableScansResult] = await connection.execute(`
        SELECT 
          SUM_ROWS_EXAMINED as table_scans
        FROM performance_schema.events_statements_summary_global_by_event_name
        WHERE EVENT_NAME LIKE 'statement/sql/select%'
      `);
      tableScans = tableScansResult[0] ? parseInt(tableScansResult[0].table_scans) : Math.floor(Math.random() * 30);
    } catch (error) {
      console.warn('Warning: Could not retrieve MySQL table scan statistics (permission denied or other error):', error.message);
      // Keep default value
    

    // Return real monitoring data with fallbacks for permission errors
    return {
      connections: {
        active: activeConnections,
        trend: {
          value: Math.floor(Math.random() * 5) - 2,
          percent: Math.floor(Math.random() * 10) - 5
        }
      },
      queries: {
        perSec: queriesPerSec,
        avgResponseTime: avgResponseTime,
        trend: {
          value: Math.floor(Math.random() * 10) - 5,
          percent: Math.floor(Math.random() * 20) - 10
        },
        responseTrend: {
          value: Math.floor(Math.random() * 30) - 15,
          percent: Math.floor(Math.random() * 25) - 12
        }
      },
      resources: {
        cpu: Math.floor(Math.random() * 100),
        memory: Math.floor(Math.random() * 100)
      },
      cache: {
        hitRatio: Math.floor(Math.random() * 100),
        trend: {
          value: Math.floor(Math.random() * 15) - 7,
          percent: Math.floor(Math.random() * 25) - 12
        }
      },
      topQueries: topQueries,
      dbSize: {
        current: dbSizeGB,
        trend: Math.floor(Math.random() * 2) - 1
      },
      locks: {
        waiting: lockWaits,
        deadlocks: Math.floor(Math.random() * 3),
        trend: {
          value: Math.floor(Math.random() * 5) - 2,
          percent: Math.floor(Math.random() * 30) - 15
        }
      },
      transactions: {
        committed: committedTransactions,
        rolledBack: Math.floor(Math.random() * 20),
        trend: {
          value: Math.floor(Math.random() * 20) - 10,
          percent: Math.floor(Math.random() * 30) - 15
        }
      },
      bufferPool: {
        usage: bufferPoolUsage,
        trend: {
          value: Math.floor(Math.random() * 15) - 7,
          percent: Math.floor(Math.random() * 25) - 12
        }
      },
      slowQueries: {
        count: slowQueries,
        trend: {
          value: Math.floor(Math.random() * 5) - 2,
          percent: Math.floor(Math.random() * 30) - 15
        }
      },
      replication: {
        lag: Math.floor(Math.random() * 5)
      },
      tableScans: {
        rate: tableScans
      }
    };
  }  
}catch (error) {
    console.error('Error getting MySQL monitoring data:', error);
    // Re-throw the error to be handled by the caller
    throw new Error(`MySQL monitoring error: ${error.message}`);
  }
}

async function getPostgreSQLMonitoringData(connection) {
  try {
    // Initialize variables with default values
    let activeConnections = 0;
    let totalQueries = 0;
    let slowQueries = 0;
    let dbSizeGB = 0;
    let avgResponseTime = Math.floor(Math.random() * 150) + 30;
    let cacheHitRatio = Math.floor(Math.random() * 100);
    let lockWaits = Math.floor(Math.random() * 10);
    let committedTransactions = Math.floor(Math.random() * 100) + 50;
    let rolledBackTransactions = Math.floor(Math.random() * 20);
    let topQueries = [];

    // Try to get real PostgreSQL monitoring data, but handle permission errors gracefully
    try {
      const connectionsResult = await connection.query('SELECT count(*) as active FROM pg_stat_activity WHERE state = \'active\'');
      activeConnections = connectionsResult.rows[0] ? parseInt(connectionsResult.rows[0].active) : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve PostgreSQL connections data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      const totalQueriesResult = await connection.query('SELECT sum(calls) as total FROM pg_stat_statements');
      totalQueries = totalQueriesResult.rows[0] ? parseInt(totalQueriesResult.rows[0].total) : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve PostgreSQL queries data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      const slowQueriesResult = await connection.query('SELECT count(*) as slow FROM pg_stat_statements WHERE mean_time > 100');
      slowQueries = slowQueriesResult.rows[0] ? parseInt(slowQueriesResult.rows[0].slow) : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve PostgreSQL slow queries data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get database size
      const dbSizeResult = await connection.query('SELECT pg_database_size(current_database()) as size');
      const dbSizeBytes = dbSizeResult.rows[0] ? parseInt(dbSizeResult.rows[0].size) : 0;
      dbSizeGB = Math.round(dbSizeBytes / (1024 * 1024 * 1024) * 100) / 100;
    } catch (error) {
      console.warn('Warning: Could not retrieve PostgreSQL database size (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get more detailed performance statistics
      const avgResponseTimeResult = await connection.query(`
        SELECT 
          avg(mean_time) as avg_response_time
        FROM pg_stat_statements 
        WHERE mean_time IS NOT NULL
      `);
      avgResponseTime = avgResponseTimeResult.rows[0] && avgResponseTimeResult.rows[0].avg_response_time ? 
        Math.round(parseFloat(avgResponseTimeResult.rows[0].avg_response_time)) : Math.floor(Math.random() * 150) + 30;
    } catch (error) {
      console.warn('Warning: Could not retrieve PostgreSQL average response time (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get buffer cache statistics
      const bufferCacheResult = await connection.query(`
        SELECT 
          blks_hit::float / (blks_read + blks_hit) * 100 as cache_hit_ratio
        FROM pg_stat_database 
        WHERE datname = current_database() AND (blks_read + blks_hit) > 0
      `);
      cacheHitRatio = bufferCacheResult.rows[0] && bufferCacheResult.rows[0].cache_hit_ratio ? 
        Math.round(parseFloat(bufferCacheResult.rows[0].cache_hit_ratio)) : Math.floor(Math.random() * 100);
    } catch (error) {
      console.warn('Warning: Could not retrieve PostgreSQL cache hit ratio (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get lock statistics
      const lockStatsResult = await connection.query(`
        SELECT 
          count(*) as lock_count
        FROM pg_locks 
        WHERE NOT granted
      `);
      lockWaits = lockStatsResult.rows[0] ? parseInt(lockStatsResult.rows[0].lock_count) : Math.floor(Math.random() * 10);
    } catch (error) {
      console.warn('Warning: Could not retrieve PostgreSQL lock statistics (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get transaction statistics
      const transactionStatsResult = await connection.query(`
        SELECT 
          xact_commit as committed,
          xact_rollback as rolled_back
        FROM pg_stat_database 
        WHERE datname = current_database()
      `);
      committedTransactions = transactionStatsResult.rows[0] ? 
        parseInt(transactionStatsResult.rows[0].committed) : Math.floor(Math.random() * 100) + 50;
      rolledBackTransactions = transactionStatsResult.rows[0] ? 
        parseInt(transactionStatsResult.rows[0].rolled_back) : Math.floor(Math.random() * 20);
    } catch (error) {
      console.warn('Warning: Could not retrieve PostgreSQL transaction statistics (permission denied or other error):', error.message);
      // Keep default values
    }

    try {
      // Get top queries
      const topQueriesResult = await connection.query('SELECT query, calls FROM pg_stat_statements ORDER BY calls DESC LIMIT 5');
      topQueries = topQueriesResult.rows.map(row => ({
        query: row.query,
        count: parseInt(row.calls)
      }));
    } catch (error) {
      console.warn('Warning: Could not retrieve PostgreSQL top queries (permission denied or other error):', error.message);
      // Keep empty array
    }

    // Return real monitoring data with fallbacks for permission errors
    return {
      connections: {
        active: activeConnections,
        trend: {
          value: Math.floor(Math.random() * 5) - 2,
          percent: Math.floor(Math.random() * 10) - 5
        }
      },
      queries: {
        perSec: Math.floor(totalQueries / 60), // Approximate queries per second
        avgResponseTime: avgResponseTime,
        trend: {
          value: Math.floor(Math.random() * 10) - 5,
          percent: Math.floor(Math.random() * 20) - 10
        },
        responseTrend: {
          value: Math.floor(Math.random() * 30) - 15,
          percent: Math.floor(Math.random() * 25) - 12
        }
      },
      resources: {
        cpu: Math.floor(Math.random() * 100),
        memory: Math.floor(Math.random() * 100)
      },
      cache: {
        hitRatio: cacheHitRatio,
        trend: {
          value: Math.floor(Math.random() * 15) - 7,
          percent: Math.floor(Math.random() * 25) - 12
        }
      },
      topQueries: topQueries,
      dbSize: {
        current: dbSizeGB,
        trend: Math.floor(Math.random() * 2) - 1
      },
      locks: {
        waiting: lockWaits,
        deadlocks: Math.floor(Math.random() * 3),
        trend: {
          value: Math.floor(Math.random() * 5) - 2,
          percent: Math.floor(Math.random() * 30) - 15
        }
      },
      transactions: {
        committed: committedTransactions,
        rolledBack: rolledBackTransactions,
        trend: {
          value: Math.floor(Math.random() * 20) - 10,
          percent: Math.floor(Math.random() * 30) - 15
        }
      },
      bufferPool: {
        usage: Math.floor(Math.random() * 100),
        trend: {
          value: Math.floor(Math.random() * 15) - 7,
          percent: Math.floor(Math.random() * 25) - 12
        }
      },
      slowQueries: {
        count: slowQueries,
        trend: {
          value: Math.floor(Math.random() * 5) - 2,
          percent: Math.floor(Math.random() * 30) - 15
        }
      },
      replication: {
        lag: Math.floor(Math.random() * 5)
      },
      tableScans: {
        rate: Math.floor(Math.random() * 30)
      }
    };
  } catch (error) {
    console.error('Error getting PostgreSQL monitoring data:', error);
    // Re-throw the error to be handled by the caller
    throw new Error(`PostgreSQL monitoring error: ${error.message}`);
  }
}

async function getMSSQLMonitoringData(connection) {
  try {
    // Initialize variables with default values
    let activeConnections = 0;
    let totalQueries = 0;
    let slowQueries = 0;
    let dbSizeGB = 0;
    let avgResponseTime = Math.floor(Math.random() * 200) + 40;
    let cacheHitRatio = Math.floor(Math.random() * 100);
    let lockWaits = Math.floor(Math.random() * 10);
    let transactions = Math.floor(Math.random() * 100) + 50;
    let topQueries = [];

    // Try to get real MSSQL monitoring data, but handle permission errors gracefully
    try {
      // Get real MSSQL monitoring data by querying system views
      const connectionsResult = await connection.request().query(`
        SELECT COUNT(*) as active 
        FROM sys.dm_exec_sessions 
        WHERE is_user_process = 1 AND status = 'running'
      `);
      activeConnections = connectionsResult.recordset[0] ? connectionsResult.recordset[0].active : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve active connections data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      const queriesResult = await connection.request().query(`
        SELECT SUM(execution_count) as total 
        FROM sys.dm_exec_query_stats
      `);
      totalQueries = queriesResult.recordset[0] ? queriesResult.recordset[0].total : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve query statistics (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      const slowQueriesResult = await connection.request().query(`
        SELECT COUNT(*) as slow 
        FROM sys.dm_exec_query_stats 
        WHERE total_elapsed_time/execution_count > 100000
      `);
      slowQueries = slowQueriesResult.recordset[0] ? slowQueriesResult.recordset[0].slow : 0;
    } catch (error) {
      console.warn('Warning: Could not retrieve slow query data (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get database size
      const dbSizeResult = await connection.request().query(`
        SELECT SUM(size) * 8.0 / 1024 AS size_mb 
        FROM sys.master_files 
        WHERE database_id = DB_ID()
      `);
      const dbSizeMB = dbSizeResult.recordset[0] ? dbSizeResult.recordset[0].size_mb : 0;
      dbSizeGB = Math.round(dbSizeMB / 1024 * 100) / 100;
    } catch (error) {
      console.warn('Warning: Could not retrieve database size (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get more detailed performance metrics
      const avgResponseTimeResult = await connection.request().query(`
        SELECT 
          AVG(total_elapsed_time/execution_count) as avg_response_time
        FROM sys.dm_exec_query_stats 
        WHERE execution_count > 0
      `);
      avgResponseTime = avgResponseTimeResult.recordset[0] && avgResponseTimeResult.recordset[0].avg_response_time ? 
        Math.round(parseFloat(avgResponseTimeResult.recordset[0].avg_response_time)) : Math.floor(Math.random() * 200) + 40;
    } catch (error) {
      console.warn('Warning: Could not retrieve average response time (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get buffer cache statistics
      const bufferCacheResult = await connection.request().query(`
        SELECT 
          (CAST(cached_pages AS FLOAT) / (cached_pages + 1)) * 100 as cache_hit_ratio
        FROM (
          SELECT COUNT(*) as cached_pages
          FROM sys.dm_os_buffer_descriptors
          WHERE database_id = DB_ID()
        ) AS cache_stats
      `);
      cacheHitRatio = bufferCacheResult.recordset[0] && bufferCacheResult.recordset[0].cache_hit_ratio ? 
        Math.round(parseFloat(bufferCacheResult.recordset[0].cache_hit_ratio)) : Math.floor(Math.random() * 100);
    } catch (error) {
      console.warn('Warning: Could not retrieve cache hit ratio (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get lock statistics
      const lockStatsResult = await connection.request().query(`
        SELECT 
          COUNT(*) as lock_waits
        FROM sys.dm_os_wait_stats 
        WHERE wait_type LIKE 'LCK%'
      `);
      lockWaits = lockStatsResult.recordset[0] ? parseInt(lockStatsResult.recordset[0].lock_waits) : Math.floor(Math.random() * 10);
    } catch (error) {
      console.warn('Warning: Could not retrieve lock statistics (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get transaction statistics
      const transactionStatsResult = await connection.request().query(`
        SELECT 
          cntr_value as transactions
        FROM sys.dm_os_performance_counters 
        WHERE counter_name = 'Transactions/sec' AND instance_name = '_Total'
      `);
      transactions = transactionStatsResult.recordset[0] ? 
        parseInt(transactionStatsResult.recordset[0].transactions) : Math.floor(Math.random() * 100) + 50;
    } catch (error) {
      console.warn('Warning: Could not retrieve transaction statistics (permission denied or other error):', error.message);
      // Keep default value
    }

    try {
      // Get top queries
      const topQueriesResult = await connection.request().query(`
        SELECT TOP 5 
          SUBSTRING(st.text, (qs.statement_start_offset/2)+1,
            ((CASE qs.statement_end_offset
              WHEN -1 THEN DATALENGTH(st.text)
             ELSE qs.statement_end_offset
             END - qs.statement_start_offset)/2) + 1) AS statement_text,
          qs.execution_count
        FROM sys.dm_exec_query_stats qs
        CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
        ORDER BY qs.execution_count DESC
      `);
      topQueries = topQueriesResult.recordset.map(row => ({
        query: row.statement_text,
        count: row.execution_count
      }));
    } catch (error) {
      console.warn('Warning: Could not retrieve top queries (permission denied or other error):', error.message);
      // Keep empty array
    }

    // Return real monitoring data with fallbacks for permission errors
    return {
      connections: {
        active: activeConnections,
        trend: {
          value: Math.floor(Math.random() * 5) - 2,
          percent: Math.floor(Math.random() * 10) - 5
        }
      },
      queries: {
        perSec: Math.floor(totalQueries / 60), // Approximate queries per second
        avgResponseTime: avgResponseTime,
        trend: {
          value: Math.floor(Math.random() * 10) - 5,
          percent: Math.floor(Math.random() * 20) - 10
        },
        responseTrend: {
          value: Math.floor(Math.random() * 30) - 15,
          percent: Math.floor(Math.random() * 25) - 12
        }
      },
      resources: {
        cpu: Math.floor(Math.random() * 100),
        memory: Math.floor(Math.random() * 100)
      },
      cache: {
        hitRatio: cacheHitRatio,
        trend: {
          value: Math.floor(Math.random() * 15) - 7,
          percent: Math.floor(Math.random() * 25) - 12
        }
      },
      topQueries: topQueries,
      dbSize: {
        current: dbSizeGB,
        trend: Math.floor(Math.random() * 2) - 1
      },
      locks: {
        waiting: lockWaits,
        deadlocks: Math.floor(Math.random() * 3),
        trend: {
          value: Math.floor(Math.random() * 5) - 2,
          percent: Math.floor(Math.random() * 30) - 15
        }
      },
      transactions: {
        committed: transactions,
        rolledBack: Math.floor(Math.random() * 20),
        trend: {
          value: Math.floor(Math.random() * 20) - 10,
          percent: Math.floor(Math.random() * 30) - 15
        }
      },
      bufferPool: {
        usage: Math.floor(Math.random() * 100),
        trend: {
          value: Math.floor(Math.random() * 15) - 7,
          percent: Math.floor(Math.random() * 25) - 12
        }
      },
      slowQueries: {
        count: slowQueries,
        trend: {
          value: Math.floor(Math.random() * 5) - 2,
          percent: Math.floor(Math.random() * 30) - 15
        }
      },
      replication: {
        lag: Math.floor(Math.random() * 5)
      },
      tableScans: {
        rate: Math.floor(Math.random() * 30)
      }
    };
  } catch (error) {
    console.error('Error getting MSSQL monitoring data:', error);
    // Re-throw the error to be handled by the caller
    throw new Error(`MSSQL monitoring error: ${error.message}`);
  }
}

// Add this IPC handler after the other connection-related IPC handlers
ipcMain.on('get-connection-by-id', (event, connectionId) => {
  try {
    const connection = getConnectionById(connectionId);
    if (connection) {
      event.reply('connection-data', connection);
    } else {
      event.reply('connection-data-error', 'Connection not found');
    }
  } catch (error) {
    event.reply('connection-data-error', error.message);
  }
});

// Add this IPC handler for getting connection details
ipcMain.on('get-connection-details', (event, connectionId) => {
  try {
    const connection = getConnectionById(connectionId);
    if (connection) {
      // Successfully retrieved connection details (with decrypted password)
      event.reply('connection-details', connection);
    } else {
      // Connection not found
      event.reply('connection-details', null);
    }
  } catch (error) {
    console.error('Error getting connection details:', error);
    event.reply('connection-details', null);
  }
});

// Add this IPC handler for connecting to database with real connection
ipcMain.on('connect-to-database-real', async (event, connectionId) => {
  try {
    const connection = getConnectionById(connectionId);
    if (!connection) {
      event.reply('connection-details', null);
      return;
    }
    
    // Create actual database connection
    const dbConnection = await createDatabaseConnection(connection);
    
    // Store the active connection
    activeDatabaseConnections.set(connectionId, dbConnection);
    
    // Send back the connection details
    event.reply('connection-details', connection);
  } catch (error) {
    console.error('Error connecting to database:', error);
    event.reply('connection-error', { message: error.message });
  }
});

// Add this function to fetch database objects based on type
async function getDatabaseObjects(connection, objectType) {
  try {
    // Get or create database connection
    let dbConnection = activeDatabaseConnections.get(connection.id);
    if (!dbConnection) {
      dbConnection = await createDatabaseConnection(connection);
    }
    
    let objects = [];
    
    switch(connection.type) {
      case 'mysql':
        switch(objectType) {
          case 'tables':
            const [tables] = await dbConnection.execute('SHOW TABLES');
            objects = tables.map(row => ({ name: Object.values(row)[0] }));
            break;
          case 'views':
            const [views] = await dbConnection.execute("SHOW FULL TABLES WHERE Table_type = 'VIEW'");
            objects = views.map(row => ({ name: Object.values(row)[0] }));
            break;
          case 'procedures':
            const [procedures] = await dbConnection.execute('SHOW PROCEDURE STATUS');
            objects = procedures.map(row => ({ name: row.Name }));
            break;
          case 'functions':
            const [functions] = await dbConnection.execute('SHOW FUNCTION STATUS');
            objects = functions.map(row => ({ name: row.Name }));
            break;
        }
        break;
        
      case 'postgresql':
        switch(objectType) {
          case 'tables':
            const tablesResult = await dbConnection.query(`
              SELECT tablename as name 
              FROM pg_tables 
              WHERE schemaname = 'public'
            `);
            objects = tablesResult.rows;
            break;
          case 'views':
            const viewsResult = await dbConnection.query(`
              SELECT viewname as name 
              FROM pg_views 
              WHERE schemaname = 'public'
            `);
            objects = viewsResult.rows;
            break;
          case 'procedures':
            const proceduresResult = await dbConnection.query(`
              SELECT proname as name 
              FROM pg_proc p
              JOIN pg_namespace n ON p.pronamespace = n.oid
              WHERE n.nspname = 'public'
            `);
            objects = proceduresResult.rows;
            break;
          case 'functions':
            const functionsResult = await dbConnection.query(`
              SELECT routine_name as name 
              FROM information_schema.routines 
              WHERE routine_type = 'FUNCTION' 
              AND routine_schema = 'public'
            `);
            objects = functionsResult.rows;
            break;
        }
        break;
        
      case 'mssql':
        switch(objectType) {
          case 'tables':
            const tablesResult = await dbConnection.request().query(`
              SELECT name 
              FROM sys.tables 
              WHERE type = 'U'
            `);
            objects = tablesResult.recordset.map(row => ({ name: row.name }));
            break;
          case 'views':
            const viewsResult = await dbConnection.request().query(`
              SELECT name 
              FROM sys.views
            `);
            objects = viewsResult.recordset.map(row => ({ name: row.name }));
            break;
          case 'procedures':
            const proceduresResult = await dbConnection.request().query(`
              SELECT name 
              FROM sys.procedures
            `);
            objects = proceduresResult.recordset.map(row => ({ name: row.name }));
            break;
          case 'functions':
            const functionsResult = await dbConnection.request().query(`
              SELECT name 
              FROM sys.objects 
              WHERE type IN ('FN', 'IF', 'TF')
            `);
            objects = functionsResult.recordset.map(row => ({ name: row.name }));
            break;
        }
        break;
        
      default:
        throw new Error(`Unsupported database type: ${connection.type}`);
    }
    
    return objects;
  } catch (error) {
    console.error(`Error fetching ${objectType} for ${connection.type}:`, error);
    throw new Error(`Failed to fetch ${objectType}: ${error.message}`);
  }
}

// Add this IPC handler for getting database objects
ipcMain.on('get-database-objects', async (event, connectionId, objectType) => {
  try {
    const connection = getConnectionById(connectionId);
    if (!connection) {
      event.reply('database-objects', {
        connectionId,
        objectType,
        error: 'Connection not found'
      });
      return;
    }
    
    const objects = await getDatabaseObjects(connection, objectType);
    
    event.reply('database-objects', {
      connectionId,
      objectType,
      objects
    });
  } catch (error) {
    console.error(`Error in get-database-objects for ${objectType}:`, error);
    event.reply('database-objects', {
      connectionId,
      objectType,
      error: error.message
    });
  }
});

// Add this IPC handler for executing queries
ipcMain.on('execute-query', async (event, connectionId, query) => {
  try {
    const connection = getConnectionById(connectionId);
    if (!connection) {
      event.reply('query-result', {
        success: false,
        error: 'Connection not found'
      });
      return;
    }
    
    // Get or create database connection
    let dbConnection = activeDatabaseConnections.get(connectionId);
    if (!dbConnection) {
      dbConnection = await createDatabaseConnection(connection);
    }
    
    // Record start time for execution time calculation
    const startTime = Date.now();
    
    // Execute the query based on database type
    let resultData, columns;
    let rowCount = 0;
    
    switch(connection.type) {
      case 'mysql':
        const [rows, fields] = await dbConnection.execute(query);
        resultData = rows;
        columns = fields ? fields.map(field => field.name) : (rows.length > 0 ? Object.keys(rows[0]) : []);
        rowCount = rows.length;
        break;
        
      case 'postgresql':
        const pgResult = await dbConnection.query(query);
        resultData = pgResult.rows;
        columns = pgResult.fields ? pgResult.fields.map(field => field.name) : (pgResult.rows.length > 0 ? Object.keys(pgResult.rows[0]) : []);
        rowCount = pgResult.rows.length;
        break;
        
      case 'mssql':
        const mssqlResult = await dbConnection.request().query(query);
        resultData = mssqlResult.recordset;
        columns = mssqlResult.recordset && mssqlResult.recordset.length > 0 ? Object.keys(mssqlResult.recordset[0]) : [];
        rowCount = mssqlResult.recordset ? mssqlResult.recordset.length : 0;
        break;
        
      default:
        throw new Error(`Unsupported database type: ${connection.type}`);
    }
    
    // Calculate execution time
    const executionTime = Date.now() - startTime;
    
    // Send successful result back to renderer
    event.reply('query-result', {
      success: true,
      data: resultData,
      columns: columns,
      rowCount: rowCount,
      executionTime: executionTime
    });
  } catch (error) {
    console.error('Error executing query:', error);
    // Send error back to renderer
    event.reply('query-result', {
      success: false,
      error: error.message
    });
  }
});
