const sql = require('mssql');

async function testMSSQL() {
  const config = {
    server: 'localhost',
    port: 1433,
    user: 'sa',
    password: 'your_password',
    database: 'your_database',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };

  try {
    await sql.connect(config);
    
    // Test with string interpolation
    const tableName = 'test_table';
    const escapedTableName = tableName.replace(/'/g, "''");
    const query = `
      SELECT 
        COLUMN_NAME as name,
        DATA_TYPE as type,
        IS_NULLABLE as nullable
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = '${escapedTableName}'
      ORDER BY ORDINAL_POSITION
    `;
    
    const result = await sql.query(query);
    console.log('Result with string interpolation:', result);
    
    // Test with parameterized query
    const request = new sql.Request();
    request.input('tableName', sql.VarChar, tableName);
    const query2 = `
      SELECT 
        COLUMN_NAME as name,
        DATA_TYPE as type,
        IS_NULLABLE as nullable
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION
    `;
    
    const result2 = await request.query(query2);
    console.log('Result with parameterized query:', result2);
    
    await sql.close();
  } catch (error) {
    console.error('Error:', error);
    await sql.close();
  }
}

testMSSQL();