// Test script for Explain Plan functionality
const { generateEstimatedExecutionPlan } = require('./execution-plan');

// Test MySQL execution plan
async function testMySQL() {
    console.log('Testing MySQL execution plan...');
    
    const connectionData = {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'testuser',
        password: 'testpass',
        database: 'testdb'
    };
    
    const query = 'SELECT u.name, u.email FROM users u WHERE u.created_at > "2023-01-01"';
    
    try {
        const plan = await generateEstimatedExecutionPlan(connectionData, query);
        console.log('MySQL Execution Plan:');
        console.log(plan);
    } catch (error) {
        console.error('Error generating MySQL execution plan:', error.message);
    }
}

// Test PostgreSQL execution plan
async function testPostgreSQL() {
    console.log('\nTesting PostgreSQL execution plan...');
    
    const connectionData = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        username: 'testuser',
        password: 'testpass',
        database: 'testdb'
    };
    
    const query = 'SELECT u.name, u.email FROM users u WHERE u.created_at > \'2023-01-01\'';
    
    try {
        const plan = await generateEstimatedExecutionPlan(connectionData, query);
        console.log('PostgreSQL Execution Plan:');
        console.log(plan);
    } catch (error) {
        console.error('Error generating PostgreSQL execution plan:', error.message);
    }
}

// Run tests
async function runTests() {
    await testMySQL();
    await testPostgreSQL();
}

runTests().catch(console.error);