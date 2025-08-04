
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const createSettingsTable = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create the settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Table "settings" created or already exists.');

    // Insert default general commission rates
    await client.query(`
      INSERT INTO settings (setting_key, setting_value)
      VALUES
        ('general_agent_commission_rate', '5'),
        ('general_super_agent_commission_rate', '2')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    console.log('Default general commission rates inserted or already exist.');

    // Add a trigger to update the updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS set_timestamp ON settings;
      CREATE TRIGGER set_timestamp
      BEFORE UPDATE ON settings
      FOR EACH ROW
      EXECUTE PROCEDURE update_updated_at_column();
    `);
    console.log('Trigger for "settings" table updated_at created or updated.');

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during migration:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
};

createSettingsTable();
