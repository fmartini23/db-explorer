# Project Structure

This document describes the organized folder structure of the DB Explorer project.

## Overview

```
db-explorer/
├── src/
│   ├── main/
│   ├── renderer/
│   ├── assets/
│   │   ├── icons/
│   │   └── screenshots/
│   └── utils/
├── tests/
├── docs/
├── dist/
├── node_modules/
├── package.json
├── package-lock.json
└── .gitignore
```

## Detailed Structure

### `src/` - Source Code
Contains all the source code for the application.

#### `src/main/`
Contains the main Electron process files:
- `main.js` - Main Electron process, window management, and database connections

#### `src/renderer/`
Contains the renderer process files (UI logic):
- `renderer.js` - Renderer process logic, event handling, and communication with main process
- `index.html` - Main application interface
- `connection.html` - Connection manager UI
- `table-design.html` - Table designer UI
- `properties.html` - Properties window UI
- `about.html` - About dialog
- `database-monitor.html` - Database monitoring interface
- `execution-plan.html` - Execution plan visualization
- `styles.css` - Application styles
- `execution-plan.js` - Execution plan specific JavaScript

#### `src/assets/`
Contains static assets used by the application:
- `icons/` - Application icons and UI icons
- `screenshots/` - Screenshots for documentation
- `sample_query.sql` - Sample SQL query file

#### `src/utils/`
Contains utility functions and helper modules.

### `tests/`
Contains all test files:
- Unit tests
- Integration tests
- Functional tests
- Test data files (`.sql` files)

### `docs/`
Contains documentation files:
- `README.md` - Main project documentation
- `CHANGELOG.md` - Version change log
- `LICENSE` - License information
- `PROJECT_STRUCTURE.md` - This file

### `dist/`
Contains built distributable packages (created during build process).

### Root Files
- `package.json` - Project metadata and dependencies
- `package-lock.json` - Locked dependency versions
- `.gitignore` - Git ignore rules
- `electron-builder.json` - Electron builder configuration

## Benefits of This Structure

1. **Separation of Concerns**: Clear separation between main process and renderer process code
2. **Scalability**: Easy to add new features and modules
3. **Maintainability**: Organized structure makes it easier to locate and modify files
4. **Testability**: Dedicated test directory for all testing needs
5. **Documentation**: Centralized documentation directory
6. **Asset Management**: Proper organization of static assets

## Development Guidelines

1. **Main Process Code**: All Electron main process code should go in `src/main/`
2. **Renderer Code**: All UI and renderer process code should go in `src/renderer/`
3. **Assets**: Static assets should be placed in appropriate subdirectories of `src/assets/`
4. **Tests**: All test files should be placed in the `tests/` directory
5. **Documentation**: All documentation should be placed in the `docs/` directory
6. **Utilities**: Helper functions and utility modules should be placed in `src/utils/`
