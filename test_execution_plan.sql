-- Test SQL Query for Execution Plan
-- This query will be used to test the Explain Plan functionality

SELECT u.name, u.email, o.order_date, o.total_amount
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2023-01-01'
ORDER BY o.order_date DESC
LIMIT 100;