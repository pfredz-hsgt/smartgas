import pool from './db.js';

export async function ensureSortOrderSchema() {
  const client = await pool.connect();
  try {
    const tables = [
      { name: 'gas_types', defaultOrder: 'name ASC' },
      { name: 'valve_types', defaultOrder: 'name ASC' },
      { name: 'cylinder_statuses', defaultOrder: 'code ASC' },
      { name: 'locations', defaultOrder: 'is_central_store DESC, name ASC' },
      { name: 'gas_volumes', defaultOrder: 'volume_value ASC' },
      { name: 'vendors', defaultOrder: 'name ASC' },
    ];

    for (const { name, defaultOrder } of tables) {
      // Add column if missing
      await client.query(`ALTER TABLE ${name} ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;`);

      // If sort_order values are all 0, initialize them with sequential 1, 2, 3...
      const checkZero = await client.query(`SELECT COUNT(*)::int AS count FROM ${name} WHERE sort_order = 0;`);
      const total = await client.query(`SELECT COUNT(*)::int AS count FROM ${name};`);
      if (total.rows[0].count > 0 && checkZero.rows[0].count === total.rows[0].count) {
        await client.query(`
          WITH numbered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY ${defaultOrder}) AS rn FROM ${name}
          )
          UPDATE ${name} SET sort_order = numbered.rn FROM numbered WHERE ${name}.id = numbered.id;
        `);
      }
    }

    // Ensure v_cylinders_at_vendor view supports both default code and customized vendor status codes
    await client.query(`
      CREATE OR REPLACE VIEW v_cylinders_at_vendor AS
      SELECT * 
      FROM v_cylinder_details
      WHERE is_in_hospital = FALSE OR status_code IN ('RETURNED_TO_VENDOR', 'GPT') OR status_name ILIKE '%Vendor%' OR status_name ILIKE '%GPT%';
    `);

    console.log('[Schema] sort_order column ensured and lookup views refreshed.');
    return true;
  } catch (err) {
    console.error('[Schema Error] Failed to ensure sort_order schema:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Self-run when executed directly via node
if (process.argv[1]?.endsWith('migration_sort_order.js')) {
  ensureSortOrderSchema()
    .then(() => {
      console.log('Migration completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
