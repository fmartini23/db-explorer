# DB Explorer

A desktop application for database management with a layout similar to Microsoft SQL Server Management Studio, built with Electron.

![DB Explorer Screenshot]

## Features

### Database Management
- **Multi-Database Support**: Connect to MySQL, PostgreSQL, SQL Server, SQLite, Oracle, and MongoDB
- **Object Explorer**: Browse database objects (tables, views, stored procedures, functions) in a tree structure
- **Connection Management**: Securely store and manage multiple database connections with encrypted passwords
- **Database Object Properties**: View detailed properties of tables, views, procedures, and functions

### Query Editor
- **SQL Editor**: Full-featured SQL editor with syntax highlighting
- **Tabbed Interface**: Work with multiple queries simultaneously
- **Query Execution**: Execute SQL queries with detailed execution statistics
- **Results Grid**: Display query results in a sortable, filterable data grid
- **Messages Panel**: View execution messages, errors, and performance statistics

### User Interface
- **Professional UI**: Interface similar to SQL Server Management Studio
- **Dark/Light Theme**: Automatic theme switching based on system preferences
- **Properties Panel**: Dedicated panel for viewing object properties
- **Context Menus**: Right-click context menus for database objects with common actions
- **Status Bar**: Real-time display of record counts and execution statistics

### Advanced Features
- **Table Designer**: Visual table design and creation tool
- **Script Generation**: Generate CREATE, DROP, and DROP/CREATE scripts for database objects
- **Data Viewing**: Quickly view top rows of tables and views
- **Query History**: Access previously executed queries
- **Export Results**: Export query results (planned feature)

## Installation

### Prerequisites
- Node.js (version 14 or higher)
- npm (usually comes with Node.js)

### Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/fmartini23/db-explorer.git
   ```

2. Navigate to the project directory:
   ```bash
   cd db-explorer
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the application:
   ```bash
   npm start
   ```

## Building for Production

To build the application for your platform:

```bash
npm run build
```

This will create a distributable package in the `dist` folder.

## Usage

### Connecting to a Database
1. Click on "Tools" → "Manage Connections" in the menu bar
2. Click "New Connection"
3. Fill in the connection details (host, port, username, password, database)
4. Click "Test Connection" to verify the connection
5. Click "Save" to save the connection
6. Close the connection manager
7. Click on "Database" → "Connect" and select your connection

### Executing Queries
1. Write your SQL query in the editor
2. Press F5 or click the "Execute" button in the toolbar
3. View results in the Results tab
4. View execution messages in the Messages tab

### Working with Database Objects
1. Expand the "Connections" node in the Object Explorer
2. Expand your connection to see database objects
3. Right-click on tables, views, procedures, or functions to access context menus
4. Use context menu options to:
   - View data
   - Script objects
   - Edit table structure
   - View properties

### Managing Connections
1. Open the connection manager through "Tools" → "Manage Connections"
2. Edit existing connections or create new ones
3. Delete connections you no longer need
4. Test connections before saving

## Project Structure

```
db-explorer/
├── main.js              # Main Electron process
├── renderer.js          # Renderer process (UI logic)
├── index.html           # Main HTML file
├── styles.css           # Application styles
├── connection.html      # Connection manager UI
├── table-design.html    # Table designer UI
├── properties.html      # Properties window UI
├── about.html           # About dialog
├── package.json         # Project metadata and dependencies
└── README.md            # This file
```

## Technology Stack

- **Electron**: Cross-platform desktop application framework
- **JavaScript/Node.js**: Core programming language
- **HTML/CSS**: User interface markup and styling
- **Database Drivers**:
  - mysql2: MySQL client
  - pg: PostgreSQL client
  - mssql: SQL Server client
  - sqlite3: SQLite client
  - oracledb: Oracle client
  - mongodb: MongoDB client

## Development

### Setting Up Development Environment
1. Install Node.js and npm
2. Clone the repository
3. Run `npm install` to install dependencies
4. Start the development server with `npm start`

### Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

### Code Structure
- **main.js**: Handles Electron main process, window management, and database connections
- **renderer.js**: Manages UI logic, event handling, and communication with main process
- **HTML Files**: Define the user interface structure
- **CSS Files**: Handle application styling and themes

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+N / Cmd+N | New Query |
| Ctrl+O / Cmd+O | Open File |
| Ctrl+S / Cmd+S | Save File |
| Ctrl+Shift+N / Cmd+Shift+N | New Window |
| F5 | Execute Query |
| Ctrl+E / Cmd+E | Execute Query |
| Ctrl+W / Cmd+W | Close Tab |
| Ctrl+T / Cmd+T | New Tab |

## Screenshots

### Main Interface
![Main Interface](screenshots/main-interface.png)

### Query Execution
![Query Execution](screenshots/query-execution.png)

### Table Designer
![Table Designer](screenshots/table-designer.png)

### Connection Manager
![Connection Manager](screenshots/connection-manager.png)

## Roadmap

### Planned Features
- Export query results to CSV, JSON, and other formats
- Import data from files
- Advanced query builder
- Database backup and restore functionality
- Query plan visualization
- Enhanced data editing capabilities
- Customizable themes
- Plugin system for extending functionality

### Future Improvements
- Performance optimizations for large datasets
- Additional database support
- Enhanced security features
- Better error handling and recovery
- Improved documentation and tutorials

## Troubleshooting

### Common Issues

#### Connection Problems
- Verify database server is running
- Check connection details (host, port, username, password)
- Ensure firewall settings allow connections
- Confirm database user has proper permissions

#### Application Won't Start
- Ensure Node.js and npm are properly installed
- Run `npm install` to ensure all dependencies are installed
- Check console for error messages

#### Slow Query Performance
- Optimize your SQL queries
- Consider adding indexes to frequently queried columns
- Check database server resources

### Getting Help
If you encounter issues not covered here:
1. Check the console for error messages
2. Search existing issues on GitHub
3. Create a new issue with detailed information about the problem

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to the Electron team for the excellent framework
- Database driver maintainers for their client libraries
- Inspiration from Microsoft SQL Server Management Studio
- Open source community for various libraries and tools

## Contact

For questions, suggestions, or feedback, please open an issue on GitHub or contact the project maintainers.