require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json()); 

// 1. Database Configuration


const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
    ssl: {
        rejectUnauthorized: false 
    }
});
// 2. Test the Connection
pool.connect()
    .then(() => console.log('✅ Connected to PostgreSQL successfully!'))
    .catch(err => console.error('❌ Connection error', err.stack));


// --- ROUTES ---

// 1. Create a Product
app.post('/products', async (req, res) => {
    try {
        const { name, price, stock_quantity } = req.body;
        
        // The SQL Query
        const query = 'INSERT INTO products (name, price, stock_quantity) VALUES ($1, $2, $3) RETURNING *';
        const values = [name, price, stock_quantity];

        // Run the query using the pool
        const result = await pool.query(query, values);

        // Send back the new product
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 2. Get All Products
app.get('/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products');
        res.json(result.rows);
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 3. Place an Order
app.post('/orders', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { product_id, quantity } = req.body;

        // START TRANSACTION
        await client.query('BEGIN');

        // Step A: Check Stock
        const checkStockText = 'SELECT price, stock_quantity FROM products WHERE id = $1 FOR UPDATE';
        const checkStockRes = await client.query(checkStockText, [product_id]);
        
        if (checkStockRes.rows.length === 0) {
            throw new Error('Product not found');
        }

        const product = checkStockRes.rows[0];

        if (product.stock_quantity < quantity) {
            throw new Error('Not enough stock');
        }

        // Deduct Stock
        const updateStockText = 'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2';
        await client.query(updateStockText, [quantity, product_id]);

        // Create Order
        const createOrderText = 'INSERT INTO orders (product_id, quantity) VALUES ($1, $2) RETURNING *';
        const orderRes = await client.query(createOrderText, [product_id, quantity]);

        // COMMIT TRANSACTION
        await client.query('COMMIT');

        res.status(201).json(orderRes.rows[0]);

    } catch (err) {
        // ROLLBACK TRANSACTION
        await client.query('ROLLBACK');
        console.error(err);
        res.status(400).json({ error: err.message });
    } finally {
        // Release the client back to the pool
        client.release();
    }
});

// --- START SERVER ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});