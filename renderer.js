// Renderer process for DB Explorer
const { ipcRenderer } = require('electron');
const path = require('path');

// Application state
const state = {
    activeConnections: new Set(),
    expandedNodes: new Set(),
    currentConnectionId: null,
    tabCounter: 1,
    activeTabId: 'tab-1',
    queryHistory: [],
    currentTheme: 'system' // Add theme state
};

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Main application initialization
function initializeApp() {
    // Load connections when the page loads
    loadConnections();
    
    // Initialize theme
    initializeTheme();
    
    // Initialize records count
    updateRecordsCount(0);
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup context menu event listeners
    setupContextMenuEventListeners();
    
    // Initialize UI components
    initializeUI();
}

// Setup all event listeners
function setupEventListeners() {
    setupTreeToggleListeners();
    setupTabEventListeners();
    setupResultTabEventListeners();
    setupToolbarEventListeners();
    setupPanelResizing();
    setupPropertiesToggle();
    setupIPCEventListeners();
    setupKeyboardShortcuts();
    setupMenuEventListeners();
}

// Setup menu event listeners
function setupMenuEventListeners() {
    // File menu items
    document.querySelectorAll('#file-menu .dropdown-item').forEach(item => {
        item.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleFileMenuAction(action);
        });
    });
    
    // View menu items
    document.querySelectorAll('#view-menu .dropdown-item').forEach(item => {
        item.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleViewMenuAction(action);
        });
    });
    
    // Help menu items
    document.querySelectorAll('#help-menu .dropdown-item').forEach(item => {
        item.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleHelpMenuAction(action);
        });
    });
    
    // Toolbar buttons
    document.getElementById('connect-button').addEventListener('click', function() {
        connectToDatabase();
    });

    document.getElementById('manage-connections-button').addEventListener('click', function() {
        manageConnections();
    });
}

// Setup IPC event listeners
function setupIPCEventListeners() {
    // Handle new query
    ipcRenderer.on('new-query', (event) => {
        newQuery();
    });
    
    // Handle save file
    ipcRenderer.on('save-file', (event) => {
        saveCurrentFile();
    });
    
    // Handle save file as
    ipcRenderer.on('save-file-as', (event) => {
        saveFileAs();
    });
    
    // Handle file saved
    ipcRenderer.on('file-saved', (event, filePath) => {
        const fileName = path.basename(filePath);
        // Update the active tab title if it'sUntitled
        const activeTab = document.querySelector(`.tab[data-tab-id="${state.activeTabId}"]`);
        if (activeTab) {
            const tabTitle = activeTab.querySelector('.tab-title');
            if (tabTitle && tabTitle.textContent.startsWith('SQLQuery_')) {
                tabTitle.textContent = fileName;
            }
        }
        showMessage(`File saved: ${fileName}`);
    });
    
    // Handle file save error
    ipcRenderer.on('file-save-error', (event, error) => {
        showMessage(`Error saving file: ${error}`);
    });
    
    // Handle undo
    ipcRenderer.on('undo', (event) => {
        const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                      document.querySelector('.sql-editor');
        if (editor) {
            editor.focus();
            document.execCommand('undo', false, null);
        }
    });
    
    // Handle redo
    ipcRenderer.on('redo', (event) => {
        const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                      document.querySelector('.sql-editor');
        if (editor) {
            editor.focus();
            document.execCommand('redo', false, null);
        }
    });
    
    // Handle cut
    ipcRenderer.on('cut', (event) => {
        const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                      document.querySelector('.sql-editor');
        if (editor) {
            editor.focus();
            document.execCommand('cut', false, null);
        }
    });
    
    // Handle copy
    ipcRenderer.on('copy', (event) => {
        const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                      document.querySelector('.sql-editor');
        if (editor) {
            editor.focus();
            document.execCommand('copy', false, null);
        }
    });
    
    // Handle paste
    ipcRenderer.on('paste', (event) => {
        const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                      document.querySelector('.sql-editor');
        if (editor) {
            editor.focus();
            document.execCommand('paste', false, null);
        }
    });
    
    // Handle find
    ipcRenderer.on('find', (event) => {
        showFindDialog();
    });
    
    // Handle replace
    ipcRenderer.on('replace', (event) => {
        showReplaceDialog();
    });
    
    // Handle select all
    ipcRenderer.on('select-all', (event) => {
        const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                      document.querySelector('.sql-editor');
        if (editor) {
            editor.focus();
            editor.select();
        }
    });
    
    // Handle object explorer toggle
    ipcRenderer.on('object-explorer', (event) => {
        toggleObjectExplorer();
    });
    
    // Handle properties panel toggle
    ipcRenderer.on('properties', (event) => {
        togglePropertiesPanel();
    });
    
    // Handle execute query
    ipcRenderer.on('execute', (event) => {
        executeQuery();
    });
    
    // Handle execute selection
    ipcRenderer.on('execute-selection', (event) => {
        executeSelection();
    });
    
    // Handle parse query
    ipcRenderer.on('parse', (event) => {
        parseQuery();
    });
    
    // Handle theme changes
    ipcRenderer.on('set-theme', (event, theme) => {
        setTheme(theme);
    });
    
    // Handle parse query result
    ipcRenderer.on('parse-result', (event, result) => {
        if (result.success) {
            showMessage(result.message);
        } else {
            showMessage(`Error parsing query: ${result.error}`);
        }
    });
    
    // Handle estimated execution plan result
    ipcRenderer.on('estimated-plan-result', (event, result) => {
        if (result.success) {
            showMessage(result.message);
            // Create a new tab for the execution plan
            const newTabId = createNewTab('EstimatedPlan.sqlplan');
            const planEditor = document.querySelector(`.query-editor[data-tab-id="${newTabId}"] .sql-editor`);
            if (planEditor) {
                planEditor.value = result.plan;
            }
        } else {
            showMessage(`Error generating execution plan: ${result.error}`);
        }
    });
    
    // Handle connections list
    ipcRenderer.on('connections-list', (event, connections) => {
        // Update the Object Explorer
        updateObjectExplorer(connections);
        // Update the Connections menu
        updateConnectionsMenu(connections);
    });
    
    // Handle connection details
    ipcRenderer.on('connection-details', (event, connection) => {
        if (connection) {
            showMessage(`Connected to ${connection.name} (${connection.host}:${connection.port})`);
            // Set as current connection
            state.currentConnectionId = connection.id;
            // Mark as active
            state.activeConnections.add(connection.id);
            // Update the Object Explorer with database objects
            updateObjectExplorerWithConnection(connection);
        } else {
            showMessage('Failed to connect to database');
        }
    });
    
    // Handle file opened
    ipcRenderer.on('file-opened', (event, fileData) => {
        // Create a new tab with the file name
        const fileName = path.basename(fileData.filePath);
        const newTabId = createNewTab(fileName);
        
        // Set the content of the editor
        const editor = document.querySelector(`.query-editor[data-tab-id="${newTabId}"] .sql-editor`);
        if (editor) {
            editor.value = fileData.content;
        }
        
        showMessage(`Opened file: ${fileName}`);
    });
    
    // Handle file open error
    ipcRenderer.on('file-open-error', (event, error) => {
        showMessage(`Error opening file: ${error}`);
    });
    
    // Handle connection errors
    ipcRenderer.on('connection-error', (event, error) => {
        showMessage(`Connection error: ${error.message}`);
    });
    
    // Handle database objects
    ipcRenderer.on('database-objects', (event, data) => {
        if (data.error) {
            console.error(`Error fetching ${data.objectType}:`, data.error);
            showMessage(`Error fetching ${data.objectType}: ${data.error}`);
            return;
        }
        
        updateConnectionObjects(data.connectionId, data.objectType, data.objects);
    });
    
    // Handle query results
    ipcRenderer.on('query-result', (event, result) => {
        if (result.success) {
            displayQueryResults(result.data, result.columns);
            const message = `Query executed successfully in ${result.executionTime}ms. ${result.rowCount} rows returned.`;
            displayQueryMessages(message);
            // Show in status bar
            showMessage(message);
            // Update records count
            updateRecordsCount(result.rowCount);
        } else {
            displayQueryError(result.error);
            const errorMessage = `Error: ${result.error}`;
            displayQueryMessages(errorMessage);
            // Show in status bar
            showMessage(errorMessage);
            // Update records count to 0 on error
            updateRecordsCount(0);
        }
    });

    // Handle table columns
    ipcRenderer.on('table-columns', (event, data) => {
        if (data.error) {
            console.error(`Error fetching columns for ${data.tableName}:`, data.error);
            showMessage(`Error fetching columns for ${data.tableName}: ${data.error}`);
            return;
        }

        updatePropertiesWithColumns(data.tableName, data.columns);
    });

    // Handle connection saved
    ipcRenderer.on('connection-saved', (event, connectionId) => {
        showMessage('Connection saved successfully');
        // Reload connections
        loadConnections();
    });

    // Handle connection deleted
    ipcRenderer.on('connection-deleted', (event, connectionId) => {
        showMessage('Connection deleted successfully');
        // Remove from active connections if it was active
        state.activeConnections.delete(connectionId);
        // Reload connections
        loadConnections();
    });
    
    // Handle connection test result
    ipcRenderer.on('connection-test-result', (event, result) => {
        if (result.success) {
            showMessage(result.message);
        } else {
            showMessage(`Connection test failed: ${result.message}`);
        }
    });
}

// Handle file menu actions
function handleFileMenuAction(action) {
    switch(action) {
        case 'new-query':
            newQuery();
            break;
        case 'new-window':
            // This is handled by the main process
            ipcRenderer.send('new-window');
            break;
        case 'open':
            ipcRenderer.send('open-file-dialog');
            break;
        case 'open-recent':
            // This is handled by the main process menu
            break;
        case 'save':
            saveCurrentFile();
            break;
        case 'save-as':
            saveFileAs();
            break;
        case 'exit':
            ipcRenderer.send('close-app');
            break;
        // Add other file menu actions as needed
    }
}

// Handle view menu actions
function handleViewMenuAction(action) {
    switch(action) {
        case 'toggle-properties':
            togglePropertiesPanel();
            break;
    }
}

// Handle help menu actions
function handleHelpMenuAction(action) {
    switch(action) {
        case 'about':
            showMessage('DB Explorer - Database Management Tool');
            break;
    }
}

// Toggle properties panel visibility
function togglePropertiesPanel() {
    const toggleButton = document.getElementById('properties-toggle');
    if (toggleButton) {
        toggleButton.click();
    }
}

// Toggle object explorer visibility
function toggleObjectExplorer() {
    const objectExplorer = document.querySelector('.object-explorer');
    const documentArea = document.querySelector('.document-area');
    
    if (objectExplorer && documentArea) {
        objectExplorer.classList.toggle('hidden');
        documentArea.classList.toggle('object-explorer-hidden');
        
        // Store the state in localStorage so it persists
        const isHidden = objectExplorer.classList.contains('hidden');
        localStorage.setItem('objectExplorerHidden', isHidden);
        
        showMessage(isHidden ? 'Object Explorer hidden' : 'Object Explorer shown');
    }
}

// Setup tree toggle listeners
function setupTreeToggleListeners() {
    // This function is now handled by addTreeEventListeners
    // which is called when tree items are dynamically added
}

// Setup tab event listeners
function setupTabEventListeners() {
    // Add new tab button
    const newTabButton = document.querySelector('.tab-new');
    if (newTabButton) {
        newTabButton.addEventListener('click', function() {
            createNewTab(`SQLQuery_${state.tabCounter + 1}.sql`);
        });
    }
    
    // Add tab navigation buttons
    const prevTabButton = document.querySelector('.tab-nav-prev');
    const nextTabButton = document.querySelector('.tab-nav-next');
    const tabsContainer = document.querySelector('.tabs-container');
    
    if (prevTabButton) {
        prevTabButton.addEventListener('click', function() {
            navigateTabsWithScroll(-1);
        });
    }
    
    if (nextTabButton) {
        nextTabButton.addEventListener('click', function() {
            navigateTabsWithScroll(1);
        });
    }
    
    // Add scroll event to update navigation buttons
    if (tabsContainer) {
        tabsContainer.addEventListener('scroll', function() {
            updateTabNavigationButtons();
        });
    }
    
    // Add resize event to update navigation buttons when window resizes
    window.addEventListener('resize', function() {
        updateTabNavigationButtons();
    });
    
    // Add keyboard shortcuts for tab switching
    document.addEventListener('keydown', function(e) {
        // Ctrl+Tab or Cmd+Tab to navigate to next tab
        if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            navigateToTab(1);
        }
        
        // Ctrl+Shift+Tab or Cmd+Shift+Tab to navigate to previous tab
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Tab') {
            e.preventDefault();
            navigateToTab(-1);
        }
        
        // Ctrl+W or Cmd+W to close current tab
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            e.preventDefault();
            closeTab(state.activeTabId);
        }
        
        // Ctrl+T or Cmd+T to create new tab
        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
            e.preventDefault();
            createNewTab(`SQLQuery_${state.tabCounter + 1}.sql`);
        }
        
        // Ctrl+PageUp or Cmd+Option+Left to go to previous tab
        if ((e.ctrlKey && e.key === 'PageUp') || (e.metaKey && e.altKey && e.key === 'ArrowLeft')) {
            e.preventDefault();
            navigateToTab(-1);
        }
        
        // Ctrl+PageDown or Cmd+Option+Right to go to next tab
        if ((e.ctrlKey && e.key === 'PageDown') || (e.metaKey && e.altKey && e.key === 'ArrowRight')) {
            e.preventDefault();
            navigateToTab(1);
        }
    });
    
    // Initial update of tab navigation buttons
    setTimeout(updateTabNavigationButtons, 100);
}

// Setup result tab event listeners
function setupResultTabEventListeners() {
    // Result tab switching functionality
    const resultTabs = document.querySelectorAll('.result-tab');
    resultTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabType = this.getAttribute('data-tab-type');
            switchToResultTab(tabType);
        });
    });
}

// Switch to result tab (Results or Messages)
function switchToResultTab(tabType) {
    // Remove active class from all result tabs
    document.querySelectorAll('.result-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all result contents
    document.querySelectorAll('.result-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Add active class to clicked tab
    const tab = document.querySelector(`.result-tab[data-tab-type="${tabType}"]`);
    if (tab) {
        tab.classList.add('active');
    }
    
    // Show the corresponding content
    const content = document.querySelector(`.result-content[data-tab-type="${tabType}"]`);
    if (content) {
        content.classList.add('active');
    }
}

// Setup toolbar event listeners
function setupToolbarEventListeners() {
    // Toolbar button interactions
    const toolbarButtons = document.querySelectorAll('.toolbar-button');
    toolbarButtons.forEach(button => {
        button.addEventListener('click', function() {
            const buttonText = this.querySelector('.toolbar-text').textContent;
            console.log(`Toolbar button clicked: ${buttonText}`);
            
            // Add visual feedback
            this.style.backgroundColor = '#d0d0d0';
            setTimeout(() => {
                this.style.backgroundColor = '';
            }, 200);
            
            // Specific actions based on button text
            switch(buttonText) {
                case 'Execute':
                    executeQuery();
                    break;
                case 'New Query':
                    newQuery();
                    break;
                case 'Connect':
                    connectToDatabase();
                    break;
                case 'Manage Connections':
                    manageConnections();
                    break;
            }
        });
    });
}

// Setup panel resizing
function setupPanelResizing() {
    // Panel resizing
    const objectExplorer = document.querySelector('.object-explorer');
    const propertiesPanel = document.querySelector('.properties-panel');
    
    if (objectExplorer) {
        objectExplorer.addEventListener('mousedown', function(e) {
            if (e.offsetX > this.offsetWidth - 5) {
                const startX = e.clientX;
                const startWidth = parseInt(document.defaultView.getComputedStyle(objectExplorer).width, 10);
                
                function doDrag(e) {
                    objectExplorer.style.width = (startWidth + e.clientX - startX) + 'px';
                }
                
                function stopDrag() {
                    document.removeEventListener('mousemove', doDrag);
                    document.removeEventListener('mouseup', stopDrag);
                }
                
                document.addEventListener('mousemove', doDrag);
                document.addEventListener('mouseup', stopDrag);
            }
        });
    }
    
    if (propertiesPanel) {
        propertiesPanel.addEventListener('mousedown', function(e) {
            if (e.offsetX < 5) {
                const startX = e.clientX;
                const startWidth = parseInt(document.defaultView.getComputedStyle(propertiesPanel).width, 10);
                
                function doDrag(e) {
                    propertiesPanel.style.width = (startWidth - e.clientX + startX) + 'px';
                }
                
                function stopDrag() {
                    document.removeEventListener('mousemove', doDrag);
                    document.removeEventListener('mouseup', stopDrag);
                }
                
                document.addEventListener('mousemove', doDrag);
                document.addEventListener('mouseup', stopDrag);
            }
        });
    }
}

// Setup properties panel toggle
function setupPropertiesToggle() {
    const toggleButton = document.getElementById('properties-toggle');
    const propertiesPanel = document.querySelector('.properties-panel');
    const documentArea = document.querySelector('.document-area');
    
    if (toggleButton && propertiesPanel && documentArea) {
        toggleButton.addEventListener('click', function() {
            propertiesPanel.classList.toggle('hidden');
            documentArea.classList.toggle('properties-hidden');
            
            // Update toggle button icon
            if (propertiesPanel.classList.contains('hidden')) {
                this.textContent = '▶';
                this.title = 'Show Properties Panel';
            } else {
                this.textContent = '◀';
                this.title = 'Hide Properties Panel';
            }
            
            // Store the state in localStorage so it persists
            const isHidden = propertiesPanel.classList.contains('hidden');
            localStorage.setItem('propertiesPanelHidden', isHidden);
        });
    }
}

// Initialize UI components
function initializeUI() {
    // Initialize tab event listeners
    setupTabEventListeners();
    setupResultTabEventListeners();
    
    // Restore properties panel state
    restorePropertiesPanelState();
    
    // Restore object explorer state
    restoreObjectExplorerState();
}

// Restore properties panel state from localStorage
function restorePropertiesPanelState() {
    const isHidden = localStorage.getItem('propertiesPanelHidden') === 'true';
    const propertiesPanel = document.querySelector('.properties-panel');
    const documentArea = document.querySelector('.document-area');
    const toggleButton = document.getElementById('properties-toggle');
    
    if (isHidden && propertiesPanel && documentArea && toggleButton) {
        propertiesPanel.classList.add('hidden');
        documentArea.classList.add('properties-hidden');
        toggleButton.textContent = '▶';
        toggleButton.title = 'Show Properties Panel';
    }
}

// Restore object explorer state from localStorage
function restoreObjectExplorerState() {
    const isHidden = localStorage.getItem('objectExplorerHidden') === 'true';
    const objectExplorer = document.querySelector('.object-explorer');
    const documentArea = document.querySelector('.document-area');
    
    if (isHidden && objectExplorer && documentArea) {
        objectExplorer.classList.add('hidden');
        documentArea.classList.add('object-explorer-hidden');
    }
}

// Tab management functions
function switchToTab(tabId) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    // Remove active class from all editors
    document.querySelectorAll('.query-editor').forEach(e => e.classList.remove('active'));
    
    // Add active class to clicked tab
    const tab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    if (tab) {
        tab.classList.add('active');
        // Ensure tab is visible in container
        ensureTabVisible(tab);
    }
    
    // Show the corresponding editor
    const editor = document.querySelector(`.query-editor[data-tab-id="${tabId}"]`);
    if (editor) editor.classList.add('active');
    
    state.activeTabId = tabId;
    
    // Update result area to show results for this tab if they exist
    updateResultAreaForTab(tabId);
    
    // Update tab navigation buttons state
    updateTabNavigationButtons();
}

// Update result area for the specified tab
function updateResultAreaForTab(tabId) {
    // This function would update the result area based on the tab
    // For now, we'll just ensure the results area is visible
    const resultArea = document.querySelector('.result-area');
    if (resultArea) {
        resultArea.style.display = 'flex';
    }
}

function ensureTabVisible(tabElement) {
    const container = document.querySelector('.tabs-container');
    const containerRect = container.getBoundingClientRect();
    const tabRect = tabElement.getBoundingClientRect();
    
    // Check if tab is fully visible
    if (tabRect.left < containerRect.left) {
        // Tab is too far left
        container.scrollLeft += tabRect.left - containerRect.left;
    } else if (tabRect.right > containerRect.right) {
        // Tab is too far right
        container.scrollLeft += tabRect.right - containerRect.right;
    }
}

function updateTabNavigationButtons() {
    const container = document.querySelector('.tabs-container');
    const prevButton = document.querySelector('.tab-nav-prev');
    const nextButton = document.querySelector('.tab-nav-next');
    
    if (!container || !prevButton || !nextButton) return;
    
    // Show/hide navigation buttons based on whether scrolling is needed
    if (container.scrollWidth <= container.clientWidth) {
        prevButton.style.display = 'none';
        nextButton.style.display = 'none';
    } else {
        prevButton.style.display = 'flex';
        nextButton.style.display = 'flex';
        
        // Enable/disable navigation buttons based on scroll position
        prevButton.disabled = container.scrollLeft <= 0;
        nextButton.disabled = container.scrollLeft >= (container.scrollWidth - container.clientWidth);
    }
}

function navigateTabsWithScroll(direction) {
    const container = document.querySelector('.tabs-container');
    if (!container) return;
    
    // Scroll by one tab width
    const scrollAmount = 150; // Same as tab width
    container.scrollLeft += direction * scrollAmount;
    
    // Update navigation button states
    updateTabNavigationButtons();
}

function createNewTab(title) {
    state.tabCounter++;
    const newTabId = `tab-${state.tabCounter}`;
    
    // Create tab element
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.setAttribute('data-tab-id', newTabId);
    
    const tabTitle = document.createElement('span');
    tabTitle.className = 'tab-title';
    tabTitle.textContent = title;
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close Tab (Ctrl+W)';
    
    tab.appendChild(tabTitle);
    tab.appendChild(closeBtn);
    
    // Add click event for tab switching
    tab.addEventListener('click', function(e) {
        // If clicking on the close button, close the tab
        if (e.target.classList.contains('tab-close')) {
            e.stopPropagation();
            closeTab(newTabId);
            return;
        }
        switchToTab(newTabId);
    });
    
    // Add click event for closing tab
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(newTabId);
    });
    
    // Add double-click to edit tab title
    tab.addEventListener('dblclick', function(e) {
        if (!e.target.classList.contains('tab-close')) {
            editTabTitle(newTabId);
        }
    });
    
    // Add tab to tabs container
    const tabsContainer = document.querySelector('.tabs-container');
    tabsContainer.appendChild(tab);
    
    // Create editor element
    const editorContainer = document.querySelector('.document-area');
    const newEditor = document.createElement('div');
    newEditor.className = 'query-editor';
    newEditor.setAttribute('data-tab-id', newTabId);
    newEditor.innerHTML = '<textarea class="sql-editor" placeholder="Write your SQL query here..."></textarea>';
    editorContainer.insertBefore(newEditor, document.querySelector('.result-area'));
    
    // Switch to the new tab
    switchToTab(newTabId);
    
    // Update tab navigation
    updateTabNavigationButtons();
    
    return newTabId;
}

function editTabTitle(tabId) {
    const tab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    const tabTitle = tab.querySelector('.tab-title');
    
    if (!tabTitle) return;
    
    const currentTitle = tabTitle.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'tab-title-input';
    
    // Replace title with input
    tab.replaceChild(input, tabTitle);
    input.focus();
    
    // Handle input events
    input.addEventListener('blur', function() {
        saveTabTitle(tabId, this.value);
    });
    
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            saveTabTitle(tabId, this.value);
        } else if (e.key === 'Escape') {
            saveTabTitle(tabId, currentTitle);
        }
    });
}

function saveTabTitle(tabId, newTitle) {
    const tab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    const input = tab.querySelector('.tab-title-input');
    
    if (!input) return;
    
    const tabTitle = document.createElement('span');
    tabTitle.className = 'tab-title';
    tabTitle.textContent = newTitle || 'Untitled';
    
    // Replace input with title
    tab.replaceChild(tabTitle, input);
}

function closeTab(tabId) {
    // Remove tab element
    const tab = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    if (tab) tab.remove();
    
    // Remove editor element
    const editor = document.querySelector(`.query-editor[data-tab-id="${tabId}"]`);
    if (editor) editor.remove();
    
    // If we closed the active tab, switch to another tab
    if (state.activeTabId === tabId) {
        // Try to switch to the next tab first
        const allTabs = Array.from(document.querySelectorAll('.tab'));
        const currentIndex = allTabs.findIndex(t => t.getAttribute('data-tab-id') === tabId);
        
        // If there's a next tab, switch to it
        if (currentIndex < allTabs.length - 1 && allTabs[currentIndex + 1]) {
            const nextTabId = allTabs[currentIndex + 1].getAttribute('data-tab-id');
            switchToTab(nextTabId);
        } 
        // Otherwise, switch to the previous tab
        else if (currentIndex > 0 && allTabs[currentIndex - 1]) {
            const prevTabId = allTabs[currentIndex - 1].getAttribute('data-tab-id');
            switchToTab(prevTabId);
        }
        // If no other tabs, create a new one
        else {
            createNewTab(`SQLQuery_${state.tabCounter + 1}.sql`);
        }
    }
    
    // Update tab navigation
    updateTabNavigationButtons();
}

// Toolbar functions
function executeQuery() {
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    const query = editor.value;
    
    if (query.trim() === '') {
        showMessage('Please enter a query first.');
        return;
    }
    
    if (!state.currentConnectionId) {
        showMessage('Please connect to a database first.');
        return;
    }
    
    showMessage(`Executing query: ${query.substring(0, 30)}...`);
    
    // Record query in history
    state.queryHistory.push({
        query: query,
        timestamp: new Date(),
        tabId: state.activeTabId
    });
    
    // Execute the query
    ipcRenderer.send('execute-query', state.currentConnectionId, query);
}

function executeSelection() {
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    
    // Get selected text
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    
    if (selectedText.trim() === '') {
        showMessage('Please select a query first.');
        return;
    }
    
    if (!state.currentConnectionId) {
        showMessage('Please connect to a database first.');
        return;
    }
    
    showMessage(`Executing selection: ${selectedText.substring(0, 30)}...`);
    
    // Record query in history
    state.queryHistory.push({
        query: selectedText,
        timestamp: new Date(),
        tabId: state.activeTabId
    });
    
    // Execute the selected query
    ipcRenderer.send('execute-query', state.currentConnectionId, selectedText);
}

function parseQuery() {
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    const query = editor.value;
    
    if (query.trim() === '') {
        showMessage('Please enter a query to parse.');
        return;
    }
    
    if (!state.currentConnectionId) {
        showMessage('Please connect to a database first.');
        return;
    }
    
    showMessage('Parsing query...');
    
    // Send to main process to parse the query
    ipcRenderer.send('parse-query', state.currentConnectionId, query);
}

function displayEstimatedExecutionPlan() {
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    const query = editor.value;
    
    if (query.trim() === '') {
        showMessage('Please enter a query first.');
        return;
    }
    
    if (!state.currentConnectionId) {
        showMessage('Please connect to a database first.');
        return;
    }
    
    showMessage('Generating estimated execution plan...');
    
    // Send to main process to generate the execution plan
    ipcRenderer.send('generate-estimated-plan', state.currentConnectionId, query);
}

function includeActualExecutionPlan() {
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    const query = editor.value;
    
    if (query.trim() === '') {
        showMessage('Please enter a query first.');
        return;
    }
    
    if (!state.currentConnectionId) {
        showMessage('Please connect to a database first.');
        return;
    }
    
    showMessage('Actual execution plan will be included with next query execution.');
    
    // In a real implementation, you would set a flag to include the actual plan
    // For now, we'll just show a message
    state.includeActualPlan = true;
}

function includeClientStatistics() {
    showMessage('Client statistics will be included with next query execution.');
    
    // In a real implementation, you would set a flag to include client statistics
    // For now, we'll just show a message
    state.includeClientStats = true;
}

function specifyTemplateParameters() {
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    const query = editor.value;
    
    // Look for template parameters in the query (e.g., $(param))
    const paramRegex = /\$\(([^)]+)\)/g;
    const params = [...new Set([...query.matchAll(paramRegex)].map(match => match[1]))];
    
    if (params.length === 0) {
        showMessage('No template parameters found in the query.');
        return;
    }
    
    showMessage(`Found ${params.length} template parameters: ${params.join(', ')}`);
    
    // In a real implementation, you would show a dialog to specify parameter values
    // For now, we'll just show a message
    setTimeout(() => {
        showMessage('In a real implementation, you would specify values for these parameters in a dialog.');
    }, 1000);
}

function designQueryInEditor() {
    showMessage('Opening Query Designer...');
    
    // In In a real implementation, you would open a visual query designer
    // // For now, we'll just show a message and create a new tab with a template
    setTimeout(() => {
        const newTabId = createNewTab('QueryDesigner.sql');
        const editor = document.querySelector(`.query-editor[data-tab-id="${newTabId}"] .sql-editor`);
        if (editor) {
            editor.value = `-- Visual Query Designer Template
-- Use this space to design your query visually

SELECT *
FROM 
WHERE 
ORDER BY `;
        }
        showMessage('Query Designer template created. In a real implementation, this would be a visual designer.');
    }, 500);
}

function newQuery() {
    // Create a new tab for the query
    createNewTab(`SQLQuery_${state.tabCounter}.sql`);
    
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    editor.value = '-- Write your SQL query here\n';
    showMessage('New query created.');
}

function connectToDatabase() {
    showMessage('Connecting to database...');
    // Simulate connection process
    setTimeout(() => {
        showMessage('Connected to database successfully.');
        // Add to active connections (for demo purposes)
        // In a real app, you would have a specific connection ID
    }, 1000);
}

function disconnectFromDatabase() {
    if (state.currentConnectionId) {
        state.activeConnections.delete(state.currentConnectionId);
        showMessage('Disconnected from database.');
        state.currentConnectionId = null;
        // Update UI to reflect disconnected state
        updateObjectExplorer([]);
    } else {
        showMessage('Not connected to any database.');
    }
}

function refreshObjectExplorer(connectionId) {
    showMessage('Refreshing Object Explorer...');
    // In a real app, you would re-fetch the database objects
    setTimeout(() => {
        showMessage('Object Explorer refreshed.');
    }, 500);
}

function manageConnections() {
    ipcRenderer.send('open-connection-window');
}

// Connect to a specific database
function connectToDatabaseById(connectionId) {
    showMessage(`Connecting to database ${connectionId}...`);
    // Set as current connection
    state.currentConnectionId = connectionId;
    // Add to active connections
    state.activeConnections.add(connectionId);
    // In a real app, you would retrieve connection details and connect
    ipcRenderer.send('get-connection-details', connectionId);
}

// Object Explorer functions
function updateObjectExplorer(connections) {
    const treeView = document.getElementById('object-explorer-tree');
    
    // Always start with the Connections node
    let html = `
        <div class="tree-item static-node" id="connections-root">
            <span class="tree-label">
                <span class="tree-toggle">▶</span>
                💾 Connections
            </span>
            <div class="tree-children" style="display: block;">
    `;
    
    if (connections.length === 0) {
        html += '<div class="tree-item"><span class="tree-label">No connections found</span></div>';
    } else {
        connections.forEach(connection => {
            // Check if this connection is active
            const isConnected = state.activeConnections.has(connection.id);
            const icon = isConnected ? '🟢' : '🔴';
            
            html += `
                <div class="tree-item connection-item" data-id="${connection.id}" data-type="connection">
                    <span class="tree-label connection-label" title="${connection.name}">
                        <span class="tree-toggle">▶</span>
                        ${connection.name}
                    </span>
                    <div class="tree-children" style="display: none;">
                        <!-- Tables will be loaded here -->
                    </div>
                </div>
            `;
        });
    }
    
    html += `
            </div>
        </div>
    `;
    
    treeView.innerHTML = html;
    
    // Add event listeners to the Connections root node
    const connectionsRoot = document.getElementById('connections-root');
    const rootLabel = connectionsRoot.querySelector('.tree-label');
    const rootToggle = rootLabel.querySelector('.tree-toggle');
    const rootChildren = connectionsRoot.querySelector('.tree-children');
    
    rootLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // If clicking on the toggle itself
        if (e.target.classList.contains('tree-toggle')) {
            connectionsRoot.classList.toggle('expanded');
            
            if (connectionsRoot.classList.contains('expanded')) {
                rootToggle.textContent = '▶';
                rootChildren.style.display = 'block';
            } else {
                rootToggle.textContent = '▶';
                rootChildren.style.display = 'none';
            }
            return;
        }
    });
    
    // Add event listeners to connection items
    document.querySelectorAll('.connection-item').forEach(item => {
        const label = item.querySelector('.connection-label');
        const toggle = label.querySelector('.tree-toggle');
        const children = item.querySelector('.tree-children');
        
        // Toggle connection children
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // If clicking on the toggle itself, just toggle without connecting
            if (e.target.classList.contains('tree-toggle')) {
                item.classList.toggle('expanded');
                
                if (item.classList.contains('expanded')) {
                    toggle.textContent = '▶';
                    children.style.display = 'block';
                } else {
                    toggle.textContent = '▶';
                    children.style.display = 'none';
                }
                return;
            }
            
            // Otherwise, expand and connect
            item.classList.add('expanded');
            toggle.textContent = '▶';
            children.style.display = 'block';
            
            const connectionId = item.getAttribute('data-id');
            if (!state.activeConnections.has(connectionId)) {
                connectToDatabaseById(connectionId);
            }
        });
    });
}

function updateObjectExplorerWithConnection(connection) {
    // Find the connection item in the Object Explorer
    const connectionItem = document.querySelector(`.connection-item[data-id="${connection.id}"]`);
    if (!connectionItem) return;
    
    // Update the connection icon to show it's connected
    const icon = connectionItem.querySelector('.connection-icon');
    if (icon) {
        icon.textContent = '🟢'; // Green circle to indicate connected
    }
    
    // Expand the connection item
    connectionItem.classList.add('expanded');
    const toggle = connectionItem.querySelector('.tree-toggle');
    if (toggle) {
        toggle.textContent = '▶';
    }
    
    // Show the children
    const children = connectionItem.querySelector('.tree-children');
    if (children) {
        children.style.display = 'block';
        
        // Add all database object categories directly under connection
        children.innerHTML = `
            <div class="tree-item category-item" data-type="category" data-name="tables">
                <span class="tree-label">
                    <span class="tree-toggle">▶</span>
                    📊 Tables
                </span>
                <div class="tree-children" style="display: none;">
                    <div class="tree-item"><span class="tree-label">Loading...</span></div>
                </div>
            </div>
            <div class="tree-item category-item" data-type="category" data-name="views">
                <span class="tree-label">
                    <span class="tree-toggle">▶</span>
                    👁️ Views
                </span>
                <div class="tree-children" style="display: none;">
                    <div class="tree-item"><span class="tree-label">Loading...</span></div>
                </div>
            </div>
            <div class="tree-item category-item" data-type="category" data-name="procedures">
                <span class="tree-label">
                    <span class="tree-toggle">▶</span>
                    ⚙️ Stored Procedures
                </span>
                <div class="tree-children" style="display: none;">
                    <div class="tree-item"><span class="tree-label">Loading...</span></div>
                </div>
            </div>
            <div class="tree-item category-item" data-type="category" data-name="functions">
                <span class="tree-label">
                    <span class="tree-toggle">▶</span>
                    🧮 Functions
                </span>
                <div class="tree-children" style="display: none;">
                    <div class="tree-item"><span class="tree-label">Loading...</span></div>
                </div>
            </div>
        `;
        
        // Request all database objects
        ipcRenderer.send('get-database-objects', connection.id, 'tables');
        ipcRenderer.send('get-database-objects', connection.id, 'views');
        ipcRenderer.send('get-database-objects', connection.id, 'procedures');
        ipcRenderer.send('get-database-objects', connection.id, 'functions');
        
        // Add event listeners to the new tree items
        addTreeEventListeners(connectionItem);
    }
}

function updateConnectionObjects(connectionId, objectType, objects) {
    const connectionItem = document.querySelector(`.connection-item[data-id="${connectionId}"]`);
    if (!connectionItem) return;
    
    // Find the correct category node based on objectType
    let selector = '';
    switch(objectType) {
        case 'tables':
            selector = '.category-item[data-name="tables"] .tree-children';
            break;
        case 'views':
            selector = '.category-item[data-name="views"] .tree-children';
            break;
        case 'procedures':
            selector = '.category-item[data-name="procedures"] .tree-children';
            break;
        case 'functions':
            selector = '.category-item[data-name="functions"] .tree-children';
            break;
        default:
            return;
    }
    
    const objectList = connectionItem.querySelector(selector);
    if (!objectList) return;
    
    if (objects.length === 0) {
        objectList.innerHTML = '<div class="tree-item"><span class="tree-label">No objects found</span></div>';
        return;
    }
    
    let objectsHTML = '';
    objects.forEach(obj => {
        let icon = '📄';
        let type = 'object';
        if (objectType === 'tables') {
            icon = '📋';
            type = 'table';
        } else if (objectType === 'views') {
            icon = '🔍';
            type = 'view';
        } else if (objectType === 'procedures') {
            icon = '⚙️';
            type = 'procedure';
        } else if (objectType === 'functions') {
            icon = '🧮';
            type = 'function';
        }
        
        objectsHTML += `
            <div class="tree-item object-item" data-name="${obj.name}" data-type="${type}">
                <span class="tree-label object-label">
                    <span class="object-icon">${icon}</span>
                    ${obj.name}
                </span>
            </div>
        `;
    });
    
    objectList.innerHTML = objectsHTML;
    
    // Add event listeners to the new objects
    addTreeEventListeners(connectionItem);
}

// Add this new function to fetch column information for a table
function fetchTableColumns(connectionId, tableName) {
    // Send IPC message to main process to get column information
    ipcRenderer.send('get-table-columns', connectionId, tableName);
}

// Update the addTreeEventListeners function to handle table clicks with selection
function addTreeEventListeners(parentElement) {
    // Add event listeners to all tree labels within the parent element
    const treeLabels = parentElement.querySelectorAll('.tree-label');
    treeLabels.forEach(label => {
        // Remove existing event listeners to prevent duplicates
        const newLabel = label.cloneNode(true);
        label.parentNode.replaceChild(newLabel, label);
        
        newLabel.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // If clicking on the toggle itself
            if (e.target.classList.contains('tree-toggle')) {
                const treeItem = this.closest('.tree-item');
                treeItem.classList.toggle('expanded');
                
                const toggle = this.querySelector('.tree-toggle');
                const children = treeItem.querySelector('.tree-children');
                
                if (children) {
                    children.style.display = treeItem.classList.contains('expanded') ? 'block' : 'none';
                }
                
                toggle.textContent = treeItem.classList.contains('expanded') ? '▶' : '▶';
                return;
            }
            
            // Otherwise, just expand
            const treeItem = this.closest('.tree-item');
            treeItem.classList.add('expanded');
            
            const toggle = treeItem.querySelector('.tree-toggle');
            const children = treeItem.querySelector('.tree-children');
            
            if (children) {
                children.style.display = 'block';
            }
            
            if (toggle) {
                toggle.textContent = '▶';
            }
            
            // Handle object item clicks (tables, views, etc.)
            if (treeItem.classList.contains('object-item')) {
                const objectName = treeItem.getAttribute('data-name');
                const objectType = treeItem.getAttribute('data-type');
                
                // Remove selection from previously selected item
                const previouslySelected = document.querySelector('.object-item.selected');
                if (previouslySelected) {
                    previouslySelected.classList.remove('selected');
                }
                
                // Add selection to current item
                treeItem.classList.add('selected');
                
                // For tables, fetch column information and display in Properties panel
                if (objectType === 'table') {
                    // Find the connection ID
                    const connectionItem = treeItem.closest('.connection-item');
                    const connectionId = connectionItem.getAttribute('data-id');
                    
                    // Fetch table columns
                    fetchTableColumns(connectionId, objectName);
                } else {
                    // For other object types, show basic properties
                    updatePropertiesPanel(objectName, objectType);
                }
                
                // Create a new tab for the query
                createNewTab(`${objectName}.sql`);
                
                // Generate appropriate SQL based on object type
                const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                              document.querySelector('.sql-editor');
                if (editor) {
                    let sqlQuery = '';
                    
                    switch(objectType) {
                        case 'table':
                        case 'view':
                            sqlQuery = `SELECT * FROM ${objectName};`;
                            break;

                        case 'procedure':
                            sqlQuery = `EXEC ${objectName};\n\n-- OR with parameters:\n-- EXEC ${objectName} @param1 = value1, @param2 = value2;`;
                            break;
                        case 'function':
                            sqlQuery = `SELECT dbo.${objectName}();\n\n-- OR with parameters:\n-- SELECT dbo.${objectName}(@param1, @param2);`;
                            break;
                        default:
                            sqlQuery = `-- Object: ${objectName}\n-- Type: ${objectType}\n\nSELECT * FROM ${objectName};`;
                    }
                    
                    editor.value = sqlQuery;
                    
                    // Focus the editor and place cursor at the end
                    editor.focus();
                    editor.setSelectionRange(sqlQuery.length, sqlQuery.length);
                }
                
                // Show message
                showMessage(`Selected ${objectType}: ${objectName}`);
            }
        });
    });
}

// Add this new function to handle column information in Properties panel
function updatePropertiesWithColumns(tableName, columns) {
    // Send properties data to the Properties window
    ipcRenderer.send('update-properties-window', {
        itemName: tableName,
        itemType: 'Table',
        schema: 'dbo',
        columns: columns
    });
    
    // Also update the embedded properties panel for backward compatibility
    const propertiesPanel = document.querySelector('.properties-panel .panel-content');
    if (!propertiesPanel) return;
    
    let propertiesHTML = `
        <div class="property-item">
            <label>Table Name:</label>
            <span>${tableName}</span>
        </div>
        <div class="property-item">
            <label>Column Count:</label>
            <span>${columns.length}</span>
        </div>
        <div class="property-item">
            <label>Columns:</label>
            <span></span>
        </div>
    `;
    
    // Add column information
    columns.forEach(column => {
        propertiesHTML += `
            <div class="property-item" style="margin-left: 20px;">
                <label>${column.name}:</label>
                <span>${column.type}${column.nullable ? ' (NULL)' : ' (NOT NULL)'}</span>
            </div>
        `;
    });
    
    propertiesPanel.innerHTML = propertiesHTML;
}

// Update Properties panel with item details
function updatePropertiesPanel(itemName, itemType) {
    // Send properties data to the Properties window
    ipcRenderer.send('update-properties-window', {
        itemName: itemName,
        itemType: itemType,
        schema: itemType === 'table' || itemType === 'view' || itemType === 'procedure' ? 'dbo' : undefined
    });
    
    // Also update the embedded properties panel for backward compatibility
    const propertiesPanel = document.querySelector('.properties-panel .panel-content');
    if (!propertiesPanel) return;
    
    let propertiesHTML = '';
    
    switch(itemType) {
        case 'folder':
            propertiesHTML = `
                <div class="property-item">
                    <label>Name:</label>
                    <span>${itemName}</span>
                </div>
                <div class="property-item">
                    <label>Type:</label>
                    <span>Folder</span>
                </div>
            `;
            break;
        case 'database':
            propertiesHTML = `
                <div class="property-item">
                    <label>Name:</label>
                    <span>${itemName}</span>
                </div>
                <div class="property-item">
                    <label>Type:</label>
                    <span>Database</span>
                </div>
                <div class="property-item">
                    <label>Owner:</label>
                    <span>dbo</span>
                </div>
                <div class="property-item">
                    <label>Created:</label>
                    <span>2023-01-01</span>
                </div>
            `;
            break;
        case 'table':
            propertiesHTML = `
                <div class="property-item">
                    <label>Name:</label>
                    <span>${itemName}</span>
                </div>
                <div class="property-item">
                    <label>Schema:</label>
                    <span>dbo</span>
                </div>
                <div class="property-item">
                    <label>Type:</label>
                    <span>User Table</span>
                </div>
                <div class="property-item">
                    <label>Created:</label>
                    <span>2023-01-01</span>
                </div>
            `;
            break;
        case 'view':
            propertiesHTML = `
                <div class="property-item">
                    <label>Name:</label>
                    <span>${itemName}</span>
                </div>
                <div class="property-item">
                    <label>Schema:</label>
                    <span>dbo</span>
                </div>
                <div class="property-item">
                    <label>Type:</label>
                    <span>View</span>
                </div>
                <div class="property-item">
                    <label>Created:</label>
                    <span>2023-01-01</span>
                </div>
            `;
            break;
        case 'procedure':
            propertiesHTML = `
                <div class="property-item">
                    <label>Name:</label>
                    <span>${itemName}</span>
                </div>
                <div class="property-item">
                    <label>Schema:</label>
                    <span>dbo</span>
                </div>
                <div class="property-item">
                    <label>Type:</label>
                    <span>Stored Procedure</span>
                </div>
                <div class="property-item">
                    <label>Created:</label>
                    <span>2023-01-01</span>
                </div>
            `;
            break;
        case 'function':
            propertiesHTML = `
                <div class="property-item">
                    <label>Name:</label>
                    <span>${itemName}</span>
                </div>
                <div class="property-item">
                    <label>Schema:</label>
                    <span>dbo</span>
                </div>
                <div class="property-item">
                    <label>Type:</label>
                    <span>Scalar Function</span>
                </div>
                <div class="property-item">
                <div class="property-item">
                    <label>Name:</label>
                    <span>${itemName}</span>
                </div>
                <div class="property-item">
                    <label>Schema:</label>
                    <span>dbo</span>
                </div>
                <div class="property-item">
                    <label>Type:</label>
                    <span>View</span>
                </div>
                <div class="property-item">
                    <label>Created:</label>
                    <span>2023-01-01</span>
                </div>
            `;
            break;
        case 'procedure':
            propertiesHTML = `
                <div class="property-item">
                    <label>Name:</label>
                    <span>${itemName}</span>
                </div>
                <div class="property-item">
                    <label>Schema:</label>
                    <span>dbo</span>
                </div>
                <div class="property-item">
                    <label>Type:</label>
                    <span>Stored Procedure</span>
                </div>
                <div class="property-item">
                    <label>Created:</label>
                    <span>2023-01-01</span>
                </div>
            `;
            break;
        default:
            propertiesHTML = `
                <div class="property-item">
                    <label>Name:</label>
                    <span>${itemName}</span>
                </div>
                <div class="property-item">
                    <label>Type:</label>
                    <span>${itemType}</span>
                </div>
            `;
    }
    
    propertiesPanel.innerHTML = propertiesHTML;
}

// Display query results in the results grid with DataTable-like features
function displayQueryResults(data, columns) {
    const resultContent = document.querySelector('.result-content[data-tab-type="results"]');
    if (!resultContent) return;
    
    if (!data || data.length === 0) {
        resultContent.innerHTML = '<div class="no-results">Query executed successfully, but no data was returned.</div>';
        return;
    }
    
    // Create enhanced DataTable-like structure
    let tableHTML = `
        <div class="data-table-container">
            <div class="data-table-info">
                Showing ${data.length} rows
            </div>
            <div class="data-table-filter">
                <input type="text" class="filter-input" placeholder="Search...">
            </div>
            <div class="data-table-wrapper">
                <table class="result-table">
                    <thead>
                        <tr>
    `;
    
    // Create header row with sortable columns
    if (columns && columns.length > 0) {
        columns.forEach((column, index) => {
            tableHTML += `<th class="sortable resizable" data-column="${index}" data-field="${column}">${column}</th>`;
        });
    } else if (data.length > 0) {
        // Infer columns from first row
        Object.keys(data[0]).forEach((key, index) => {
            tableHTML += `<th class="sortable resizable" data-column="${index}" data-field="${key}">${key}</th>`;
        });
    }
    
    tableHTML += `
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    // Create data rows
    data.forEach((row, rowIndex) => {
        tableHTML += '<tr>';
        if (columns && columns.length > 0) {
            columns.forEach((column, colIndex) => {
                const value = row[column] !== undefined ? row[column] : '';
                tableHTML += `<td data-column="${colIndex}" data-row="${rowIndex}">${formatCellValue(value)}</td>`;
            });
        } else {
            // If no columns provided, use all properties
            Object.values(row).forEach((value, colIndex) => {
                tableHTML += `<td data-column="${colIndex}" data-row="${rowIndex}">${formatCellValue(value)}</td>`;
            });
        }
    });
    
    tableHTML += `
                    </tbody>
                </table>
            </div>
            <div class="data-table-pagination">
                <div class="pagination-info">
                    Rows per page: 
                    <select class="rows-per-page">
                        <option value="10">10</option>
                        <option value="25" selected>25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="0">All</option>
                    </select>
                </div>
                <div class="pagination-controls">
                    <button class="pagination-button first-page" title="First page">«</button>
                    <button class="pagination-button prev-page" title="Previous page">‹</button>
                    <span class="pagination-text">Page <span class="current-page">1</span> of <span class="total-pages">1</span></span>
                    <button class="pagination-button next-page" title="Next page">›</button>
                    <button class="pagination-button last-page" title="Last page">»</button>
                </div>
            </div>
        </div>
    `;
    
    resultContent.innerHTML = tableHTML;
    
    // Add event listeners for sorting and filtering
    const table = resultContent.querySelector('.result-table');
    const headerCells = table.querySelectorAll('th.sortable');
    headerCells.forEach(cell => {
        cell.addEventListener('click', () => {
            const columnIndex = cell.getAttribute('data-column');
            const columnField = cell.getAttribute('data-field');
            sortTable(table, columnIndex, columnField);
        });
    });
    
    const filterInput = resultContent.querySelector('.filter-input');
    filterInput.addEventListener('input', () => {
        filterTable(table, filterInput.value);
    });
}

function formatCellValue(value) {
    if (value === null) {
        return '<span style="color: #999;">NULL</span>';
    }
    return value;
}

function sortTable(table, columnIndex, columnField) {
    const rows = Array.from(table.rows).slice(1);
    const isAscending = table.rows[0].cells[columnIndex].getAttribute('data-sort') !== 'asc';
    
    rows.sort((rowA, rowB) => {
        const cellA = rowA.cells[columnIndex].textContent.trim();
        const cellB = rowB.cells[columnIndex].textContent.trim();
        
        if (!isNaN(cellA) && !isNaN(cellB)) {
            return isAscending ? cellA - cellB : cellB - cellA;
        }
        
        return isAscending ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
    });
    
    rows.forEach(row => table.appendChild(row));
    table.rows[0].cells[columnIndex].setAttribute('data-sort', isAscending ? 'asc' : 'desc');
}

function filterTable(table, filterValue) {
    const rows = Array.from(table.rows).slice(1);
    rows.forEach(row => {
        const cells = Array.from(row.cells);
        const cellText = cells.map(cell => cell.textContent.toLowerCase()).join(' ');
        if (cellText.includes(filterValue.toLowerCase())) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

    // Load connections from main process
function loadConnections() {
    ipcRenderer.send('get-connections');
}

// Theme management functions
function setTheme(theme) {
    // Remove existing theme classes
    document.body.classList.remove('theme-light', 'theme-dark');
    
    if (theme === 'system') {
        // Use system preference
        const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.add(isDarkMode ? 'theme-dark' : 'theme-light');
        
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (state.currentTheme === 'system') {
                document.body.classList.remove('theme-light', 'theme-dark');
                document.body.classList.add(e.matches ? 'theme-dark' : 'theme-light');
            }
        });
    } else {
        // Use specified theme
        document.body.classList.add(`theme-${theme}`);
    }
    
    // Save theme preference to localStorage
    localStorage.setItem('theme', theme);
    
    // Update theme in menu
    ipcRenderer.send('update-theme-menu', theme);
}

function initializeTheme() {
    // Load theme from localStorage or default to system
    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);
}

// Main application initialization
function initializeApp() {
    // Load connections when the page loads
    loadConnections();
    
    // Initialize theme
    initializeTheme();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup context menu event listeners
    setupContextMenuEventListeners();
    
    // Initialize UI components
    initializeUI();
}

// Setup context menu event listeners
function setupContextMenuEventListeners() {
    // Add context menu to Object Explorer
    const objectExplorer = document.querySelector('.object-explorer');
    if (objectExplorer) {
        objectExplorer.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            showContextMenu(e, 'object-explorer');
        });
    }
    
    // Add context menu to tree items
    document.addEventListener('contextmenu', function(e) {
        const treeItem = e.target.closest('.tree-item');
        if (treeItem) {
            e.preventDefault();
            const itemType = treeItem.getAttribute('data-type');
            showContextMenu(e, itemType, treeItem);
        }
    });
}

// Show context menu based on item type
function showContextMenu(event, itemType, element) {
    // Remove existing context menus
    removeContextMenu();
    
    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'absolute';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    menu.style.zIndex = '1000';
    
    // Add menu items based on item type
    let menuItems = [];
    switch(itemType) {
        case 'connection':
            menuItems = [
                {label: 'Connect', action: () => connectToSelectedConnection(element)},
                {label: 'Disconnect', action: () => disconnectFromSelectedConnection(element)},
                {label: 'Refresh', action: () => refreshSelectedConnection(element)},
                {label: 'Properties', action: () => showConnectionProperties(element)},
                {label: 'Delete', action: () => deleteSelectedConnection(element)}
            ];
            break;
        case 'table':
            menuItems = [
                {label: 'Select Top 1000 Rows', action: () => selectTopRows(element, 1000)},
                {label: 'Edit Top 200 Rows', action: () => editTopRows(element, 200)},
                {label: 'View Data', action: () => viewTableData(element)},
                {label: 'Script Table as', submenu: [
                    {label: 'CREATE to', action: () => scriptTableAs(element, 'CREATE')},
                    {label: 'DROP to', action: () => scriptTableAs(element, 'DROP')},
                    {label: 'DROP and CREATE to', action: () => scriptTableAs(element, 'DROP_CREATE')}
                ]},
                {label: 'Design', action: () => designTable(element)},
                {label: 'Properties', action: () => showTableProperties(element)}
            ];
            break;
        case 'view':
            menuItems = [
                {label: 'Select Top 1000 Rows', action: () => selectTopRows(element, 1000)},
                {label: 'View Data', action: () => viewTableData(element)},
                {label: 'Script View as', submenu: [
                    {label: 'CREATE to', action: () => scriptTableAs(element, 'CREATE')},
                    {label: 'DROP to', action: () => scriptTableAs(element, 'DROP')},
                    {label: 'DROP and CREATE to', action: () => scriptTableAs(element, 'DROP_CREATE')}
                ]},
                {label: 'Properties', action: () => showTableProperties(element)}
            ];
            break;
        case 'procedure':
            menuItems = [
                {label: 'Execute Procedure', action: () => executeProcedure(element)},
                {label: 'Script Procedure as', submenu: [
                    {label: 'CREATE to', action: () => scriptTableAs(element, 'CREATE')},
                    {label: 'DROP to', action: () => scriptTableAs(element, 'DROP')},
                    {label: 'DROP and CREATE to', action: () => scriptTableAs(element, 'DROP_CREATE')}
                ]},
                {label: 'Properties', action: () => showTableProperties(element)}
            ];
            break;
        case 'function':
            menuItems = [
                {label: 'Script Function as', submenu: [
                    {label: 'CREATE to', action: () => scriptTableAs(element, 'CREATE')},
                    {label: 'DROP to', action: () => scriptTableAs(element, 'DROP')},
                    {label: 'DROP and CREATE to', action: () => scriptTableAs(element, 'DROP_CREATE')}
                ]},
                {label: 'Properties', action: () => showTableProperties(element)}
            ];
            break;
        case 'category-item':
            const categoryName = element.getAttribute('data-name');
            if (categoryName === 'tables') {
                // Special handling for tables category to add "Create Table" option
                const connectionItem = element.closest('.connection-item');
                const connectionId = connectionItem.getAttribute('data-id');
                
                menuItems = [
                    {label: `Refresh ${categoryName}`, action: () => refreshCategory(element)},
                    {label: 'Create Table', action: () => createNewTable(connectionId)},
                    {label: 'Properties', action: () => showCategoryProperties(element)}
                ];
            } else {
                menuItems = [
                    {label: `Refresh ${categoryName}`, action: () => refreshCategory(element)},
                    {label: 'Properties', action: () => showCategoryProperties(element)}
                ];
            }
            break;
        case 'object-explorer':
        default:
            menuItems = [
                {label: 'Refresh', action: () => refreshObjectExplorer()},
                {label: 'Manage Connections', action: () => manageConnections()}
            ];
            break;
    }
    
    // Add menu items to menu
    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        if (item.submenu) {
            menuItem.classList.add('has-submenu');
        }
        menuItem.textContent = item.label;
        menuItem.addEventListener('click', function(e) {
            e.stopPropagation();
            if (item.action) {
                item.action();
                removeContextMenu();
            }
        });
        menu.appendChild(menuItem);
        
        // Add submenu if it exists
        if (item.submenu) {
            const submenu = document.createElement('div');
            submenu.className = 'context-submenu';
            item.submenu.forEach(subItem => {
                const subMenuItem = document.createElement('div');
                subMenuItem.className = 'context-menu-item';
                subMenuItem.textContent = subItem.label;
                subMenuItem.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (subItem.action) {
                        subItem.action();
                        removeContextMenu();
                    }
                });
                submenu.appendChild(subMenuItem);
            });
            menuItem.appendChild(submenu);
        }
    });
    
    // Add menu to document
    document.body.appendChild(menu);
    
    // Position submenu properly
    const submenus = menu.querySelectorAll('.context-submenu');
    submenus.forEach(submenu => {
        const parentItem = submenu.parentElement;
        submenu.style.left = parentItem.offsetWidth + 'px';
        submenu.style.top = '0px';
    });
    
    // Remove menu when clicking elsewhere
    document.addEventListener('click', removeContextMenu);
}

// Remove context menu
function removeContextMenu() {
    const menus = document.querySelectorAll('.context-menu');
    menus.forEach(menu => menu.remove());
    document.removeEventListener('click', removeContextMenu);
}

// Context menu action functions
function connectToSelectedConnection(element) {
    const connectionId = element.getAttribute('data-id');
    connectToDatabaseById(connectionId);
}

function disconnectFromSelectedConnection(element) {
    const connectionId = element.getAttribute('data-id');
    state.activeConnections.delete(connectionId);
    showMessage('Disconnected from database.');
    
    // Update UI to reflect disconnected state
    const icon = element.querySelector('.connection-icon');
    if (icon) {
        icon.textContent = '🔴'; // Red circle to indicate disconnected
    }
    
    // Collapse children
    const children = element.querySelector('.tree-children');
    const toggle = element.querySelector('.tree-toggle');
    if (children) {
        children.style.display = 'none';
        element.classList.remove('expanded');
    }
    if (toggle) {
        toggle.textContent = '▶';
    }
}

function refreshSelectedConnection(element) {
    const connectionId = element.getAttribute('data-id');
    // Re-fetch database objects for this connection
    ipcRenderer.send('get-database-objects', connectionId, 'tables');
    ipcRenderer.send('get-database-objects', connectionId, 'views');
    ipcRenderer.send('get-database-objects', connectionId, 'procedures');
    ipcRenderer.send('get-database-objects', connectionId, 'functions');
    showMessage('Refreshing connection...');
}

function showConnectionProperties(element) {
    const connectionId = element.getAttribute('data-id');
    // In a real implementation, you would show connection properties
    showMessage(`Showing properties for connection ID: ${connectionId}`);
}

function deleteSelectedConnection(element) {
    const connectionId = element.getAttribute('data-id');
    if (confirm('Are you sure you want to delete this connection?')) {
        ipcRenderer.send('delete-connection', connectionId);
    }
}

function selectTopRows(element, count) {
    const tableName = element.getAttribute('data-name');
    const connectionItem = element.closest('.connection-item');
    const connectionId = connectionItem.getAttribute('data-id');
    
    // Create a new query tab
    createNewTab(`${tableName}_SelectTop${count}.sql`);
    
    // Generate SELECT query
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`);
    if (editor) {
        editor.value = `SELECT TOP ${count} * FROM ${tableName};`;
        editor.focus();
    }
    
    showMessage(`Created query to select top ${count} rows from ${tableName}`);
}

function editTopRows(element, count) {
    const tableName = element.getAttribute('data-name');
    const connectionItem = element.closest('.connection-item');
    const connectionId = connectionItem.getAttribute('data-id');
    
    // Create a new query tab
    createNewTab(`${tableName}_EditTop${count}.sql`);
    
    // Generate SELECT query for editing
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`);
    if (editor) {
        editor.value = `-- Edit Top ${count} Rows
SELECT TOP ${count} * FROM ${tableName};

-- Add your UPDATE statements here
-- UPDATE ${tableName} SET column1 = value1 WHERE condition;`;
        editor.focus();
    }
    
    showMessage(`Created query to edit top ${count} rows from ${tableName}`);
}

function viewTableData(element) {
    const tableName = element.getAttribute('data-name');
    const connectionItem = element.closest('.connection-item');
    const connectionId = connectionItem.getAttribute('data-id');
    
    // Execute a SELECT * query
    const query = `SELECT * FROM ${tableName};`;
    ipcRenderer.send('execute-query', connectionId, query);
    
    showMessage(`Executing query: SELECT * FROM ${tableName}`);
}

function scriptTableAs(element, scriptType) {
    const tableName = element.getAttribute('data-name');
    const connectionItem = element.closest('.connection-item');
    const connectionId = connectionItem.getAttribute('data-id');
    
    // Create a new query tab
    createNewTab(`${tableName}_${scriptType}.sql`);
    
    // Generate appropriate script
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`);
    if (editor) {
        let script = '';
        switch(scriptType) {
            case 'CREATE':
                // Request table schema to generate CREATE script
                ipcRenderer.send('get-table-schema', { connectionId, tableName });
                
                // Listen for the response
                ipcRenderer.once('table-schema', (event, { tableName, columns, databaseType, error }) => {
                    if (error) {
                        script = `-- Error generating CREATE script for ${tableName}\n-- ${error}`;
                    } else {
                        script = generateCreateTableScript(tableName, columns, databaseType);
                    }
                    
                    editor.value = script;
                    editor.focus();
                    showMessage(`Generated ${scriptType} script for ${tableName}`);
                });
                return;
            case 'DROP':
                script = `-- DROP script for ${tableName}\nDROP TABLE ${tableName};`;
                break;
            case 'DROP_CREATE':
                script = `-- DROP and CREATE script for ${tableName}
DROP TABLE ${tableName};

-- CREATE script for ${tableName}
-- This is a placeholder. In a real implementation, this would generate the actual CREATE statement.`;
                break;
        }
        editor.value = script;
        editor.focus();
    }
    
    showMessage(`Generated ${scriptType} script for ${tableName}`);
}

// Function to generate CREATE TABLE script based on database type
function generateCreateTableScript(tableName, columns, databaseType) {
    let script = `-- CREATE script for ${tableName}\n`;
    
    switch(databaseType) {
        case 'mysql':
            script += generateMySQLCreateTableScript(tableName, columns);
            break;
        case 'postgresql':
            script += generatePostgreSQLCreateTableScript(tableName, columns);
            break;
        case 'mssql':
            script += generateMSSQLCreateTableScript(tableName, columns);
            break;
        case 'sqlite':
            script += generateSQLiteCreateTableScript(tableName, columns);
            break;
        case 'oracle':
            script += generateOracleCreateTableScript(tableName, columns);
            break;
        case 'mongodb':
            script += generateMongoDBCreateTableScript(tableName, columns);
            break;
        default:
            script += `-- Unsupported database type: ${databaseType}\n`;
            script += `-- This is a placeholder. In a real implementation, this would generate the actual CREATE statement.`;
    }
    
    return script;
}

// Generate MySQL CREATE TABLE script
function generateMySQLCreateTableScript(tableName, columns) {
    let script = `CREATE TABLE \`${tableName}\` (\n`;
    
    const columnDefinitions = columns.map(column => {
        let definition = `  \`${column.name}\` ${column.type.toUpperCase()}`;
        
        // Add length for character types
        if (column.charMaxLength && (column.type.includes('char') || column.type.includes('binary'))) {
            definition += `(${column.charMaxLength})`;
        }
        
        // Add precision and scale for numeric types
        if (column.numericPrecision && (column.type === 'decimal' || column.type === 'numeric')) {
            const scale = column.numericScale || 0;
            definition += `(${column.numericPrecision},${scale})`;
        }
        
        // Add nullability
        if (!column.nullable) {
            definition += ' NOT NULL';
        } else {
            definition += ' NULL';
        }
        
        // Add default value
        if (column.defaultValue !== null && column.defaultValue !== undefined) {
            definition += ` DEFAULT ${column.defaultValue}`;
        }
        
        // Add auto increment
        if (column.isAutoIncrement) {
            definition += ' AUTO_INCREMENT';
        }
        
        return definition;
    });
    
    script += columnDefinitions.join(',\n');
    
    // Add primary key constraint
    const primaryKeyColumns = columns.filter(col => col.isPrimaryKey).map(col => `\`${col.name}\``);
    if (primaryKeyColumns.length > 0) {
        script += `,\n  PRIMARY KEY (${primaryKeyColumns.join(', ')})`;
    }
    
    script += '\n);';
    
    return script;
}

// Generate PostgreSQL CREATE TABLE script
function generatePostgreSQLCreateTableScript(tableName, columns) {
    let script = `CREATE TABLE "${tableName}" (\n`;
    
    const columnDefinitions = columns.map(column => {
        let definition = `  "${column.name}" ${column.type.toUpperCase()}`;
        
        // Add length for character types
        if (column.charMaxLength && (column.type === 'char' || column.type === 'varchar')) {
            definition += `(${column.charMaxLength})`;
        }
        
        // Add precision and scale for numeric types
        if (column.numericPrecision && (column.type === 'decimal' || column.type === 'numeric')) {
            const scale = column.numericScale || 0;
            definition += `(${column.numericPrecision},${scale})`;
        }
        
        // Add nullability
        if (!column.nullable) {
            definition += ' NOT NULL';
        }
        
        // Add default value
        if (column.defaultValue !== null && column.defaultValue !== undefined) {
            definition += ` DEFAULT ${column.defaultValue}`;
        }
        
        return definition;
    });
    
    script += columnDefinitions.join(',\n');
    
    // Add primary key constraint
    const primaryKeyColumns = columns.filter(col => col.isPrimaryKey).map(col => `"${col.name}"`);
    if (primaryKeyColumns.length > 0) {
        script += `,\n  PRIMARY KEY (${primaryKeyColumns.join(', ')})`;
    }
    
    script += '\n);';
    
    return script;
}

// Generate SQL Server CREATE TABLE script
function generateMSSQLCreateTableScript(tableName, columns) {
    let script = `CREATE TABLE [${tableName}] (\n`;
    
    const columnDefinitions = columns.map(column => {
        let definition = `  [${column.name}] ${column.type.toUpperCase()}`;
        
        // Add length for character/binary types
        if (column.charMaxLength && (column.type.includes('char') || column.type.includes('binary'))) {
            definition += `(${column.charMaxLength})`;
        }
        
        // Add precision and scale for numeric types
        if (column.numericPrecision && (column.type === 'decimal' || column.type === 'numeric')) {
            const scale = column.numericScale || 0;
            definition += `(${column.numericPrecision},${scale})`;
        }
        
        // Add nullability
        if (!column.nullable) {
            definition += ' NOT NULL';
        } else {
            definition += ' NULL';
        }
        
        // Add default value
        if (column.defaultValue !== null && column.defaultValue !== undefined) {
            definition += ` DEFAULT ${column.defaultValue}`;
        }
        
        // Add identity
        if (column.isIdentity) {
            definition += ' IDENTITY(1,1)';
        }
        
        return definition;
    });
    
    script += columnDefinitions.join(',\n');
    
    // Add primary key constraint
    const primaryKeyColumns = columns.filter(col => col.isPrimaryKey).map(col => `[${col.name}]`);
    if (primaryKeyColumns.length > 0) {
        script += `,\n  PRIMARY KEY (${primaryKeyColumns.join(', ')})`;
    }
    
    script += '\n);';
    
    return script;
}

// Generate SQLite CREATE TABLE script
function generateSQLiteCreateTableScript(tableName, columns) {
    let script = `CREATE TABLE "${tableName}" (\n`;
    
    const columnDefinitions = columns.map(column => {
        let definition = `  "${column.name}" ${column.type.toUpperCase()}`;
        
        // Add nullability
        if (!column.nullable) {
            definition += ' NOT NULL';
        }
        
        // Add default value
        if (column.defaultValue !== null && column.defaultValue !== undefined) {
            definition += ` DEFAULT ${column.defaultValue}`;
        }
        
        // Add primary key
        if (column.isPrimaryKey) {
            definition += ' PRIMARY KEY';
            // Add autoincrement for int primary keys
            if (column.type === 'int' || column.type === 'integer') {
                definition += ' AUTOINCREMENT';
            }
        }
        
        return definition;
    });
    
    script += columnDefinitions.join(',\n');
    script += '\n);';
    
    return script;
}

// Generate Oracle CREATE TABLE script
function generateOracleCreateTableScript(tableName, columns) {
    let script = `CREATE TABLE "${tableName}" (\n`;
    
    const columnDefinitions = columns.map(column => {
        let definition = `  "${column.name}" ${column.type.toUpperCase()}`;
        
        // Add length for character types
        if (column.charMaxLength && (column.type === 'char' || column.type === 'varchar2')) {
            definition += `(${column.charMaxLength})`;
        }
        
        // Add precision and scale for numeric types
        if (column.numericPrecision && column.type === 'number') {
            const scale = column.numericScale || 0;
            definition += `(${column.numericPrecision},${scale})`;
        }
        
        // Add nullability
        if (!column.nullable) {
            definition += ' NOT NULL';
        }
        
        // Add default value
        if (column.defaultValue !== null && column.defaultValue !== undefined) {
            definition += ` DEFAULT ${column.defaultValue}`;
        }
        
        return definition;
    });
    
    script += columnDefinitions.join(',\n');
    script += '\n);';
    
    // Add primary key constraint separately if needed
    const primaryKeyColumns = columns.filter(col => col.isPrimaryKey).map(col => `"${col.name}"`);
    if (primaryKeyColumns.length > 0) {
        script += `\n\nALTER TABLE "${tableName}" ADD CONSTRAINT "PK_${tableName}" PRIMARY KEY (${primaryKeyColumns.join(', ')});`;
    }
    
    return script;
}

function designTable(element) {
    const tableName = element.getAttribute('data-name');
    const connectionItem = element.closest('.connection-item');
    const connectionId = connectionItem.getAttribute('data-id');
    
    // Open table design window in edit mode
    ipcRenderer.send('open-table-design', { tableName, connectionId, mode: 'edit' });
    
    showMessage(`Opening table designer for ${tableName}...`);
}

// Add a new function to create a new table
function createNewTable(connectionId) {
    // Open table design window in create mode
    ipcRenderer.send('open-table-design', { tableName: '', connectionId, mode: 'create' });
    
    showMessage('Opening table designer for new table...');
}

function showTableProperties(element) {
    const tableName = element.getAttribute('data-name');
    const connectionItem = element.closest('.connection-item');
    const connectionId = connectionItem.getAttribute('data-id');
    
    // Fetch and display table columns in Properties panel
    fetchTableColumns(connectionId, tableName);
    showMessage(`Showing properties for table: ${tableName}`);
}

function executeProcedure(element) {
    const procedureName = element.getAttribute('data-name');
    const connectionItem = element.closest('.connection-item');
    const connectionId = connectionItem.getAttribute('data-id');
    
    // Create a new query tab
    createNewTab(`${procedureName}_Execute.sql`);
    
    // Generate EXEC query
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`);
    if (editor) {
        editor.value = `EXEC ${procedureName};\n\n-- OR with parameters:\n-- EXEC ${procedureName} @param1 = value1, @param2 = value2;`;
        editor.focus();
    }
    
    showMessage(`Created query to execute procedure: ${procedureName}`);
}

function refreshCategory(element) {
    const categoryName = element.getAttribute('data-name');
    const connectionItem = element.closest('.connection-item');
    const connectionId = connectionItem.getAttribute('data-id');
    
    // Re-fetch objects for this category
    ipcRenderer.send('get-database-objects', connectionId, categoryName);
    showMessage(`Refreshing ${categoryName}...`);
}

function showCategoryProperties(element) {
    const categoryName = element.getAttribute('data-name');
    showMessage(`Showing properties for category: ${categoryName}`);
}

function refreshObjectExplorer() {
    loadConnections();
    showMessage('Refreshing Object Explorer...');
}

// Format cell values for better display
function formatCellValue(value) {
    if (value === null) return '<span class="null-value">NULL</span>';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

// Add event listeners for DataTable features
function addDataTableEventListeners(container, data, columns) {
    // Sorting
    const sortableHeaders = container.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const columnIndex = parseInt(this.getAttribute('data-column'));
            const fieldName = this.getAttribute('data-field');
            sortTable(container, data, columns, columnIndex, fieldName);
        });
    });
    
    // Column resizing
    const resizableHeaders = container.querySelectorAll('.resizable');
    resizableHeaders.forEach(header => {
        let isResizing = false;
        let startX, startWidth;
        
        header.addEventListener('mousedown', function(e) {
            // Check if clicking on the resize handle
            if (e.offsetX > this.offsetWidth - 10) {
                isResizing = true;
                startX = e.clientX;
                startWidth = this.offsetWidth;
                document.body.style.cursor = 'col-resize';
                e.preventDefault();
            }
        });
        
        document.addEventListener('mousemove', function(e) {
            if (!isResizing) return;
            const newWidth = startWidth + (e.clientX - startX);
            if (newWidth > 50) { // Minimum column width
                header.style.width = newWidth + 'px';
            }
        });
        
        document.addEventListener('mouseup', function() {
            isResizing = false;
            document.body.style.cursor = '';
        });
    });
    
    // Filtering
    const filterInput = container.querySelector('.filter-input');
    if (filterInput) {
        filterInput.addEventListener('input', function() {
            filterTable(container, data, columns, this.value);
        });
    }
    
    // Pagination controls
    const paginationControls = container.querySelector('.pagination-controls');
    if (paginationControls) {
        const rowsPerPageSelect = container.querySelector('.rows-per-page');
        const currentPageSpan = container.querySelector('.current-page');
        const totalPagesSpan = container.querySelector('.total-pages');
        
        // Set initial pagination state
        const rowsPerPage = parseInt(rowsPerPageSelect.value) || data.length;
        const totalPages = rowsPerPage === 0 ? 1 : Math.ceil(data.length / rowsPerPage);
        totalPagesSpan.textContent = totalPages;
        
        // Add event listeners for pagination buttons
        paginationControls.addEventListener('click', function(e) {
            if (e.target.classList.contains('pagination-button')) {
                const action = e.target.classList[1]; // Get the action class (first-page, prev-page, etc.)
                handlePagination(container, data, columns, action);
            }
        });
        
        rowsPerPageSelect.addEventListener('change', function() {
            updatePagination(container, data, columns, 1);
        });
    }
}

// Sort table by column
function sortTable(container, data, columns, columnIndex, fieldName) {
    // Toggle sort direction
    const currentHeader = container.querySelector(`th[data-column="${columnIndex}"]`);
    const isAscending = !currentHeader.classList.contains('sort-asc');
    
    // Remove sort classes from all headers
    container.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Add sort class to current header
    currentHeader.classList.add(isAscending ? 'sort-asc' : 'sort-desc');
    
    // Sort data
    const sortedData = [...data].sort((a, b) => {
        let valueA = columns ? a[columns[columnIndex]] : Object.values(a)[columnIndex];
        let valueB = columns ? b[columns[columnIndex]] : Object.values(b)[columnIndex];
        
        // Handle null/undefined values
        if (valueA == null) valueA = '';
        if (valueB == null) valueB = '';
        
        // Convert to string for comparison
        valueA = String(valueA);
        valueB = String(valueB);
        
        // Compare values
        if (isAscending) {
            return valueA.localeCompare(valueB);
        } else {
            return valueB.localeCompare(valueA);
        }
    });
    
    // Re-render table with sorted data
    renderTableBody(container, sortedData, columns);
}

// Filter table based on search term
function filterTable(container, data, columns, searchTerm) {
    if (!searchTerm) {
        // If no search term, show all data
        renderTableBody(container, data, columns);
        return;
    }
    
    // Filter data based on search term
    const filteredData = data.filter(row => {
        // Check all columns for the search term
        return Object.values(row).some(value => {
            if (value == null) return false;
            return String(value).toLowerCase().includes(searchTerm.toLowerCase());
        });
    });
    
    // Re-render table with filtered data
    renderTableBody(container, filteredData, columns);
    
    // Update info text
    const infoElement = container.querySelector('.data-table-info');
    if (infoElement) {
        infoElement.textContent = `Showing ${filteredData.length} of ${data.length} rows`;
    }
}

// Handle pagination actions
function handlePagination(container, data, columns, action) {
    const currentPageSpan = container.querySelector('.current-page');
    const totalPagesSpan = container.querySelector('.total-pages');
    const rowsPerPageSelect = container.querySelector('.rows-per-page');
    
    let currentPage = parseInt(currentPageSpan.textContent);
    const totalPages = parseInt(totalPagesSpan.textContent);
    const rowsPerPage = parseInt(rowsPerPageSelect.value) || data.length;
    
    switch (action) {
        case 'first-page':
            currentPage = 1;
            break;
        case 'prev-page':
            currentPage = Math.max(1, currentPage - 1);
            break;
        case 'next-page':
            currentPage = Math.min(totalPages, currentPage + 1);
            break;
        case 'last-page':
            currentPage = totalPages;
            break;
    }
    
    updatePagination(container, data, columns, currentPage);
}

// Update pagination display
function updatePagination(container, data, columns, page) {
    const currentPageSpan = container.querySelector('.current-page');
    const totalPagesSpan = container.querySelector('.total-pages');
    const rowsPerPageSelect = container.querySelector('.rows-per-page');
    
    const rowsPerPage = parseInt(rowsPerPageSelect.value) || data.length;
    const totalPages = rowsPerPage === 0 ? 1 : Math.ceil(data.length / rowsPerPage);
    
    currentPageSpan.textContent = page;
    totalPagesSpan.textContent = totalPages;
    
    // Render the appropriate page of data
    const startIndex = (page - 1) * rowsPerPage;
    const endIndex = rowsPerPage === 0 ? data.length : startIndex + rowsPerPage;
    const pageData = data.slice(startIndex, endIndex);
    
    renderTableBody(container, pageData, columns);
}

// Render table body with given data
function renderTableBody(container, data, columns) {
    const tbody = container.querySelector('tbody');
    if (!tbody) return;
    
    let rowsHTML = '';
    
    data.forEach((row, rowIndex) => {
        rowsHTML += '<tr>';
        if (columns && columns.length > 0) {
            columns.forEach((column, colIndex) => {
                const value = row[column] !== undefined ? row[column] : '';
                rowsHTML += `<td data-column="${colIndex}" data-row="${rowIndex}">${formatCellValue(value)}</td>`;
            });
        } else {
            // If no columns provided, use all properties
            Object.values(row).forEach((value, colIndex) => {
                rowsHTML += `<td data-column="${colIndex}" data-row="${rowIndex}">${formatCellValue(value)}</td>`;
            });
        }
        rowsHTML += '</tr>';
    });
    
    tbody.innerHTML = rowsHTML;
}

// Display query messages
function displayQueryMessages(message) {
    const messagesContent = document.querySelector('.messages-content');
    if (!messagesContent) return;
    
    const timestamp = new Date().toLocaleTimeString();
    messagesContent.innerHTML += `[${timestamp}] ${message}\n`;
    messagesContent.scrollTop = messagesContent.scrollHeight;
}

// Display query errors
function displayQueryError(error) {
    const resultContent = document.querySelector('.result-content[data-tab-type="results"]');
    if (!resultContent) return;
    
    resultContent.innerHTML = `<div class="query-error">Error: ${error}</div>`;
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl+Tab or Cmd+Tab to navigate to next tab
        if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            navigateToTab(1);
        }
        
        // Ctrl+Shift+Tab or Cmd+Shift+Tab to navigate to previous tab
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Tab') {
            e.preventDefault();
            navigateToTab(-1);
        }
        
        // Ctrl+W or Cmd+W to close current tab
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            e.preventDefault();
            closeTab(state.activeTabId);
        }
        
        // Ctrl+T or Cmd+T to create new tab
        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
            e.preventDefault();
            createNewTab(`SQLQuery_${state.tabCounter + 1}.sql`);
        }
        
        // Ctrl+PageUp or Cmd+Option+Left to go to previous tab
        if ((e.ctrlKey && e.key === 'PageUp') || (e.metaKey && e.altKey && e.key === 'ArrowLeft')) {
            e.preventDefault();
            navigateToTab(-1);
        }
        
        // Ctrl+PageDown or Cmd+Option+Right to go to next tab
        if ((e.ctrlKey && e.key === 'PageDown') || (e.metaKey && e.altKey && e.key === 'ArrowRight')) {
            e.preventDefault();
            navigateToTab(1);
        }
        
        // Ctrl+N or Cmd+N for new query
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            newQuery();
        }
        
        // Ctrl+E or Cmd+E for execute query
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            executeQuery();
        }
        
        // Ctrl+Shift+P to toggle properties panel
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            togglePropertiesPanel();
        }
    });
}

// Save current file
function saveCurrentFile() {
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    const content = editor.value;
    
    // In a real implementation, you would send this to the main process to save to a file
    // For now, we'll just show a message
    showMessage('File saved successfully');
    
    // Send to main process to handle actual file saving
    ipcRenderer.send('save-file-content', content, state.activeTabId);
}

// Save file as
function saveFileAs() {
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    const content = editor.value;
    
    // Send to main process to handle save as dialog
    ipcRenderer.send('save-file-as-dialog', content, state.activeTabId);
}

// Show find dialog
function showFindDialog() {
    // Check if find dialog already exists
    let findDialog = document.getElementById('find-dialog');
    if (findDialog) {
        findDialog.style.display = 'block';
        return;
    }
    
    // Create find dialog
    findDialog = document.createElement('div');
    findDialog.id = 'find-dialog';
    findDialog.className = 'dialog';
    findDialog.innerHTML = `
        <div class="dialog-overlay"></div>
        <div class="dialog-content">
            <div class="dialog-header">
                <span class="dialog-title">Find</span>
                <button class="dialog-close" id="find-close">×</button>
            </div>
            <div class="dialog-body">
                <div class="form-group">
                    <label for="find-text">Find what:</label>
                    <input type="text" id="find-text" class="form-control">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="match-case"> Match case
                    </label>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="match-whole-word"> Match whole word
                    </label>
                </div>
            </div>
            <div class="dialog-footer">
                <button class="btn btn-primary" id="find-next">Find Next</button>
                <button class="btn btn-secondary" id="find-cancel">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(findDialog);
    
    // Get editor reference
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    
    // Focus on find input
    const findInput = document.getElementById('find-text');
    findInput.focus();
    
    // Set up event listeners
    document.getElementById('find-close').addEventListener('click', hideFindDialog);
    document.getElementById('find-cancel').addEventListener('click', hideFindDialog);
    document.getElementById('find-next').addEventListener('click', () => findNext(editor, findInput.value));
    
    // Handle Enter key in find input
    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            findNext(editor, findInput.value);
        }
    });
    
    // Handle Escape key to close dialog
    findDialog.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideFindDialog();
        }
    });
}

// Show replace dialog
function showReplaceDialog() {
    // Check if replace dialog already exists
    let replaceDialog = document.getElementById('replace-dialog');
    if (replaceDialog) {
        replaceDialog.style.display = 'block';
        return;
    }
    
    // Create replace dialog
    replaceDialog = document.createElement('div');
    replaceDialog.id = 'replace-dialog';
    replaceDialog.className = 'dialog';
    replaceDialog.innerHTML = `
        <div class="dialog-overlay"></div>
        <div class="dialog-content">
            <div class="dialog-header">
                <span class="dialog-title">Replace</span>
                <button class="dialog-close" id="replace-close">×</button>
            </div>
            <div class="dialog-body">
                <div class="form-group">
                    <label for="replace-find-text">Find what:</label>
                    <input type="text" id="replace-find-text" class="form-control">
                </div>
                <div class="form-group">
                    <label for="replace-text">Replace with:</label>
                    <input type="text" id="replace-text" class="form-control">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="replace-match-case"> Match case
                    </label>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="replace-match-whole-word"> Match whole word
                    </label>
                </div>
            </div>
            <div class="dialog-footer">
                <button class="btn btn-primary" id="replace-find-next">Find Next</button>
                <button class="btn btn-secondary" id="replace-one">Replace</button>
                <button class="btn btn-secondary" id="replace-all">Replace All</button>
                <button class="btn btn-secondary" id="replace-cancel">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(replaceDialog);
    
    // Get editor reference
    const editor = document.querySelector(`.query-editor[data-tab-id="${state.activeTabId}"] .sql-editor`) || 
                  document.querySelector('.sql-editor');
    
    // Focus on find input
    const findInput = document.getElementById('replace-find-text');
    findInput.focus();
    
    // Set up event listeners
    document.getElementById('replace-close').addEventListener('click', hideReplaceDialog);
    document.getElementById('replace-cancel').addEventListener('click', hideReplaceDialog);
    document.getElementById('replace-find-next').addEventListener('click', () => findNext(editor, findInput.value));
    document.getElementById('replace-one').addEventListener('click', () => replaceOne(editor));
    document.getElementById('replace-all').addEventListener('click', () => replaceAll(editor));
    
    // Handle Enter key in find input
    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            findNext(editor, findInput.value);
        }
    });
    
    // Handle Escape key to close dialog
    replaceDialog.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideReplaceDialog();
        }
    });
}

// Hide find dialog
function hideFindDialog() {
    const findDialog = document.getElementById('find-dialog');
    if (findDialog) {
        findDialog.style.display = 'none';
    }
}

// Hide replace dialog
function hideReplaceDialog() {
    const replaceDialog = document.getElementById('replace-dialog');
    if (replaceDialog) {
        replaceDialog.style.display = 'none';
    }
}

// Find next occurrence
function findNext(editor, searchText) {
    if (!editor || !searchText) return;
    
    const content = editor.value;
    const flags = getSearchFlags();
    const regex = createSearchRegex(searchText, flags);
    
    // Get current cursor position
    const startPos = editor.selectionEnd;
    
    // Search from current position to end
    const match = content.substring(startPos).search(regex);
    if (match !== -1) {
        const actualPos = startPos + match;
        const matchLength = searchText.length;
        editor.setSelectionRange(actualPos, actualPos + matchLength);
        editor.focus();
        return;
    }
    
    // If not found, search from beginning
    const matchFromStart = content.search(regex);
    if (matchFromStart !== -1) {
        const matchLength = searchText.length;
        editor.setSelectionRange(matchFromStart, matchFromStart + matchLength);
        editor.focus();
        showMessage('Reached end of document, continued from beginning');
        return;
    }
    
    // Not found
    showMessage(`Cannot find "${searchText}"`);
}

// Replace one occurrence
function replaceOne(editor) {
    if (!editor) return;
    
    const findText = document.getElementById('replace-find-text').value;
    const replaceText = document.getElementById('replace-text').value;
    
    if (!findText) return;
    
    const content = editor.value;
    const flags = getReplaceSearchFlags();
    const regex = createSearchRegex(findText, flags);
    
    // Get current selection
    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    const selectedText = content.substring(selectionStart, selectionEnd);
    
    // Check if selected text matches find text
    if (regex.test(selectedText)) {
        // Replace the selected text
        const newContent = content.substring(0, selectionStart) + replaceText + content.substring(selectionEnd);
        editor.value = newContent;
        
        // Select the replacement text
        editor.setSelectionRange(selectionStart, selectionStart + replaceText.length);
        editor.focus();
        
        showMessage('Replaced 1 occurrence');
        return;
    }
    
    // If not currently selected, find next and then replace
    findNext(editor, findText);
}

// Replace all occurrences
function replaceAll(editor) {
    if (!editor) return;
    
    const findText = document.getElementById('replace-find-text').value;
    const replaceText = document.getElementById('replace-text').value;
    
    if (!findText) return;
    
    const content = editor.value;
    const flags = getReplaceSearchFlags();
    const regex = createSearchRegex(findText, flags);
    
    const newContent = content.replace(regex, replaceText);
    const count = (content.match(regex) || []).length;
    
    editor.value = newContent;
    editor.focus();
    
    showMessage(`Replaced ${count} occurrences`);
}

// Get search flags based on checkboxes
function getSearchFlags() {
    const matchCase = document.getElementById('match-case')?.checked || false;
    const matchWholeWord = document.getElementById('match-whole-word')?.checked || false;
    
    let flags = 'g'; // global
    if (!matchCase) {
        flags += 'i'; // case insensitive
    }
    
    return { flags, matchWholeWord };
}

// Get replace search flags based on checkboxes
function getReplaceSearchFlags() {
    const matchCase = document.getElementById('replace-match-case')?.checked || false;
    const matchWholeWord = document.getElementById('replace-match-whole-word')?.checked || false;
    
    let flags = 'g'; // global
    if (!matchCase) {
        flags += 'i'; // case insensitive
    }
    
    return { flags, matchWholeWord };
}

// Create search regex
function createSearchRegex(searchText, options) {
    const { flags, matchWholeWord } = options;
    
    // Escape special regex characters
    let escapedText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    if (matchWholeWord) {
        escapedText = '\\b' + escapedText + '\\b';
    }
    
    return new RegExp(escapedText, flags);
}

// Show message in status bar (main status only)
function showMessage(message) {
    const statusMain = document.getElementById('status-main');
    if (statusMain) {
        statusMain.textContent = message;
        
        // Clear message after 5 seconds
        setTimeout(() => {
            if (statusMain.textContent === message) {
                statusMain.textContent = 'Ready';
            }
        }, 5000);
    }
}

// Update records count in status bar
function updateRecordsCount(count) {
    const statusRecords = document.getElementById('status-records');
    if (statusRecords) {
        statusRecords.textContent = `${count} records`;
    }
}

// Update connections menu
function updateConnectionsMenu(connections) {
    const connectionsMenu = document.getElementById('connections-menu');
    if (!connectionsMenu) return;
    
    // Clear existing items except the first one (Connect...)
    while (connectionsMenu.children.length > 1) {
        connectionsMenu.removeChild(connectionsMenu.lastChild);
    }
    
    // Add connection items
    connections.forEach(connection => {
        const menuItem = document.createElement('div');
        menuItem.className = 'dropdown-item';
        menuItem.textContent = connection.name;
        menuItem.addEventListener('click', () => {
            connectToDatabaseById(connection.id);
        });
        connectionsMenu.appendChild(menuItem);
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});