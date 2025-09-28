# Changelog

All notable changes to DB Explorer will be documented in this file.

## [Unreleased]

### Added
- Comprehensive styling for result tables with improved readability
- Pagination controls for large result sets
- Column resizing functionality in result grids
- Enhanced data grid with sorting capabilities
- Search and filter functionality for query results

### Fixed
- Critical bug where query execution was not working due to missing IPC handler
- JavaScript error in table filtering (`TypeError: data.forEach is not a function`)
- Missing table styling in query results display
- Improved error handling for database connections and query execution

### Changed
- Enhanced UI/UX with better visual design similar to professional database tools
- Improved dark/light theme support with consistent color schemes
- Optimized database connection management with connection reuse
- Added execution time tracking for queries

### Deprecated
- None

### Removed
- None

### Security
- None

## [1.0.0] - 2024-09-28

### Added
- Initial release of DB Explorer
- Multi-database support (MySQL, PostgreSQL, SQL Server, SQLite, Oracle, MongoDB)
- Object Explorer for browsing database objects
- SQL query editor with syntax highlighting
- Connection management with encrypted password storage
- Table designer for visual table creation and editing
- Script generation for database objects
- Explain plan functionality for query analysis
- Dark/light theme support

[Unreleased]: https://github.com/fmartini23/db-explorer/compare/v1.0.0...HEAD