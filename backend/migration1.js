import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('----------------------------------------------------');
  console.log('Starting Migration 1: Applying SmartGas (storgas) Schema');
  console.log('----------------------------------------------------');

  const client = await pool.connect();

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`schema.sql not found at ${schemaPath}`);
    }

    console.log(`Reading SQL schema from: ${schemaPath}`);
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema and seeds against PostgreSQL database...');
    const startTime = Date.now();
    await client.query(sql);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Schema applied successfully in ${duration}s!\n`);

    // Verification of created tables and seed counts
    console.log('Verifying seeded tables:');
    const tablesToVerify = [
      'gas_types',
      'gas_volumes',
      'valve_types',
      'cylinder_statuses',
      'vendors',
      'locations',
      'users',
      'gas_cylinders',
      'transactions',
      'transaction_items',
    ];

    for (const tableName of tablesToVerify) {
      const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName};`);
      console.log(`  - ${tableName.padEnd(20)}: ${res.rows[0].count} records`);
    }

    // Verify Views
    const viewsToVerify = [
      'v_cylinder_details',
      'v_hospital_inventory',
      'v_cylinders_at_vendor',
      'v_inventory_summary',
    ];

    console.log('\nVerifying database views:');
    for (const viewName of viewsToVerify) {
      const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${viewName};`);
      console.log(`  - ${viewName.padEnd(22)}: view OK (${res.rows[0].count} rows)`);
    }

    console.log('\n----------------------------------------------------');
    console.log('Migration completed successfully!');
    console.log('----------------------------------------------------');
  } catch (err) {
    console.error('\n[MIGRATION ERROR]: Failed to execute migration1.js');
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
