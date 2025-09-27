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

// Window management
let mainWindow;

// Add this at the top with other global variables
let propertiesWindow = null;

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
  const connectionWindow = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  connectionWindow.loadFile('connection.html');
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

// IPC handler for toggling full screen
ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

ipcMain.on('open-file-dialog', (event) => {
  dialog.showOpenDialog({
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
          event.reply('file-open-error', err.message);
        } else {
          event.reply('file-opened', { filePath, content: data });
        }
      });
    }
  }).catch(err => {
    event.reply('file-open-error', err.message);
  });
});

// IPC handlers for connection management
ipcMain.on('open-connection-window', () => {
  createConnectionWindow();
});

ipcMain.on('save-connection', (event, connection) => {
  try {
    ensureConnectionsDir();
    
    // Generate a unique ID for the connection
    const connectionId = Date.now().toString();
    const connectionFile = path.join(CONNECTIONS_DIR, `${connectionId}.json`);

    // Encrypt sensitive data
    const encryptedPassword = connection.password ? encrypt(connection.password) : null;

    // Save connection with encrypted password
    const connectionData = {
      id: connectionId,
      name: connection.name,
      type: connection.type,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: encryptedPassword ? {
        iv: encryptedPassword.iv,
        encryptedData: encryptedPassword.encryptedData
      } : null,
      timeout: connection.timeout,
      sslMode: connection.sslMode,
      sslCert: connection.sslCert,
      sslKey: connection.sslKey,
      sslCa: connection.sslCa,
      additionalParams: connection.additionalParams,
      description: connection.description
    };

    fs.writeFileSync(connectionFile, JSON.stringify(connectionData, null, 2));
    event.reply('connection-saved', connectionId);
  } catch (error) {
    console.error('Error saving connection:', error);
    event.reply('connection-error', { message: 'Failed to save connection' });
  }
});

ipcMain.on('get-connections', (event) => {
  try {
    ensureConnectionsDir();
    const connections = [];

    if (fs.existsSync(CONNECTIONS_DIR)) {
      const files = fs.readdirSync(CONNECTIONS_DIR);
      files.forEach(file => {
        if (path.extname(file) === '.json') {
          try {
            const filePath = path.join(CONNECTIONS_DIR, file);
            const connectionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            // For display purposes, we'll just show that a password is set
            connectionData.password = connectionData.password ? '••••••••' : '';
            connections.push(connectionData);
          } catch (error) {
            console.error(`Error reading connection file ${file}:`, error);
          }
        }
      });
    }

    event.reply('connections-list', connections);
  } catch (error) {
    console.error('Error getting connections:', error);
    event.reply('connections-list', []);
  }
});

ipcMain.on('get-connection-details', (event, connectionId) => {
  try {
    const connectionFile = path.join(CONNECTIONS_DIR, `${connectionId}.json`);

    if (fs.existsSync(connectionFile)) {
      const connectionData = JSON.parse(fs.readFileSync(connectionFile, 'utf8'));
      // Decrypt the password
      if (connectionData.password) {
        try {
          connectionData.password = decrypt(connectionData.password.encryptedData, connectionData.password.iv);
        } catch (error) {
          console.error('Error decrypting password:', error);
          connectionData.password = '';
        }
      }
      event.reply('connection-details', connectionData);
    } else {
      event.reply('connection-details', null);
    }
  } catch (error) {
    console.error('Error getting connection details:', error);
    event.reply('connection-error', { message: 'Failed to get connection details', error: error.message });
  }
});

ipcMain.on('delete-connection', (event, connectionId) => {
  try {
    const connectionFile = path.join(CONNECTIONS_DIR, `${connectionId}.json`);

    if (fs.existsSync(connectionFile)) {
      fs.unlinkSync(connectionFile);
    }

    event.reply('connection-deleted', connectionId);
  } catch (error) {
    console.error('Error deleting connection:', error);
    event.reply('connection-error', { message: 'Failed to delete connection' });
  }
});

// IPC handler for testing connections
ipcMain.on('test-connection', async (event, connectionId) => {
  try {
    const connectionFile = path.join(CONNECTIONS_DIR, `${connectionId}.json`);

    if (fs.existsSync(connectionFile)) {
      const connectionData = JSON.parse(fs.readFileSync(connectionFile, 'utf8'));
      // Decrypt the password
      if (connectionData.password) {
        try {
          connectionData.password = decrypt(connectionData.password.encryptedData, connectionData.password.iv);
        } catch (error) {
          console.error('Error decrypting password:', error);
          connectionData.password = '';
        }
      }
      
      // Test the connection based on type
      let success = false;
      let message = '';
      
      try {
        switch(connectionData.type) {
          case 'mysql':
            success = await testMySQLConnection(connectionData);
            break;
          case 'postgresql':
            success = await testPostgreSQLConnection(connectionData);
            break;
          case 'mssql':
            success = await testMSSQLConnection(connectionData);
            break;
          case 'sqlite':
            success = await testSQLiteConnection(connectionData);
            break;
          case 'oracle':
            success = await testOracleConnection(connectionData);
            break;
          case 'mongodb':
            success = await testMongoDBConnection(connectionData);
            break;
          default:
            message = 'Unsupported database type';
        }
        
        event.reply('connection-test-result', { success, message });
      } catch (error) {
        console.error('Connection test error:', error);
        event.reply('connection-test-result', { 
          success: false, 
          message: error.message 
        });
      }
    } else {
      console.error('Error testing connection:', error);
      event.reply('connection-test-result', { 
        success: false, 
        message: 'Failed to test connection' 
      });
    }
  } catch (error) {
    console.error('Error testing connection:', error);
    event.reply('connection-test-result', { 
      success: false, 
      message: 'Failed to test connection' 
    });
  }
});

// Test connection functions
async function testMySQLConnection(connectionData) {
  const connection = await mysql.createConnection({
    host: connectionData.host,
    port: parseInt(connectionData.port) || 3306,
    user: connectionData.username,
    password: connectionData.password,
    database: connectionData.database,
    connectTimeout: parseInt(connectionData.timeout) || 5000
  });
  
  try {
    await connection.execute('SELECT 1');
    await connection.end();
    return true;
  } catch (error) {
    await connection.end();
    throw error;
  }
}

async function testPostgreSQLConnection(connectionData) {
  const client = new Client({
    host: connectionData.host,
    port: parseInt(connectionData.port) || 5432,
    user: connectionData.username,
    password: connectionData.password,
    database: connectionData.database,
    connectionTimeoutMillis: parseInt(connectionData.timeout) || 5000
  });
  
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return true;
  } catch (error) {
    await client.end();
    throw error;
  }
}

async function testMSSQLConnection(connectionData) {
  const config = {
    server: connectionData.host,
    port: parseInt(connectionData.port) || 1433,
    user: connectionData.username,
    password: connectionData.password,
    database: connectionData.database,
    connectionTimeout: parseInt(connectionData.timeout) || 5000,
    options: {
      encrypt: connectionData.sslMode === 'require' || connectionData.sslMode === 'verify-ca' || connectionData.sslMode === 'verify-full',
      trustServerCertificate: true
    }
  };
  
  try {
    await sql.connect(config);
    await sql.query('SELECT 1');
    await sql.close();
    return true;
  } catch (error) {
    await sql.close();
    throw error;
  }
}

async function testSQLiteConnection(connectionData) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(connectionData.database, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      db.run('SELECT 1', (err) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
  });
}

async function testOracleConnection(connectionData) {
  try {
    const connection = await oracledb.getConnection({
      user: connectionData.username,
      password: connectionData.password,
      connectString: `${connectionData.host}:${connectionData.port || 1521}/${connectionData.database}`
    });
    
    await connection.execute('SELECT 1 FROM DUAL');
    await connection.close();
    return true;
  } catch (error) {
    throw error;
  }
}

async function testMongoDBConnection(connectionData) {
  try {
    const uri = `mongodb://${connectionData.username}:${connectionData.password}@${connectionData.host}:${connectionData.port || 27017}/${connectionData.database}`;
    const client = new MongoClient(uri, {
      connectTimeoutMS: parseInt(connectionData.timeout) || 5000
    });
    
    await client.connect();
    await client.db(connectionData.database).command({ ping: 1 });
    await client.close();
    return true;
  } catch (error) {
    throw error;
  }
}

// IPC handler for getting table schema for CREATE script generation
ipcMain.on('get-table-schema', async (event, { connectionId, tableName }) => {
    try {
        const connectionFile = path.join(CONNECTIONS_DIR, `${connectionId}.json`);

        if (!fs.existsSync(connectionFile)) {
            event.reply('table-schema', {
                tableName: tableName,
                columns: [],
                error: 'Connection not found'
            });
            return;
        }

        const connectionData = JSON.parse(fs.readFileSync(connectionFile, 'utf8'));
        // Decrypt the password
        if (connectionData.password) {
            try {
                connectionData.password = decrypt(connectionData.password.encryptedData, connectionData.password.iv);
            } catch (error) {
                connectionData.password = '';
            }
        }
        
        // Fetch columns based on database type
        let columns = [];
        try {
            switch(connectionData.type) {
                case 'mysql':
                    columns = await getMySQLTableColumns(connectionData, tableName);
                    break;
                case 'postgresql':
                    columns = await getPostgreSQLTableColumns(connectionData, tableName);
                    break;
                case 'mssql':
                    columns = await getMSSQLTableColumns(connectionData, tableName);
                    break;
                case 'sqlite':
                    columns = await getSQLiteTableColumns(connectionData, tableName);
                    break;
                case 'oracle':
                    columns = await getOracleTableColumns(connectionData, tableName);
                    break;
                case 'mongodb':
                    columns = await getMongoDBTableColumns(connectionData, tableName);
                    break;
                default:
                    columns = [];
            }
            
            event.reply('table-schema', {
                tableName: tableName,
                columns: columns,
                databaseType: connectionData.type
            });
        } catch (error) {
            console.error(`Error fetching schema for ${tableName} in ${connectionData.type}:`, error);
            event.reply('table-schema', {
                tableName: tableName,
                columns: [],
                error: error.message
            });
        }
    } catch (error) {
        event.reply('table-schema', {
            tableName: tableName,
            columns: [],
            error: error.message
        });
    }
});

// IPC handler for getting database objects (tables, views, procedures, functions)
ipcMain.on('get-database-objects', async (event, connectionId, objectType) => {
    try {
        const connectionFile = path.join(CONNECTIONS_DIR, `${connectionId}.json`);

        if (!fs.existsSync(connectionFile)) {
            event.reply('database-objects', {
                connectionId: connectionId,
                objectType: objectType,
                objects: [],
                error: 'Connection not found'
            });
            return;
        }

        const connectionData = JSON.parse(fs.readFileSync(connectionFile, 'utf8'));
        // Decrypt the password
        if (connectionData.password) {
            try {
                connectionData.password = decrypt(connectionData.password.encryptedData, connectionData.password.iv);
            } catch (error) {
                connectionData.password = '';
            }
        }
        
        // Fetch objects based on database type and object type
        let objects = [];
        try {
            switch(connectionData.type) {
                case 'mysql':
                    objects = await getMySQLObjects(connectionData, objectType);
                    break;
                case 'postgresql':
                    objects = await getPostgreSQLObjects(connectionData, objectType);
                    break;
                case 'mssql':
                    objects = await getMSSQLObjects(connectionData, objectType);
                    break;
                case 'sqlite':
                    objects = await getSQLiteObjects(connectionData, objectType);
                    break;
                case 'oracle':
                    objects = await getOracleObjects(connectionData, objectType);
                    break;
                case 'mongodb':
                    objects = await getMongoDBObjects(connectionData, objectType);
                    break;
                default:
                    objects = [];
            }
            
            event.reply('database-objects', {
                connectionId: connectionId,
                objectType: objectType,
                objects: objects
            });
        } catch (error) {
            console.error(`Error fetching ${objectType} in ${connectionData.type}:`, error);
            event.reply('database-objects', {
                connectionId: connectionId,
                objectType: objectType,
                objects: [],
                error: error.message
            });
        }
    } catch (error) {
        event.reply('database-objects', {
            connectionId: connectionId,
            objectType: objectType,
            objects: [],
            error: error.message
        });
    }
});

// IPC handler for parsing queries

// MySQL table column fetching
async function getMySQLTableColumns(connectionData, tableName) {
    const connection = await mysql.createConnection({
        host: connectionData.host,
        port: parseInt(connectionData.port) || 3306,
        user: connectionData.username,
        password: connectionData.password,
        database: connectionData.database
    });
    
    try {
        const query = `
            SELECT 
                COLUMN_NAME as name,
                DATA_TYPE as type,
                IS_NULLABLE as nullable,
                COLUMN_DEFAULT as defaultValue,
                CHARACTER_MAXIMUM_LENGTH as charMaxLength,
                NUMERIC_PRECISION as numericPrecision,
                NUMERIC_SCALE as numericScale,
                COLUMN_KEY as columnKey,
                EXTRA as extra
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
        `;
        
        const [rows] = await connection.execute(query, [connectionData.database, tableName]);
        await connection.end();
        return rows.map(row => ({
            name: row.name,
            type: row.type,
            nullable: row.nullable === 'YES',
            defaultValue: row.defaultValue,
            charMaxLength: row.charMaxLength,
            numericPrecision: row.numericPrecision,
            numericScale: row.numericScale,
            isPrimaryKey: row.columnKey === 'PRI',
            isAutoIncrement: row.extra === 'auto_increment'
        }));
    } catch (error) {
        await connection.end();
        throw error;
    }
}

// PostgreSQL table column fetching
async function getPostgreSQLTableColumns(connectionData, tableName) {
    const client = new Client({
        host: connectionData.host,
        port: parseInt(connectionData.port) || 5432,
        user: connectionData.username,
        password: connectionData.password,
        database: connectionData.database
    });
    
    try {
        await client.connect();
        
        const query = `
            SELECT 
                c.column_name as name,
                c.data_type as type,
                c.is_nullable as nullable,
                c.column_default as defaultValue,
                c.character_maximum_length as charMaxLength,
                c.numeric_precision as numericPrecision,
                c.numeric_scale as numericScale,
                tc.constraint_type as constraintType
            FROM information_schema.columns c
            LEFT JOIN information_schema.key_column_usage kcu 
                ON c.table_name = kcu.table_name 
                AND c.table_schema = kcu.table_schema
                AND c.column_name = kcu.column_name
            LEFT JOIN information_schema.table_constraints tc 
                ON kcu.constraint_name = tc.constraint_name
                AND kcu.table_schema = tc.table_schema
            WHERE c.table_schema = 'public' AND c.table_name = $1
            ORDER BY c.ordinal_position
        `;
        
        const res = await client.query(query, [tableName]);
        await client.end();
        return res.rows.map(row => ({
            name: row.name,
            type: row.type,
            nullable: row.nullable === 'YES',
            defaultValue: row.defaultValue,
            charMaxLength: row.charMaxLength,
            numericPrecision: row.numericPrecision,
            numericScale: row.numericScale,
            isPrimaryKey: row.constraintType === 'PRIMARY KEY'
        }));
    } catch (error) {
        await client.end();
        throw error;
    }
}

// SQL Server table column fetching
async function getMSSQLTableColumns(connectionData, tableName) {
    const config = {
        server: connectionData.host,
        port: parseInt(connectionData.port) || 1433,
        user: connectionData.username,
        password: connectionData.password,
        database: connectionData.database,
        options: {
            encrypt: connectionData.sslMode === 'require' || connectionData.sslMode === 'verify-ca' || connectionData.sslMode === 'verify-full',
            trustServerCertificate: true
        }
    };
    
    try {
        await sql.connect(config);
        
        // Escape single quotes in table name to prevent SQL injection
        const escapedTableName = tableName.replace(/'/g, "''");
        const query = `
            SELECT 
                c.COLUMN_NAME as name,
                c.DATA_TYPE as type,
                c.IS_NULLABLE as nullable,
                c.COLUMN_DEFAULT as defaultValue,
                c.CHARACTER_MAXIMUM_LENGTH as charMaxLength,
                c.NUMERIC_PRECISION as numericPrecision,
                c.NUMERIC_SCALE as numericScale,
                tc.CONSTRAINT_TYPE as constraintType,
                COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA+'.'+c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') as isIdentity
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
                ON c.TABLE_NAME = kcu.TABLE_NAME 
                AND c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                AND c.COLUMN_NAME = kcu.COLUMN_NAME
            LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc 
                ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
            WHERE c.TABLE_NAME = '${escapedTableName}'
            ORDER BY c.ORDINAL_POSITION
        `;
        
        const result = await sql.query(query);
        await sql.close();
        return result.recordset.map(row => ({
            name: row.name,
            type: row.type,
            nullable: row.nullable === 'YES',
            defaultValue: row.defaultValue,
            charMaxLength: row.charMaxLength,
            numericPrecision: row.numericPrecision,
            numericScale: row.numericScale,
            isPrimaryKey: row.constraintType === 'PRIMARY KEY',
            isIdentity: row.isIdentity === 1
        }));
    } catch (error) {
        await sql.close();
        throw error;
    }
}

// SQLite table column fetching
async function getSQLiteTableColumns(connectionData, tableName) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(connectionData.database, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
                return;
            }
        });
        
        const query = `PRAGMA table_info(${tableName})`;
        
        db.all(query, (err, rows) => {
            db.close();
            if (err) {
                reject(err);
            } else {
                resolve(rows.map(row => ({
                    name: row.name,
                    type: row.type,
                    nullable: row.notnull === 0,
                    defaultValue: row.dflt_value,
                    isPrimaryKey: row.pk === 1
                })));
            }
        });
    });
}

// Oracle table column fetching
async function getOracleTableColumns(connectionData, tableName) {
    try {
        const connection = await oracledb.getConnection({
            user: connectionData.username,
            password: connectionData.password,
            connectString: `${connectionData.host}:${connectionData.port || 1521}/${connectionData.database}`
        });
        
        const query = `
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                NULLABLE,
                DATA_DEFAULT as DEFAULT_VALUE,
                CHAR_LENGTH,
                DATA_PRECISION,
                DATA_SCALE
            FROM ALL_TAB_COLUMNS
            WHERE TABLE_NAME = :tableName
            ORDER BY COLUMN_ID
        `;
        
        const result = await connection.execute(query, { tableName: tableName.toUpperCase() });
        await connection.close();
        
        return result.rows.map(row => ({
            name: row[0],
            type: row[1],
            nullable: row[2] === 'Y',
            defaultValue: row[3],
            charMaxLength: row[4],
            numericPrecision: row[5],
            numericScale: row[6]
        }));
    } catch (error) {
        throw error;
    }
}

// MongoDB table column fetching
async function getMongoDBTableColumns(connectionData, tableName) {
    try {
        // For MongoDB, we'll treat collections as tables and try to infer schema from documents
        const uri = `mongodb://${connectionData.username}:${connectionData.password}@${connectionData.host}:${connectionData.port || 27017}/${connectionData.database}`;
        const client = new MongoClient(uri);
        
        await client.connect();
        const db = client.db(connectionData.database);
        const collection = db.collection(tableName);
        
        // Get a sample of documents to infer schema
        const sampleDocs = await collection.find().limit(10).toArray();
        
        // Close the connection
        await client.close();
        
        // If no documents, return empty array
        if (sampleDocs.length === 0) {
            return [];
        }
        
        // Infer schema from sample documents
        const schema = inferMongoDBSchema(sampleDocs);
        
        return schema.map(field => ({
            name: field.name,
            type: field.type,
            nullable: true, // MongoDB fields are typically nullable
            defaultValue: null
        }));
    } catch (error) {
        throw error;
    }
}

// Helper function to infer schema from MongoDB documents
function inferMongoDBSchema(documents) {
    const schema = new Map();
    
    documents.forEach(doc => {
        Object.keys(doc).forEach(key => {
            const value = doc[key];
            const valueType = typeof value;
            
            if (!schema.has(key)) {
                schema.set(key, {
                    name: key,
                    type: getMongoDBType(value),
                    count: 1
                });
            } else {
                const field = schema.get(key);
                field.count++;
                
                // If we find a more specific type, update it
                const newType = getMongoDBType(value);
                if (newType !== 'null' && newType !== field.type) {
                    // For mixed types, use the most general type
                    if (field.type === 'null') {
                        field.type = newType;
                    } else if (field.type !== newType) {
                        field.type = 'mixed';
                    }
                }
            }
        });
    });
    
    return Array.from(schema.values());
}

// Helper function to get MongoDB type as string
function getMongoDBType(value) {
    if (value === null || value === undefined) {
        return 'null';
    }
    
    if (Array.isArray(value)) {
        return 'array';
    }
    
    if (value instanceof Date) {
        return 'date';
    }
    
    // Check if it's an ObjectId (MongoDB specific)
    if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectID') {
        return 'objectId';
    }
    
    const type = typeof value;
    
    switch (type) {
        case 'string':
            return 'string';
        case 'number':
            return Number.isInteger(value) ? 'int' : 'double';
        case 'boolean':
            return 'boolean';
        case 'object':
            return 'object';
        default:
            return 'mixed';
    }
}

// Database object fetching functions
async function getMySQLObjects(connectionData, objectType) {
    const connection = await mysql.createConnection({
        host: connectionData.host,
        port: parseInt(connectionData.port) || 3306,
        user: connectionData.username,
        password: connectionData.password,
        database: connectionData.database
    });
    
    try {
        let query = '';
        switch(objectType) {
            case 'tables':
                query = `
                    SELECT TABLE_NAME as name 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
                    ORDER BY TABLE_NAME
                `;
                break;
            case 'views':
                query = `
                    SELECT TABLE_NAME as name 
                    FROM INFORMATION_SCHEMA.VIEWS 
                    WHERE TABLE_SCHEMA = ?
                    ORDER BY TABLE_NAME
                `;
                break;
            case 'procedures':
                query = `
                    SELECT ROUTINE_NAME as name 
                    FROM INFORMATION_SCHEMA.ROUTINES 
                    WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'
                    ORDER BY ROUTINE_NAME
                `;
                break;
            case 'functions':
                query = `
                    SELECT ROUTINE_NAME as name 
                    FROM INFORMATION_SCHEMA.ROUTINES 
                    WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'
                    ORDER BY ROUTINE_NAME
                `;
                break;
            default:
                return [];
        }
        
        const [rows] = await connection.execute(query, [connectionData.database]);
        await connection.end();
        return rows.map(row => ({ name: row.name }));
    } catch (error) {
        await connection.end();
        throw error;
    }
}

async function getPostgreSQLObjects(connectionData, objectType) {
    const client = new Client({
        host: connectionData.host,
        port: parseInt(connectionData.port) || 5432,
        user: connectionData.username,
        password: connectionData.password,
        database: connectionData.database
    });
    
    try {
        await client.connect();
        
        let query = '';
        switch(objectType) {
            case 'tables':
                query = `
                    SELECT tablename as name 
                    FROM pg_tables 
                    WHERE schemaname = 'public'
                    ORDER BY tablename
                `;
                break;
            case 'views':
                query = `
                    SELECT viewname as name 
                    FROM pg_views 
                    WHERE schemaname = 'public'
                    ORDER BY viewname
                `;
                break;
            case 'procedures':
                query = `
                    SELECT proname as name 
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = 'public' AND prokind = 'p'
                    ORDER BY proname
                `;
                break;
            case 'functions':
                query = `
                    SELECT proname as name 
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = 'public' AND prokind = 'f'
                    ORDER BY proname
                `;
                break;
            default:
                await client.end();
                return [];
        }
        
        const res = await client.query(query);
        await client.end();
        return res.rows.map(row => ({ name: row.name }));
    } catch (error) {
        await client.end();
        throw error;
    }
}

async function getMSSQLObjects(connectionData, objectType) {
    const config = {
        server: connectionData.host,
        port: parseInt(connectionData.port) || 1433,
        user: connectionData.username,
        password: connectionData.password,
        database: connectionData.database,
        options: {
            encrypt: connectionData.sslMode === 'require' || connectionData.sslMode === 'verify-ca' || connectionData.sslMode === 'verify-full',
            trustServerCertificate: true
        }
    };
    
    try {
        await sql.connect(config);
        
        let query = '';
        switch(objectType) {
            case 'tables':
                query = `
                    SELECT TABLE_NAME as name 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_TYPE = 'BASE TABLE'
                    ORDER BY TABLE_NAME
                `;
                break;
            case 'views':
                query = `
                    SELECT TABLE_NAME as name 
                    FROM INFORMATION_SCHEMA.VIEWS 
                    ORDER BY TABLE_NAME
                `;
                break;
            case 'procedures':
                query = `
                    SELECT ROUTINE_NAME as name 
                    FROM INFORMATION_SCHEMA.ROUTINES 
                    WHERE ROUTINE_TYPE = 'PROCEDURE'
                    ORDER BY ROUTINE_NAME
                `;
                break;
            case 'functions':
                query = `
                    SELECT ROUTINE_NAME as name 
                    FROM INFORMATION_SCHEMA.ROUTINES 
                    WHERE ROUTINE_TYPE = 'FUNCTION'
                    ORDER BY ROUTINE_NAME
                `;
                break;
            default:
                await sql.close();
                return [];
        }
        
        const result = await sql.query(query);
        await sql.close();
        return result.recordset.map(row => ({ name: row.name }));
    } catch (error) {
        await sql.close();
        throw error;
    }
}

async function getSQLiteObjects(connectionData, objectType) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(connectionData.database, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
                return;
            }
        });
        
        let query = '';
        switch(objectType) {
            case 'tables':
                query = `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`;
                break;
            case 'views':
                query = `SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`;
                break;
            case 'procedures':
                // SQLite doesn't have stored procedures
                db.close();
                return resolve([]);
            case 'functions':
                // SQLite doesn't have user-defined functions in the same way
                db.close();
                return resolve([]);
            default:
                db.close();
                return resolve([]);
        }
        
        db.all(query, (err, rows) => {
            db.close();
            if (err) {
                reject(err);
            } else {
                resolve(rows.map(row => ({ name: row.name })));
            }
        });
    });
}

async function getOracleObjects(connectionData, objectType) {
    try {
        const connection = await oracledb.getConnection({
            user: connectionData.username,
            password: connectionData.password,
            connectString: `${connectionData.host}:${connectionData.port || 1521}/${connectionData.database}`
        });
        
        let query = '';
        switch(objectType) {
            case 'tables':
                query = `
                    SELECT TABLE_NAME as name 
                    FROM USER_TABLES 
                    ORDER BY TABLE_NAME
                `;
                break;
            case 'views':
                query = `
                    SELECT VIEW_NAME as name 
                    FROM USER_VIEWS 
                    ORDER BY VIEW_NAME
                `;
                break;
            case 'procedures':
                query = `
                    SELECT OBJECT_NAME as name 
                    FROM USER_OBJECTS 
                    WHERE OBJECT_TYPE = 'PROCEDURE'
                    ORDER BY OBJECT_NAME
                `;
                break;
            case 'functions':
                query = `
                    SELECT OBJECT_NAME as name 
                    FROM USER_OBJECTS 
                    WHERE OBJECT_TYPE = 'FUNCTION'
                    ORDER BY OBJECT_NAME
                `;
                break;
            default:
                await connection.close();
                return [];
        }
        
        const result = await connection.execute(query);
        await connection.close();
        
        return result.rows.map(row => ({ name: row[0] }));
    } catch (error) {
        throw error;
    }
}

async function getMongoDBObjects(connectionData, objectType) {
    try {
        // For MongoDB, we'll treat collections as tables
        const uri = `mongodb://${connectionData.username}:${connectionData.password}@${connectionData.host}:${connectionData.port || 27017}/${connectionData.database}`;
        const client = new MongoClient(uri);
        
        await client.connect();
        const db = client.db(connectionData.database);
        
        let objects = [];
        switch(objectType) {
            case 'tables':
                // In MongoDB, collections are like tables
                const collections = await db.listCollections().toArray();
                objects = collections.map(collection => ({ name: collection.name }));
                break;
            case 'views':
                // MongoDB views are stored in system.views collection
                try {
                    const views = await db.listCollections({ type: 'view' }).toArray();
                    objects = views.map(view => ({ name: view.name }));
                } catch (error) {
                    objects = [];
                }
                break;
            case 'procedures':
            case 'functions':
                // MongoDB doesn't have stored procedures or functions in the traditional sense
                objects = [];
                break;
            default:
                objects = [];
        }
        
        // Close the connection
        await client.close();
        
        return objects;
    } catch (error) {
        throw error;
    }
}

// MySQL query execution
async function executeMySQLQuery(connectionData, query) {
  const start = Date.now();
  const connection = await mysql.createConnection({
    host: connectionData.host,
    port: parseInt(connectionData.port) || 3306,
    user: connectionData.username,
    password: connectionData.password,
    database: connectionData.database
  });
  
  try {
    const [rows, fields] = await connection.execute(query);
    const end = Date.now();
    
    await connection.end();
    
    return {
      data: rows,
      columns: fields ? fields.map(field => field.name) : [],
      rowCount: Array.isArray(rows) ? rows.length : 0,
      executionTime: end - start
    };
  } catch (error) {
    await connection.end();
    throw error;
  }
}

// PostgreSQL query execution
async function executePostgreSQLQuery(connectionData, query) {
  const start = Date.now();
  const client = new Client({
    host: connectionData.host,
    port: parseInt(connectionData.port) || 5432,
    user: connectionData.username,
    password: connectionData.password,
    database: connectionData.database
  });
  
  try {
    await client.connect();
    const res = await client.query(query);
    const end = Date.now();
    
    await client.end();
    
    // Handle different result types
    if (res.rows) {
      return {
        data: res.rows,
        columns: res.fields ? res.fields.map(field => field.name) : [],
        rowCount: res.rows.length,
        executionTime: end - start
      };
    } else {
      // For non-SELECT queries (INSERT, UPDATE, DELETE, etc.)
      return {
        data: [],
        columns: [],
        rowCount: res.rowCount || 0,
        executionTime: end - start
      };
    }
  } catch (error) {
    await client.end();
    throw error;
  }
}

// SQL Server query execution
async function executeMSSQLQuery(connectionData, query) {
  const start = Date.now();
  const config = {
    server: connectionData.host,
    port: parseInt(connectionData.port) || 1433,
    user: connectionData.username,
    password: connectionData.password,
    database: connectionData.database,
    options: {
      encrypt: connectionData.sslMode === 'require' || connectionData.sslMode === 'verify-ca' || connectionData.sslMode === 'verify-full',
      trustServerCertificate: true
    }
  };
  
  try {
    await sql.connect(config);
    const result = await sql.query(query);
    const end = Date.now();
    
    await sql.close();
    
    // Handle different result types
    if (result.recordset) {
      // SELECT queries
      return {
        data: result.recordset,
        columns: result.recordset.length > 0 ? Object.keys(result.recordset[0]) : [],
        rowCount: result.recordset.length,
        executionTime: end - start
      };
    } else {
      // Non-SELECT queries
      return {
        data: [],
        columns: [],
        rowCount: result.rowsAffected ? result.rowsAffected.reduce((a, b) => a + b, 0) : 0,
        executionTime: end - start
      };
    }
  } catch (error) {
    await sql.close();
    throw error;
  }
}

// SQLite query execution
async function executeSQLiteQuery(connectionData, query) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const db = new sqlite3.Database(connectionData.database, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(err);
        return;
      }
    });
    
    db.all(query, (err, rows) => {
      const end = Date.now();
      db.close();
      
      if (err) {
        reject(err);
      } else {
        resolve({
          data: rows,
          columns: rows.length > 0 ? Object.keys(rows[0]) : [],
          rowCount: rows.length,
          executionTime: end - start
        });
      }
    });
  });
}

// Oracle query execution
async function executeOracleQuery(connectionData, query) {
  const start = Date.now();
  try {
    const connection = await oracledb.getConnection({
      user: connectionData.username,
      password: connectionData.password,
      connectString: `${connectionData.host}:${connectionData.port || 1521}/${connectionData.database}`
    });
    
    const result = await connection.execute(query);
    const end = Date.now();
    
    await connection.close();
    
    // Convert Oracle result format to our standard format
    const columns = result.metaData ? result.metaData.map(col => col.name) : [];
    const data = result.rows ? result.rows.map(row => {
      const obj = {};
      columns.forEach((col, index) => {
        obj[col] = row[index];
      });
      return obj;
    }) : [];
    
    return {
      data: data,
      columns: columns,
      rowCount: data.length,
      executionTime: end - start
    };
  } catch (error) {
    throw error;
  }
}

// MongoDB query execution
async function executeMongoDBQuery(connectionData, query) {
  const start = Date.now();
  try {
    const url = `mongodb://${connectionData.username}:${encodeURIComponent(connectionData.password)}@${connectionData.host}:${connectionData.port || 27017}/${connectionData.database}`;
    const client = new MongoClient(url, { useUnifiedTopology: true });
    
    await client.connect();
    const db = client.db();
    
    // For MongoDB, we'll parse a simple query format
    // This is a simplified implementation - a real app would need more robust parsing
    let result = [];
    let columns = [];
    let rowCount = 0;
    
    // Simple parsing for basic queries
    if (query.toLowerCase().startsWith('find')) {
      // Extract collection name and query parameters
      const match = query.match(/find\(['"]([^'"]+)['"]\s*,\s*(\{[^}]+\})?\s*\)/i);
      if (match) {
        const collectionName = match[1];
        const filter = match[2] ? JSON.parse(match[2]) : {};
        const collection = db.collection(collectionName);
        result = await collection.find(filter).toArray();
        rowCount = result.length;
        columns = result.length > 0 ? Object.keys(result[0]) : [];
      }
    }
    
    await client.close();
    
    return {
      data: result,
      columns: columns,
      rowCount: rowCount,
      executionTime: Date.now() - start
    };
  } catch (error) {
    throw error;
  }
}

// IPC handler for executing queries
ipcMain.on('execute-query', async (event, connectionId, query) => {
  try {
    const connectionFile = path.join(CONNECTIONS_DIR, `${connectionId}.json`);

    if (!fs.existsSync(connectionFile)) {
      event.reply('query-result', {
        success: false,
        error: 'Connection not found'
      });
      return;
    }

    const connectionData = JSON.parse(fs.readFileSync(connectionFile, 'utf8'));
    // Decrypt the password
    if (connectionData.password) {
      try {
        connectionData.password = decrypt(connectionData.password.encryptedData, connectionData.password.iv);
      } catch (error) {
        connectionData.password = '';
      }
    }
    
    // Execute query based on database type
    let result = {};
    try {
      switch(connectionData.type) {
        case 'mysql':
          result = await executeMySQLQuery(connectionData, query);
          break;
        case 'postgresql':
          result = await executePostgreSQLQuery(connectionData, query);
          break;
        case 'mssql':
          result = await executeMSSQLQuery(connectionData, query);
          break;
        case 'sqlite':
          result = await executeSQLiteQuery(connectionData, query);
          break;
        case 'oracle':
          result = await executeOracleQuery(connectionData, query);
          break;
        case 'mongodb':
          result = await executeMongoDBQuery(connectionData, query);
          break;
        default:
          throw new Error(`Unsupported database type: ${connectionData.type}`);
      }
      
      event.reply('query-result', {
        success: true,
        data: result.data,
        columns: result.columns,
        rowCount: result.rowCount,
        executionTime: result.executionTime
      });
    } catch (error) {
      console.error(`Error executing query for ${connectionData.type}:`, error);
      event.reply('query-result', {
        success: false,
        error: error.message
      });
    }
  } catch (error) {
    event.reply('query-result', {
      success: false,
      error: error.message
    });
  }
});

// Initialize connections directory
ensureConnectionsDir();

// Add this IPC handler after the other IPC handlers
ipcMain.on('update-properties-window', (event, propertiesData) => {
  // If properties window doesn't exist, create it
  if (!propertiesWindow || propertiesWindow.isDestroyed()) {
    createPropertiesWindow();
  }
  
  // Send the properties data to the properties window
  if (propertiesWindow && !propertiesWindow.isDestroyed()) {
    propertiesWindow.webContents.send('update-properties', propertiesData);
  }
});
