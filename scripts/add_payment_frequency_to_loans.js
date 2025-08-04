
const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const query = (text, params) => pool.query(text, params);

const addPaymentFrequencyToLoans = async () => {
  try {
    await query(`
      ALTER TABLE loans
      ADD COLUMN payment_frequency VARCHAR(10) DEFAULT 'monthly',
      ADD COLUMN payment_cycle_amount NUMERIC(10, 2)
    `);
    console.log('Successfully added payment_frequency and payment_cycle_amount to loans table.');
  } catch (err) {
    console.error('Error adding columns to loans table:', err);
  }
};

addPaymentFrequencyToLoans();
