require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'bexpay_db',
  password: process.env.DB_PASSWORD || '    ',
  port: process.env.DB_PORT || 5432,
});

async function migrate() {
  try {
    console.log('Starting database migration...');

    // Users table (for Admin, Agents, Customers)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        role VARCHAR(50) NOT NULL, -- 'admin', 'agent', 'customer'
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        commission_rate DECIMAL(5, 2) DEFAULT 0.00, -- For agents
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);


    // Commissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        customer_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        payment_id UUID REFERENCES payments(id) ON DELETE CASCADE NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        commission_percentage DECIMAL(5, 2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "commissions" created or already exists.');

    // Devices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        serial_number VARCHAR(255) UNIQUE NOT NULL,
        model VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'available', -- 'available', 'assigned', 'faulty', 'pending_approval'
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL, -- Customer ID
        assigned_by UUID REFERENCES users(id) ON DELETE SET NULL, -- Agent ID
        price DECIMAL(10, 2), -- Price of the device
        device_type_id UUID REFERENCES device_types(id) ON DELETE SET NULL, -- New column for device type
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "devices" created or already exists.');

    // Payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL, -- Customer ID
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        payment_method VARCHAR(50), -- 'manual', 'paystack'
        transaction_id VARCHAR(255) UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
        payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "payments" created or already exists.');

    // Loans table (for tracking device loans/payment plans)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        amount_paid DECIMAL(10, 2) DEFAULT 0.00,
        balance DECIMAL(10, 2) NOT NULL,
        start_date DATE DEFAULT CURRENT_DATE,
        end_date DATE,
        status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'defaulted'
        term_months INTEGER, -- Term of the loan in months
        monthly_payment DECIMAL(10, 2), -- Calculated monthly payment
        down_payment DECIMAL(10, 2) DEFAULT 0.00, -- Down payment made by customer
        next_payment_date DATE,
        guarantor_details JSONB, -- Store guarantor information as JSON
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "loans" created or already exists.');

    // Device Types table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_name VARCHAR(255) NOT NULL,
        manufacturer VARCHAR(255),
        device_model VARCHAR(255) UNIQUE NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "device_types" created or already exists.');

    // Tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        token VARCHAR(255) NOT NULL,
        payment_id UUID REFERENCES payments(id) ON DELETE CASCADE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "tokens" created or already exists.');


    // Add new columns to users table if they don't exist
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(255);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(255);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS landmark TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gps VARCHAR(255);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50);`);
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS loan_id UUID REFERENCES loans(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type_id UUID REFERENCES device_types(id) ON DELETE SET NULL;`);

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number VARCHAR(255) UNIQUE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_score INTEGER;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(50);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_income DECIMAL(10, 2);`);



    console.log('Table "users" created or already exists.');
    console.log('Database migration completed successfully.');
  } catch (error) {
    console.error('Database migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
