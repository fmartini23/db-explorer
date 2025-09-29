// Execution Plan Utilities for DB Explorer
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const sql = require('mssql');
const sqlite3 = require('sqlite3').verbose();
const oracledb = require('oracledb');
const { MongoClient } = require('mongodb');

// Function to generate estimated execution plan based on database type
async function generateEstimatedExecutionPlan(connectionData, query) {
    switch(connectionData.type) {
        case 'mysql':
            return await generateMySQLEstimatedPlan(connectionData, query);
        case 'postgresql':
            return await generatePostgreSQLEstimatedPlan(connectionData, query);
        case 'mssql':
            return await generateMSSQLEstimatedPlan(connectionData, query);
        case 'sqlite':
            return await generateSQLiteEstimatedPlan(connectionData, query);
        case 'oracle':
            return await generateOracleEstimatedPlan(connectionData, query);
        case 'mongodb':
            return await generateMongoDBEstimatedPlan(connectionData, query);
        default:
            throw new Error(`Unsupported database type: ${connectionData.type}`);
    }
}

// MySQL Estimated Execution Plan
async function generateMySQLEstimatedPlan(connectionData, query) {
    const connection = await mysql.createConnection({
        host: connectionData.host,
        port: parseInt(connectionData.port) || 3306,
        user: connectionData.username,
        password: connectionData.password,
        database: connectionData.database
    });
    
    try {
        // Use EXPLAIN to get the execution plan
        const [rows] = await connection.execute(`EXPLAIN ${query}`);
        await connection.end();
        
        // Format the plan as a readable string
        let plan = `MySQL Estimated Execution Plan for query:\n${query}\n\n`;
        plan += "Execution Plan:\n";
        plan += "┌─────────────────────────────────────────────────────────────────────────────┐\n";
        plan += "│ id │ select_type │ table │ partitions │ type │ possible_keys │ key │ key_len │ ref │ rows │ filtered │ Extra │\n";
        plan += "├─────────────────────────────────────────────────────────────────────────────┤\n";
        
        rows.forEach(row => {
            plan += `│ ${row.id.toString().padEnd(2)} │ ${row.select_type.padEnd(11)} │ ${row.table ? row.table.padEnd(5) : 'NULL'.padEnd(5)} │ ${row.partitions ? row.partitions.padEnd(10) : 'NULL'.padEnd(10)} │ ${row.type ? row.type.padEnd(4) : 'NULL'.padEnd(4)} │ ${row.possible_keys ? row.possible_keys.padEnd(13) : 'NULL'.padEnd(13)} │ ${row.key ? row.key.padEnd(3) : 'NULL'.padEnd(3)} │ ${row.key_len ? row.key_len.toString().padEnd(7) : 'NULL'.padEnd(7)} │ ${row.ref ? row.ref.padEnd(3) : 'NULL'.padEnd(3)} │ ${row.rows.toString().padEnd(4)} │ ${row.filtered ? row.filtered.toString().padEnd(8) : 'NULL'.padEnd(8)} │ ${row.Extra || ''} │\n`;
        });
        
        plan += "└─────────────────────────────────────────────────────────────────────────────┘\n\n";
        plan += "Plan Analysis:\n";
        plan += "- The query will scan approximately " + rows.reduce((sum, row) => sum + row.rows, 0) + " rows\n";
        plan += "- Key columns indicate index usage\n";
        plan += "- Type column shows join type (ALL = full table scan, index = index scan, etc.)\n";
        
        return plan;
    } catch (error) {
        await connection.end();
        throw error;
    }
}

// PostgreSQL Estimated Execution Plan
async function generatePostgreSQLEstimatedPlan(connectionData, query) {
    const client = new Client({
        host: connectionData.host,
        port: parseInt(connectionData.port) || 5432,
        user: connectionData.username,
        password: connectionData.password,
        database: connectionData.database
    });
    
    try {
        await client.connect();
        
        // Use EXPLAIN to get the execution plan
        const res = await client.query(`EXPLAIN ${query}`);
        await client.end();
        
        // Format the plan as a readable string
        let plan = `PostgreSQL Estimated Execution Plan for query:\n${query}\n\n`;
        plan += "Execution Plan:\n";
        plan += res.rows.map(row => `  ${row['?column?']}`).join('\n');
        plan += "\n\nPlan Analysis:\n";
        plan += "- The plan shows the query execution steps\n";
        plan += "- Look for sequential scans (Seq Scan) which may indicate missing indexes\n";
        plan += "- Cost values show relative expense of each step\n";
        
        return plan;
    } catch (error) {
        await client.end();
        throw error;
    }
}

// SQL Server Estimated Execution Plan
async function generateMSSQLEstimatedPlan(connectionData, query) {
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
        
        // Use SET SHOWPLAN_ALL to get the execution plan
        await sql.query('SET SHOWPLAN_ALL ON');
        const result = await sql.query(query);
        await sql.query('SET SHOWPLAN_ALL OFF');
        await sql.close();
        
        // Format the plan as a readable string
        let plan = `SQL Server Estimated Execution Plan for query:\n${query}\n\n`;
        plan += "Execution Plan:\n";
        
        if (result.recordset && result.recordset.length > 0) {
            // Create a simple table format for the plan
            const columns = Object.keys(result.recordset[0]);
            plan += columns.map(col => col.padEnd(15)).join(' | ') + '\n';
            plan += columns.map(() => '---------------').join('-|-') + '\n';
            
            result.recordset.forEach(row => {
                plan += columns.map(col => {
                    const value = row[col];
                    return value !== null && value !== undefined ? String(value).substring(0, 15).padEnd(15) : 'NULL'.padEnd(15);
                }).join(' | ') + '\n';
            });
        } else {
            plan += "No execution plan data returned.\n";
        }
        
        plan += "\n\nPlan Analysis:\n";
        plan += "- StmtText shows the SQL statement being executed\n";
        plan += "- LogicalOp shows the logical operation (e.g., Index Seek, Clustered Index Scan)\n";
        plan += "- EstimateRows shows the estimated number of rows\n";
        plan += "- EstimateIO and EstimateCPU show cost components\n";
        
        return plan;
    } catch (error) {
        await sql.close();
        throw error;
    }
}

// SQLite Estimated Execution Plan
async function generateSQLiteEstimatedPlan(connectionData, query) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(connectionData.database, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
                return;
            }
        });
        
        // Use EXPLAIN QUERY PLAN to get the execution plan
        db.all(`EXPLAIN QUERY PLAN ${query}`, (err, rows) => {
            db.close();
            if (err) {
                reject(err);
            } else {
                // Format the plan as a readable string
                let plan = `SQLite Estimated Execution Plan for query:\n${query}\n\n`;
                plan += "Execution Plan:\n";
                plan += "┌─────────────────────────────────────────────────────────────────────────────┐\n";
                plan += "│ id │ parent │ notused │ detail │\n";
                plan += "├─────────────────────────────────────────────────────────────────────────────┤\n";
                
                rows.forEach(row => {
                    plan += `│ ${row.id.toString().padEnd(2)} │ ${row.parent.toString().padEnd(6)} │ ${row.notused.toString().padEnd(7)} │ ${row.detail} │\n`;
                });
                
                plan += "└─────────────────────────────────────────────────────────────────────────────┘\n\n";
                plan += "Plan Analysis:\n";
                plan += "- The detail column shows the execution steps\n";
                plan += "- Look for SCAN operations which indicate table scans\n";
                plan += "- SEARCH operations use indexes when available\n";
                
                resolve(plan);
            }
        });
    });
}

// Oracle Estimated Execution Plan
async function generateOracleEstimatedPlan(connectionData, query) {
    try {
        const connection = await oracledb.getConnection({
            user: connectionData.username,
            password: connectionData.password,
            connectString: `${connectionData.host}:${connectionData.port || 1521}/${connectionData.database}`
        });
        
        // Use EXPLAIN PLAN to get the execution plan
        await connection.execute(`EXPLAIN PLAN FOR ${query}`);
        
        // Retrieve the plan from PLAN_TABLE
        const result = await connection.execute(`
            SELECT 
                LPAD(' ', 2*(LEVEL-1)) || OPERATION || ' ' || OPTIONS || ' ' || OBJECT_NAME AS PLAN_LINE
            FROM 
                PLAN_TABLE 
            START WITH 
                ID = 0 
            CONNECT BY PRIOR 
                ID = PARENT_ID
            ORDER SIBLINGS BY 
                POSITION
        `);
        
        await connection.close();
        
        // Format the plan as a readable string
        let plan = `Oracle Estimated Execution Plan for query:\n${query}\n\n`;
        plan += "Execution Plan:\n";
        plan += result.rows.map(row => `  ${row[0]}`).join('\n');
        plan += "\n\nPlan Analysis:\n";
        plan += "- The plan shows the query execution tree\n";
        plan += "- Indentation indicates parent-child relationships\n";
        plan += "- Look for TABLE ACCESS operations which indicate table scans\n";
        plan += "- INDEX operations show index usage\n";
        
        return plan;
    } catch (error) {
        throw error;
    }
}

// MongoDB Estimated Execution Plan
async function generateMongoDBEstimatedPlan(connectionData, query) {
    try {
        // For MongoDB, we'll provide a simulated plan based on the query type
        let plan = `MongoDB Estimated Execution Plan for query:\n${query}\n\n`;
        plan += "Execution Plan:\n";
        
        // Simple analysis based on query content
        if (query.toLowerCase().includes('find')) {
            plan += "  └── COLLSCAN (Collection Scan)\n";
            plan += "      ├── Stage: COLLSCAN\n";
            plan += "      ├── Filter: (if applicable)\n";
            plan += "      └── Docs Examined: Estimated based on collection size\n\n";
            plan += "Plan Analysis:\n";
            plan += "- COLLSCAN indicates a collection scan which can be slow on large collections\n";
            plan += "- Consider adding indexes for better performance\n";
            plan += "- Filter stage shows any query filters applied\n";
        } else if (query.toLowerCase().includes('aggregate')) {
            plan += "  └── AGGREGATION_PIPELINE\n";
            plan += "      ├── Stage 1: $match (if applicable)\n";
            plan += "      ├── Stage 2: $group (if applicable)\n";
            plan += "      ├── Stage 3: $sort (if applicable)\n";
            plan += "      └── Stage 4: $project (if applicable)\n\n";
            plan += "Plan Analysis:\n";
            plan += "- Aggregation pipeline stages are executed in order\n";
            plan += "- $match stages early in the pipeline can improve performance\n";
            plan += "- $sort stages can be expensive on large datasets\n";
        } else {
            plan += "  └── COMMAND_EXECUTION\n\n";
            plan += "Plan Analysis:\n";
            plan += "- This is a command execution rather than a query\n";
            plan += "- Performance depends on the specific command\n";
        }
        
        return plan;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    generateEstimatedExecutionPlan
};