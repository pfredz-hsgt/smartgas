import Fastify from 'fastify';
import cors from '@fastify/cors';
import pool from './db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// Helper for generating Transaction Numbers with sequential running numbers (e.g. TXN-20261012-0001)
async function generateTxnNo(clientOrPool, prefix = 'TXN') {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const pattern = `${prefix}-${dateStr}-%`;
  const { rows } = await clientOrPool.query(
    `SELECT COALESCE(MAX(substring(transaction_no from '([0-9]+)$')::int), 0) + 1 AS next_seq
     FROM transactions WHERE transaction_no LIKE $1`,
    [pattern]
  );
  const seq = String(rows[0]?.next_seq || 1).padStart(4, '0');
  return `${prefix}-${dateStr}-${seq}`;
}

// Dynamic status resolution helpers supporting custom codes, names, and standard aliases
async function getStatusIdByRole(clientOrPool, roleOrCode) {
  const { rows } = await clientOrPool.query(
    `SELECT id, code, name FROM cylinder_statuses WHERE is_active = TRUE ORDER BY sort_order ASC`
  );
  if (rows.length === 0) return null;

  const key = String(roleOrCode || '').toUpperCase().trim();

  // 1. Direct match on code or name (case-insensitive)
  let found = rows.find((r) => r.code?.toUpperCase() === key || r.name?.toUpperCase() === key);
  if (found) return found.id;

  // 2. Known aliases for standard workflow roles
  const aliases = {
    ISSUED: ['USE', 'IN_USE', 'IN-USE', 'ISSUED', 'ISSUE'],
    IN_USE: ['USE', 'IN_USE', 'IN-USE', 'ISSUED', 'ISSUE'],
    FULL: ['FULL', 'FLL'],
    EMPTY: ['EMPTY', 'MPT', 'EMP'],
    RETURNED_TO_VENDOR: ['GPT', 'RETURNED_TO_VENDOR', 'VEND', 'VENDOR', 'RET_VEND', 'RETURN_TO_VENDOR'],
    VENDOR: ['GPT', 'RETURNED_TO_VENDOR', 'VEND', 'VENDOR'],
    GPT: ['GPT', 'RETURNED_TO_VENDOR', 'VEND', 'VENDOR'],
    EXPIRED: ['EXPIRED', 'EXP'],
    DAMAGED: ['DAMAGED', 'DMG'],
    MAINTENANCE: ['MAINTENANCE', 'MTN', 'MAINT'],
  };

  const targetList = aliases[key] || [key];
  found = rows.find((r) => targetList.includes(r.code?.toUpperCase()) || targetList.includes(r.name?.toUpperCase()));
  if (found) return found.id;

  // 3. Substring / regex matching for common hospital terms
  if (['ISSUED', 'IN_USE', 'USE'].includes(key)) {
    found = rows.find((r) => /use|iss/i.test(r.code) || /use|iss/i.test(r.name));
  } else if (['FULL', 'FLL'].includes(key)) {
    found = rows.find((r) => /full|fll/i.test(r.code) || /full/i.test(r.name));
  } else if (['EMPTY', 'MPT'].includes(key)) {
    found = rows.find((r) => /empty|mpt|emp/i.test(r.code) || /empty/i.test(r.name));
  } else if (['RETURNED_TO_VENDOR', 'VENDOR', 'GPT'].includes(key)) {
    found = rows.find((r) => /gpt|vend|ret/i.test(r.code) || /gpt|vend/i.test(r.name));
  } else if (['EXPIRED', 'EXP'].includes(key)) {
    found = rows.find((r) => /exp/i.test(r.code) || /expir/i.test(r.name));
  } else if (['DAMAGED', 'DMG'].includes(key)) {
    found = rows.find((r) => /dmg|dam/i.test(r.code) || /damag/i.test(r.name));
  } else if (['MAINTENANCE', 'MTN'].includes(key)) {
    found = rows.find((r) => /mtn|maint/i.test(r.code) || /maint/i.test(r.name));
  }

  if (found) return found.id;

  // 4. Fallback to first active row if still not matched
  return rows[0].id;
}

async function resolveStatusId(clientOrPool, codeOrId) {
  if (!codeOrId) return await getStatusIdByRole(clientOrPool, 'EMPTY');

  // Check if it's already a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(String(codeOrId))) {
    const { rows } = await clientOrPool.query(`SELECT id FROM cylinder_statuses WHERE id = $1`, [codeOrId]);
    if (rows.length > 0) return rows[0].id;
  }

  return await getStatusIdByRole(clientOrPool, codeOrId);
}

// ============================================================================
// 1. AUTHENTICATION (Simple session mock / user lookup)
// ============================================================================
fastify.post('/api/auth/login', async (request, reply) => {
  const { username, password } = request.body || {};
  if (!username) {
    return reply.status(400).send({ error: 'Username is required' });
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.email, u.role, u.assigned_location_id,
            l.name AS assigned_location_name
     FROM users u
     LEFT JOIN locations l ON u.assigned_location_id = l.id
     WHERE u.username = $1 AND u.is_active = TRUE`,
    [username]
  );

  if (rows.length === 0) {
    return reply.status(401).send({ error: 'Invalid username or user is inactive' });
  }

  const user = rows[0];
  // Note: For production use bcrypt.compare(password, user.password_hash)
  // For development demo convenience with seeded accounts:
  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      assigned_location_id: user.assigned_location_id,
      assigned_location_name: user.assigned_location_name,
    },
    token: `mock-token-${user.id}-${Date.now()}`,
  };
});

// ============================================================================
// 2. REFERENCE DATA & SETTINGS
// ============================================================================
fastify.get('/api/settings/all', async () => {
  const [gasTypes, gasVolumes, valveTypes, statuses, locations, vendors] = await Promise.all([
    pool.query(`SELECT * FROM gas_types WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC`),
    pool.query(`SELECT * FROM gas_volumes WHERE is_active = TRUE ORDER BY sort_order ASC, volume_value ASC`),
    pool.query(`SELECT * FROM valve_types WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC`),
    pool.query(`SELECT * FROM cylinder_statuses WHERE is_active = TRUE ORDER BY sort_order ASC, code ASC`),
    pool.query(`SELECT * FROM locations WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC`),
    pool.query(`SELECT * FROM vendors WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC`),
  ]);

  return {
    gasTypes: gasTypes.rows,
    gasVolumes: gasVolumes.rows,
    valveTypes: valveTypes.rows,
    statuses: statuses.rows,
    locations: locations.rows,
    vendors: vendors.rows,
  };
});

// Generic lookup lists with active filter ordered by custom sort_order
fastify.get('/api/gas-types', async () => (await pool.query('SELECT * FROM gas_types ORDER BY sort_order ASC, name ASC')).rows);
fastify.get('/api/gas-volumes', async () => (await pool.query('SELECT * FROM gas_volumes ORDER BY sort_order ASC, volume_value ASC')).rows);
fastify.get('/api/valve-types', async () => (await pool.query('SELECT * FROM valve_types ORDER BY sort_order ASC, name ASC')).rows);
fastify.get('/api/statuses', async () => (await pool.query('SELECT * FROM cylinder_statuses ORDER BY sort_order ASC, code ASC')).rows);
fastify.get('/api/locations', async () => (await pool.query('SELECT * FROM locations ORDER BY sort_order ASC, name ASC')).rows);
fastify.get('/api/vendors', async () => (await pool.query('SELECT * FROM vendors ORDER BY sort_order ASC, name ASC')).rows);

// Bulk Reorder Endpoint for Settings Reference Data
fastify.put('/api/settings/reorder', async (req, reply) => {
  const { entity, ordered_ids } = req.body;
  const allowedEntities = {
    'GAS_TYPES': 'gas_types',
    'gas_types': 'gas_types',
    'gas-types': 'gas_types',
    'VOLUMES': 'gas_volumes',
    'gas_volumes': 'gas_volumes',
    'gas-volumes': 'gas_volumes',
    'VALVES': 'valve_types',
    'valve_types': 'valve_types',
    'valve-types': 'valve_types',
    'STATUSES': 'cylinder_statuses',
    'cylinder_statuses': 'cylinder_statuses',
    'statuses': 'cylinder_statuses',
    'LOCATIONS': 'locations',
    'locations': 'locations',
    'VENDORS': 'vendors',
    'vendors': 'vendors',
  };

  const tableName = allowedEntities[entity];
  if (!tableName || !Array.isArray(ordered_ids) || ordered_ids.length === 0) {
    return reply.status(400).send({ error: 'Invalid entity or ordered_ids list' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ordered_ids.length; i++) {
      await client.query(
        `UPDATE ${tableName} SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [i + 1, ordered_ids[i]]
      );
    }
    await client.query('COMMIT');
    return { success: true, message: `Updated order for ${ordered_ids.length} records in ${tableName}` };
  } catch (err) {
    await client.query('ROLLBACK');
    return reply.status(500).send({ error: err.message });
  } finally {
    client.release();
  }
});

// CRUD for Settings: Gas Types
fastify.post('/api/gas-types', async (req, reply) => {
  const { code, name, description, color_code } = req.body;
  const maxRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM gas_types');
  const res = await pool.query(
    `INSERT INTO gas_types (code, name, description, color_code, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [code.toUpperCase(), name, description, color_code || '#3B82F6', maxRes.rows[0].next_order]
  );
  return reply.status(201).send(res.rows[0]);
});

fastify.put('/api/gas-types/:id', async (req) => {
  const { id } = req.params;
  const { code, name, description, color_code, is_active } = req.body;
  const res = await pool.query(
    `UPDATE gas_types 
     SET code = COALESCE($1, code),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         color_code = COALESCE($4, color_code),
         is_active = COALESCE($5, is_active)
     WHERE id = $6 RETURNING *`,
    [code, name, description, color_code, is_active, id]
  );
  return res.rows[0];
});

// CRUD for Settings: Gas Volumes
fastify.post('/api/gas-volumes', async (req, reply) => {
  const { volume_value, unit, display_label } = req.body;
  const maxRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM gas_volumes');
  const res = await pool.query(
    `INSERT INTO gas_volumes (volume_value, unit, display_label, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [volume_value, unit || 'm3', display_label || `${volume_value} ${unit || 'm3'}`, maxRes.rows[0].next_order]
  );
  return reply.status(201).send(res.rows[0]);
});

fastify.put('/api/gas-volumes/:id', async (req) => {
  const { id } = req.params;
  const { volume_value, unit, display_label, is_active } = req.body;
  const res = await pool.query(
    `UPDATE gas_volumes 
     SET volume_value = COALESCE($1, volume_value),
         unit = COALESCE($2, unit),
         display_label = COALESCE($3, display_label),
         is_active = COALESCE($4, is_active)
     WHERE id = $5 RETURNING *`,
    [volume_value, unit, display_label, is_active, id]
  );
  return res.rows[0];
});

// CRUD for Settings: Valve Types
fastify.post('/api/valve-types', async (req, reply) => {
  const { code, name, description } = req.body;
  const maxRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM valve_types');
  const res = await pool.query(
    `INSERT INTO valve_types (code, name, description, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [code.toUpperCase(), name, description, maxRes.rows[0].next_order]
  );
  return reply.status(201).send(res.rows[0]);
});

fastify.put('/api/valve-types/:id', async (req) => {
  const { id } = req.params;
  const { code, name, description, is_active } = req.body;
  const res = await pool.query(
    `UPDATE valve_types 
     SET code = COALESCE($1, code),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         is_active = COALESCE($4, is_active)
     WHERE id = $5 RETURNING *`,
    [code ? code.toUpperCase() : null, name, description, is_active, id]
  );
  return res.rows[0];
});

// CRUD for Settings: Cylinder Statuses
fastify.post('/api/statuses', async (req, reply) => {
  const { code, name, description, badge_color } = req.body;
  const maxRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM cylinder_statuses');
  const res = await pool.query(
    `INSERT INTO cylinder_statuses (code, name, description, badge_color, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [code.toUpperCase(), name, description, badge_color || 'gray', maxRes.rows[0].next_order]
  );
  return reply.status(201).send(res.rows[0]);
});

fastify.put('/api/statuses/:id', async (req) => {
  const { id } = req.params;
  const { code, name, description, badge_color, is_active } = req.body;
  const res = await pool.query(
    `UPDATE cylinder_statuses 
     SET code = COALESCE($1, code),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         badge_color = COALESCE($4, badge_color),
         is_active = COALESCE($5, is_active)
     WHERE id = $6 RETURNING *`,
    [code ? code.toUpperCase() : null, name, description, badge_color, is_active, id]
  );
  return res.rows[0];
});

// CRUD for Settings: Locations
fastify.post('/api/locations', async (req, reply) => {
  const { code, name, type, is_central_store, is_in_hospital, contact_person, contact_phone } = req.body;
  const maxRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM locations');
  const res = await pool.query(
    `INSERT INTO locations (code, name, type, is_central_store, is_in_hospital, contact_person, contact_phone, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [code.toUpperCase(), name, type || 'ward', !!is_central_store, is_in_hospital ?? true, contact_person, contact_phone, maxRes.rows[0].next_order]
  );
  return reply.status(201).send(res.rows[0]);
});

fastify.put('/api/locations/:id', async (req) => {
  const { id } = req.params;
  const { code, name, type, is_central_store, is_in_hospital, contact_person, contact_phone, is_active } = req.body;
  const res = await pool.query(
    `UPDATE locations 
     SET code = COALESCE($1, code),
         name = COALESCE($2, name),
         type = COALESCE($3, type),
         is_central_store = COALESCE($4, is_central_store),
         is_in_hospital = COALESCE($5, is_in_hospital),
         contact_person = COALESCE($6, contact_person),
         contact_phone = COALESCE($7, contact_phone),
         is_active = COALESCE($8, is_active)
     WHERE id = $9 RETURNING *`,
    [code ? code.toUpperCase() : null, name, type, is_central_store, is_in_hospital, contact_person, contact_phone, is_active, id]
  );
  return res.rows[0];
});

// CRUD for Settings: Vendors
fastify.post('/api/vendors', async (req, reply) => {
  const { code, name, short_name, contact_person, contact_phone, email, address } = req.body;
  const maxRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM vendors');
  const res = await pool.query(
    `INSERT INTO vendors (code, name, short_name, contact_person, contact_phone, email, address, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [code.toUpperCase(), name, short_name, contact_person, contact_phone, email, address, maxRes.rows[0].next_order]
  );
  return reply.status(201).send(res.rows[0]);
});

fastify.put('/api/vendors/:id', async (req) => {
  const { id } = req.params;
  const { code, name, short_name, contact_person, contact_phone, email, address, is_active } = req.body;
  const res = await pool.query(
    `UPDATE vendors 
     SET code = COALESCE($1, code),
         name = COALESCE($2, name),
         short_name = COALESCE($3, short_name),
         contact_person = COALESCE($4, contact_person),
         contact_phone = COALESCE($5, contact_phone),
         email = COALESCE($6, email),
         address = COALESCE($7, address),
         is_active = COALESCE($8, is_active)
     WHERE id = $9 RETURNING *`,
    [code ? code.toUpperCase() : null, name, short_name, contact_person, contact_phone, email, address, is_active, id]
  );
  return res.rows[0];
});

// ============================================================================
// 3. CYLINDERS & WIRELESS SCANNER RAPID LOOKUP (<1ms)
// ============================================================================

// Rapid lookup by Scanned Barcode/Gas ID
fastify.get('/api/cylinders/lookup/:gasId', async (req, reply) => {
  const gasId = req.params.gasId.trim();
  const { rows } = await pool.query(
    `SELECT * FROM v_cylinder_details WHERE LOWER(gas_id) = LOWER($1)`,
    [gasId]
  );

  if (rows.length === 0) {
    return reply.status(404).send({ error: `Cylinder with Gas ID/Barcode "${gasId}" not found`, gas_id: gasId });
  }

  return rows[0];
});

// List Cylinders with filtering & search
fastify.get('/api/cylinders', async (req) => {
  const {
    location_id,
    gas_type_id,
    gas_volume_id,
    valve_type_id,
    status_id,
    search,
    is_in_hospital,
    limit = 200,
    offset = 0,
  } = req.query;

  let query = `SELECT * FROM v_cylinder_details WHERE 1=1`;
  const params = [];

  if (location_id) {
    params.push(location_id);
    query += ` AND location_id = $${params.length}`;
  }

  if (gas_type_id) {
    params.push(gas_type_id);
    query += ` AND gas_type_id = $${params.length}`;
  }

  if (gas_volume_id) {
    params.push(gas_volume_id);
    query += ` AND gas_volume_id = $${params.length}`;
  }

  if (valve_type_id) {
    params.push(valve_type_id);
    query += ` AND valve_type_id = $${params.length}`;
  }

  if (status_id) {
    params.push(status_id);
    query += ` AND status_id = $${params.length}`;
  }

  if (is_in_hospital !== undefined && is_in_hospital !== '') {
    params.push(is_in_hospital === 'true' || is_in_hospital === true);
    query += ` AND is_in_hospital = $${params.length}`;
  }

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (gas_id ILIKE $${params.length} OR name ILIKE $${params.length} OR batch_number ILIKE $${params.length} OR location_name ILIKE $${params.length})`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(Number(limit), Number(offset));

  const { rows } = await pool.query(query, params);
  return rows;
});

// Get next sequential running Gas ID by type (checks previous instance of same type and +1)
fastify.get('/api/cylinders/next-id', async (req, reply) => {
  let { prefix, gas_type_id, gas_volume_id, valve_type_id } = req.query;

  if (!prefix) {
    if (!gas_type_id || !gas_volume_id || !valve_type_id) {
      return reply.status(400).send({ error: 'Missing specifications' });
    }
    const [gtRes, gvRes, vtRes] = await Promise.all([
      pool.query(`SELECT code FROM gas_types WHERE id = $1`, [gas_type_id]),
      pool.query(`SELECT volume_value FROM gas_volumes WHERE id = $1`, [gas_volume_id]),
      pool.query(`SELECT code FROM valve_types WHERE id = $1`, [valve_type_id]),
    ]);
    const gt = gtRes.rows[0];
    const gv = gvRes.rows[0];
    const vt = vtRes.rows[0];
    if (!gt || !gv || !vt) {
      return reply.status(404).send({ error: 'Specifications not found' });
    }
    prefix = `${gt.code.toLowerCase()}${gv.volume_value}${vt.code.toLowerCase()}`.replace(/\s+/g, '');
  } else {
    prefix = prefix.toLowerCase().trim();
  }

  const pattern = `${prefix}%`;
  const res = await pool.query(
    `SELECT COALESCE(MAX(substring(gas_id from '([0-9]+)$')::int), 0) + 1 AS next_number
     FROM gas_cylinders
     WHERE LOWER(gas_id) LIKE LOWER($1)`,
    [pattern]
  );

  const nextNumber = res.rows[0]?.next_number || 1;
  const nextId = `${prefix}${nextNumber}`;

  return {
    prefix,
    next_number: nextNumber,
    next_id: nextId,
  };
});

// Create/Register Single Gas Cylinder
fastify.post('/api/cylinders', async (req, reply) => {
  const {
    gas_id,
    name,
    gas_type_id,
    gas_volume_id,
    valve_type_id,
    status_id,
    current_location_id,
    vendor_id,
    batch_number,
    expiry_date,
    notes,
    created_by,
  } = req.body;

  if (!gas_id || !gas_type_id || !gas_volume_id || !valve_type_id) {
    return reply.status(400).send({ error: 'Missing required cylinder specifications' });
  }

  // Get default location (Logistic Pharmacy) if not provided
  let locationId = current_location_id;
  if (!locationId) {
    const locRes = await pool.query(`SELECT id FROM locations WHERE is_central_store = TRUE LIMIT 1`);
    locationId = locRes.rows[0]?.id;
  }

  // Get default status (FULL) if not provided
  let statusId = status_id;
  if (!statusId) {
    statusId = await getStatusIdByRole(pool, 'FULL');
  }

  // Resolve generated name if not explicitly set
  let cylinderName = name;
  if (!cylinderName) {
    const [gt, gv, vt] = await Promise.all([
      pool.query(`SELECT name FROM gas_types WHERE id = $1`, [gas_type_id]),
      pool.query(`SELECT display_label FROM gas_volumes WHERE id = $1`, [gas_volume_id]),
      pool.query(`SELECT name FROM valve_types WHERE id = $1`, [valve_type_id]),
    ]);
    cylinderName = `${gt.rows[0]?.name || 'Gas'} ${gv.rows[0]?.display_label || ''} ${vt.rows[0]?.name || ''}`.trim();
  }

  try {
    const res = await pool.query(
      `INSERT INTO gas_cylinders (
        gas_id, name, gas_type_id, gas_volume_id, valve_type_id,
        status_id, current_location_id, vendor_id, batch_number, expiry_date, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        gas_id.trim(),
        cylinderName,
        gas_type_id,
        gas_volume_id,
        valve_type_id,
        statusId,
        locationId,
        vendor_id || null,
        batch_number || null,
        expiry_date || null,
        notes || null,
        created_by || null,
      ]
    );

    const fullCylinder = await pool.query(`SELECT * FROM v_cylinder_details WHERE id = $1`, [res.rows[0].id]);
    return reply.status(201).send(fullCylinder.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return reply.status(409).send({ error: `Gas ID / Barcode "${gas_id}" already exists` });
    }
    throw err;
  }
});

// Update Cylinder (Status, Location, Batch, Expiry, Notes, Specs)
fastify.put('/api/cylinders/:id', async (req, reply) => {
  const { id } = req.params;
  const {
    status_id,
    current_location_id,
    batch_number,
    expiry_date,
    notes,
    name,
    gas_type_id,
    gas_volume_id,
    valve_type_id,
    performed_by,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const checkRes = await client.query(`SELECT * FROM gas_cylinders WHERE id = $1 FOR UPDATE`, [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({ error: 'Cylinder not found' });
    }

    const existing = checkRes.rows[0];
    const newStatusId = status_id || existing.status_id;
    const newLocationId = current_location_id || existing.current_location_id;
    const newBatch = batch_number !== undefined ? (batch_number || null) : existing.batch_number;
    const newExpiry = expiry_date !== undefined ? (expiry_date || null) : existing.expiry_date;
    const newNotes = notes !== undefined ? (notes || null) : existing.notes;
    const newGasTypeId = gas_type_id || existing.gas_type_id;
    const newGasVolumeId = gas_volume_id || existing.gas_volume_id;
    const newValveTypeId = valve_type_id || existing.valve_type_id;

    let newName = name || existing.name;
    if (!name && (gas_type_id || gas_volume_id || valve_type_id)) {
      const [gt, gv, vt] = await Promise.all([
        client.query(`SELECT name FROM gas_types WHERE id = $1`, [newGasTypeId]),
        client.query(`SELECT display_label FROM gas_volumes WHERE id = $1`, [newGasVolumeId]),
        client.query(`SELECT name FROM valve_types WHERE id = $1`, [newValveTypeId]),
      ]);
      newName = `${gt.rows[0]?.name || 'Gas'} ${gv.rows[0]?.display_label || ''} ${vt.rows[0]?.name || ''}`.trim();
    }

    await client.query(
      `UPDATE gas_cylinders
       SET status_id = $1,
           current_location_id = $2,
           batch_number = $3,
           expiry_date = $4,
           notes = $5,
           name = $6,
           gas_type_id = $7,
           gas_volume_id = $8,
           valve_type_id = $9
       WHERE id = $10`,
      [newStatusId, newLocationId, newBatch, newExpiry, newNotes, newName, newGasTypeId, newGasVolumeId, newValveTypeId, id]
    );

    // If status or location changed, log an ADJUSTMENT transaction for audit trail
    if (newStatusId !== existing.status_id || newLocationId !== existing.current_location_id) {
      let staffId = performed_by;
      if (!staffId) {
        const uRes = await client.query(`SELECT id FROM users WHERE username = 'staff' LIMIT 1`);
        staffId = uRes.rows[0]?.id;
      }
      const txnNo = await generateTxnNo(client, 'ADJUST');
      const txnRes = await client.query(
        `INSERT INTO transactions (
          transaction_no, transaction_type, indenter_name,
          source_location_id, destination_location_id, performed_by, notes
        ) VALUES ($1, 'ADJUSTMENT', 'Manual Inventory Update', $2, $3, $4, $5) RETURNING id`,
        [txnNo, existing.current_location_id, newLocationId, staffId, newNotes || 'Manual status/location correction in Inventory']
      );

      await client.query(
        `INSERT INTO transaction_items (transaction_id, cylinder_id, status_before_id, status_after_id, item_remarks)
         VALUES ($1, $2, $3, $4, $5)`,
        [txnRes.rows[0].id, id, existing.status_id, newStatusId, 'Manual inventory correction']
      );
    }

    await client.query('COMMIT');

    const fullCylinder = await pool.query(`SELECT * FROM v_cylinder_details WHERE id = $1`, [id]);
    return fullCylinder.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Delete / Remove Cylinder from Inventory
fastify.delete('/api/cylinders/:id', async (req, reply) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(`SELECT gas_id, name FROM gas_cylinders WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({ error: 'Cylinder not found' });
    }
    const cyl = check.rows[0];

    // Remove any transaction_items referencing this cylinder
    await client.query(`DELETE FROM transaction_items WHERE cylinder_id = $1`, [id]);
    // Delete the cylinder
    await client.query(`DELETE FROM gas_cylinders WHERE id = $1`, [id]);

    await client.query('COMMIT');
    return { success: true, message: `Cylinder ${cyl.gas_id} (${cyl.name}) removed from inventory`, gas_id: cyl.gas_id };
  } catch (err) {
    await client.query('ROLLBACK');
    return reply.status(500).send({ error: err.message });
  } finally {
    client.release();
  }
});

// Generate Standby Barcode Stickers for Thermal Printing (Does NOT insert into database)
// Numbering is strictly based on MAX registered sequence in gas_cylinders + 1
fastify.post('/api/labels/preview-batch', async (req, reply) => {
  const { gas_type_id, gas_volume_id, valve_type_id, quantity = 4, prefix, batch_number } = req.body;

  if (!gas_type_id || !gas_volume_id || !valve_type_id) {
    return reply.status(400).send({ error: 'Missing specifications for label generation' });
  }

  const [gtRes, gvRes, vtRes] = await Promise.all([
    pool.query(`SELECT code, name, color_code FROM gas_types WHERE id = $1`, [gas_type_id]),
    pool.query(`SELECT volume_value, display_label FROM gas_volumes WHERE id = $1`, [gas_volume_id]),
    pool.query(`SELECT code, name FROM valve_types WHERE id = $1`, [valve_type_id]),
  ]);

  const gt = gtRes.rows[0];
  const gv = gvRes.rows[0];
  const vt = vtRes.rows[0];

  // Build prefix like 'ox0.50pi' or 'ox0.5pi'
  const basePrefix = (prefix || `${gt.code.toLowerCase()}${gv.volume_value}${vt.code.toLowerCase()}`).replace(/\s+/g, '');

  // Calculate next start sequence based on REGISTERED cylinders only in gas_cylinders
  const maxRes = await pool.query(
    `SELECT COALESCE(MAX(substring(gas_id from '([0-9]+)$')::int), 0) + 1 AS start_seq
     FROM gas_cylinders WHERE LOWER(gas_id) LIKE LOWER($1)`,
    [`${basePrefix}%`]
  );
  let startIdx = maxRes.rows[0]?.start_seq || 1;

  const generatedLabels = [];
  for (let i = 0; i < Number(quantity); i++) {
    const gasId = `${basePrefix}${startIdx + i}`;
    const name = `${gt.name} ${gv.display_label} ${vt.name}`;
    generatedLabels.push({
      gas_id: gasId,
      name,
      gas_type_name: gt.name,
      gas_type_color: gt.color_code,
      volume_label: gv.display_label,
      display_label: gv.display_label,
      valve_type_name: vt.name,
      batch_number: batch_number !== undefined ? batch_number : '',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    });
  }

  return { success: true, count: generatedLabels.length, start_seq: startIdx, labels: generatedLabels };
});

// Alias for backwards compatibility
fastify.post('/api/cylinders/bulk-generate', async (req, reply) => {
  return reply.redirect(307, '/api/labels/preview-batch');
});

// ============================================================================
// 4. TRANSACTION WORKFLOWS (ISSUE, RETURN, RETURN TO GPT, RECEIVE FROM GPT)
// ============================================================================

// 4.1 Issue Gas to Ward/User
fastify.post('/api/transactions/issue', async (req, reply) => {
  const {
    destination_location_id,
    indent_no,
    indenter_name,
    gas_ids = [],
    performed_by,
    notes,
  } = req.body;

  if (!destination_location_id || !indenter_name || gas_ids.length === 0) {
    return reply.status(400).send({ error: 'Missing destination ward, indenter name, or scanned items' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find central store
    const storeRes = await client.query(`SELECT id FROM locations WHERE is_central_store = TRUE LIMIT 1`);
    const sourceLocationId = storeRes.rows[0].id;

    // Resolve Issued / In-Use Status ID dynamically
    const issuedStatusId = (req.body.status_id) || await getStatusIdByRole(client, 'ISSUED');
    if (!issuedStatusId) {
      throw new Error('Unable to resolve status for Issued/In-Use cylinder');
    }

    // Resolve Performed By (fallback to default staff)
    let staffId = performed_by;
    if (!staffId) {
      const uRes = await client.query(`SELECT id FROM users WHERE username = 'staff' LIMIT 1`);
      staffId = uRes.rows[0]?.id;
    }

    // Create Transaction Header with sequential number
    const txnNo = await generateTxnNo(client, 'ISSUE');
    const txnRes = await client.query(
      `INSERT INTO transactions (
        transaction_no, transaction_type, indent_no, indenter_name,
        source_location_id, destination_location_id, performed_by, notes
      ) VALUES ($1, 'ISSUE', $2, $3, $4, $5, $6, $7) RETURNING *`,
      [txnNo, indent_no || null, indenter_name, sourceLocationId, destination_location_id, staffId, notes || null]
    );
    const transaction = txnRes.rows[0];

    const processedItems = [];

    for (const gasId of gas_ids) {
      const cylRes = await client.query(
        `SELECT id, gas_id, name, status_id, current_location_id FROM gas_cylinders WHERE LOWER(gas_id) = LOWER($1) FOR UPDATE`,
        [gasId.trim()]
      );

      if (cylRes.rows.length === 0) {
        throw new Error(`Cylinder "${gasId}" does not exist in the database`);
      }

      const cyl = cylRes.rows[0];

      // Insert transaction item
      await client.query(
        `INSERT INTO transaction_items (transaction_id, cylinder_id, status_before_id, status_after_id, item_remarks)
         VALUES ($1, $2, $3, $4, $5)`,
        [transaction.id, cyl.id, cyl.status_id, issuedStatusId, 'Issued to ward']
      );

      // Update Cylinder location and status
      await client.query(
        `UPDATE gas_cylinders
         SET current_location_id = $1, status_id = $2
         WHERE id = $3`,
        [destination_location_id, issuedStatusId, cyl.id]
      );

      processedItems.push({ id: cyl.id, gas_id: cyl.gas_id, name: cyl.name });
    }

    await client.query('COMMIT');

    const destRes = await pool.query(`SELECT name FROM locations WHERE id = $1`, [destination_location_id]);
    return {
      success: true,
      transaction_no: txnNo,
      issued_to: indenter_name,
      destination_ward: destRes.rows[0]?.name,
      total_items: processedItems.length,
      items: processedItems,
      message: `Successfully issued ${processedItems.length} cylinder(s) to ${indenter_name} (${destRes.rows[0]?.name})`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    return reply.status(400).send({ error: err.message });
  } finally {
    client.release();
  }
});

// 4.2 Return Empty/Expired Cylinders from Ward
fastify.post('/api/transactions/return', async (req, reply) => {
  const {
    source_location_id,
    indent_no,
    indenter_name,
    items = [], // [{ gas_id, status_code: 'EMPTY' | 'EXPIRED' | 'DAMAGED', remarks }]
    performed_by,
    notes,
  } = req.body;

  if (!indenter_name || items.length === 0) {
    return reply.status(400).send({ error: 'Missing returner name or scanned items' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Central store is the destination
    const storeRes = await client.query(`SELECT id FROM locations WHERE is_central_store = TRUE LIMIT 1`);
    const destinationLocationId = storeRes.rows[0].id;

    // If source not provided, we can look up from first cylinder's current location
    let sourceLocId = source_location_id;

    // Resolve statuses
    const statusesRes = await client.query(`SELECT id, code FROM cylinder_statuses`);
    const statusMap = new Map(statusesRes.rows.map((s) => [s.code, s.id]));

    let staffId = performed_by;
    if (!staffId) {
      const uRes = await client.query(`SELECT id FROM users WHERE username = 'staff' LIMIT 1`);
      staffId = uRes.rows[0]?.id;
    }

    // If no source provided, inspect first item
    if (!sourceLocId) {
      const firstCyl = await client.query(`SELECT current_location_id FROM gas_cylinders WHERE LOWER(gas_id) = LOWER($1)`, [items[0].gas_id]);
      sourceLocId = firstCyl.rows[0]?.current_location_id || destinationLocationId;
    }

    const txnNo = await generateTxnNo(client, 'RET');
    const txnRes = await client.query(
      `INSERT INTO transactions (
        transaction_no, transaction_type, indent_no, indenter_name,
        source_location_id, destination_location_id, performed_by, notes
      ) VALUES ($1, 'RETURN', $2, $3, $4, $5, $6, $7) RETURNING *`,
      [txnNo, indent_no || null, indenter_name, sourceLocId, destinationLocationId, staffId, notes || null]
    );
    const transaction = txnRes.rows[0];

    const processedItems = [];

    for (const item of items) {
      const cylRes = await client.query(
        `SELECT id, gas_id, name, status_id, current_location_id
         FROM gas_cylinders
         WHERE LOWER(gas_id) = LOWER($1) FOR UPDATE`,
        [item.gas_id.trim()]
      );

      if (cylRes.rows.length === 0) {
        throw new Error(`Cylinder "${item.gas_id}" not found`);
      }

      const cyl = cylRes.rows[0];
      const locRes = await client.query(`SELECT name FROM locations WHERE id = $1`, [cyl.current_location_id]);
      const locName = locRes.rows[0]?.name || 'Ward';

      const targetStatusCode = item.status_code || 'EMPTY';
      const targetStatusId = await resolveStatusId(client, targetStatusCode);
      const itemRemark = item.remarks
        ? `${item.remarks} (From ${locName})`
        : `Returned from ${locName}`;

      await client.query(
        `INSERT INTO transaction_items (transaction_id, cylinder_id, status_before_id, status_after_id, item_remarks)
         VALUES ($1, $2, $3, $4, $5)`,
        [transaction.id, cyl.id, cyl.status_id, targetStatusId, itemRemark]
      );

      await client.query(
        `UPDATE gas_cylinders
         SET current_location_id = $1, status_id = $2
         WHERE id = $3`,
        [destinationLocationId, targetStatusId, cyl.id]
      );

      processedItems.push({ id: cyl.id, gas_id: cyl.gas_id, name: cyl.name, status: targetStatusCode, from_location: locName });
    }

    await client.query('COMMIT');

    return {
      success: true,
      transaction_no: txnNo,
      returned_by: indenter_name,
      total_items: processedItems.length,
      items: processedItems,
      message: `Successfully returned ${processedItems.length} cylinder(s) to Logistic Pharmacy store`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    return reply.status(400).send({ error: err.message });
  } finally {
    client.release();
  }
});

// 4.3 Return Empty Cylinders to Vendor (Gas Pantai Timur - GPT) for Refilling
fastify.post('/api/transactions/return-to-vendor', async (req, reply) => {
  const {
    vendor_id,
    delivery_order_no,
    items = [], // [{ gas_id, status_code: 'RETURNED_TO_VENDOR', remarks }]
    performed_by,
    notes,
  } = req.body;

  if (items.length === 0) {
    return reply.status(400).send({ error: 'No cylinders selected for return to GPT' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Central store is the source
    const storeRes = await client.query(`SELECT id FROM locations WHERE is_central_store = TRUE LIMIT 1`);
    const sourceLocationId = storeRes.rows[0].id;

    // GPT plant is destination
    const gptLocRes = await client.query(`SELECT id, vendor_id FROM locations WHERE type = 'vendor' LIMIT 1`);
    const destinationLocationId = gptLocRes.rows[0]?.id;
    const vendorId = vendor_id || gptLocRes.rows[0]?.vendor_id;

    // Status: RETURNED_TO_VENDOR / GPT
    const returnedStatusId = await getStatusIdByRole(client, 'RETURNED_TO_VENDOR');
    if (!returnedStatusId) {
      throw new Error('Unable to resolve status for Returned to Vendor/GPT');
    }

    let staffId = performed_by;
    if (!staffId) {
      const uRes = await client.query(`SELECT id FROM users WHERE username = 'staff' LIMIT 1`);
      staffId = uRes.rows[0]?.id;
    }

    const txnNo = await generateTxnNo(client, 'VEND-RET');
    const txnRes = await client.query(
      `INSERT INTO transactions (
        transaction_no, transaction_type, delivery_order_no, indenter_name, vendor_id,
        source_location_id, destination_location_id, performed_by, notes
      ) VALUES ($1, 'RETURN_TO_VENDOR', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        txnNo,
        delivery_order_no || null,
        'Gas Pantai Timur Concessionaire',
        vendorId,
        sourceLocationId,
        destinationLocationId,
        staffId,
        notes || 'Empty tanks sent for offsite refilling',
      ]
    );
    const transaction = txnRes.rows[0];

    const processedItems = [];

    for (const item of items) {
      const cylRes = await client.query(
        `SELECT id, gas_id, name, status_id FROM gas_cylinders WHERE LOWER(gas_id) = LOWER($1) FOR UPDATE`,
        [item.gas_id.trim()]
      );

      if (cylRes.rows.length === 0) {
        throw new Error(`Cylinder "${item.gas_id}" not found`);
      }

      const cyl = cylRes.rows[0];

      await client.query(
        `INSERT INTO transaction_items (transaction_id, cylinder_id, status_before_id, status_after_id, item_remarks)
         VALUES ($1, $2, $3, $4, $5)`,
        [transaction.id, cyl.id, cyl.status_id, returnedStatusId, item.remarks || 'Sent to GPT for refilling']
      );

      // Move cylinder to GPT plant and status 'RETURNED_TO_VENDOR'
      await client.query(
        `UPDATE gas_cylinders
         SET current_location_id = $1, status_id = $2
         WHERE id = $3`,
        [destinationLocationId, returnedStatusId, cyl.id]
      );

      processedItems.push({ id: cyl.id, gas_id: cyl.gas_id, name: cyl.name });
    }

    await client.query('COMMIT');

    return {
      success: true,
      transaction_no: txnNo,
      total_items: processedItems.length,
      items: processedItems,
      message: `Successfully returned ${processedItems.length} cylinder(s) to Gas Pantai Timur (GPT) for refilling`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    return reply.status(400).send({ error: err.message });
  } finally {
    client.release();
  }
});

// 4.4 Receive Refilled Cylinders from Vendor (Gas Pantai Timur - GPT)
fastify.post('/api/transactions/receive-from-vendor', async (req, reply) => {
  const {
    delivery_order_no,
    batch_number,
    cylinders = [], // [{ gas_id, is_new, gas_type_id, gas_volume_id, valve_type_id, name }]
    performed_by,
    notes,
  } = req.body;

  if (cylinders.length === 0) {
    return reply.status(400).send({ error: 'No cylinders scanned/submitted for receipt' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Central store is the destination
    const storeRes = await client.query(`SELECT id FROM locations WHERE is_central_store = TRUE LIMIT 1`);
    const destinationLocationId = storeRes.rows[0].id;

    // GPT plant is the source
    const gptLocRes = await client.query(`SELECT id, vendor_id FROM locations WHERE type = 'vendor' LIMIT 1`);
    const sourceLocationId = gptLocRes.rows[0]?.id;
    const vendorId = gptLocRes.rows[0]?.vendor_id;

    // Status: FULL
    const fullStatusId = await getStatusIdByRole(client, 'FULL');
    if (!fullStatusId) {
      throw new Error('Unable to resolve status for Full cylinder');
    }

    let staffId = performed_by;
    if (!staffId) {
      const uRes = await client.query(`SELECT id FROM users WHERE username = 'staff' LIMIT 1`);
      staffId = uRes.rows[0]?.id;
    }

    const txnNo = await generateTxnNo(client, 'VEND-REC');
    const txnRes = await client.query(
      `INSERT INTO transactions (
        transaction_no, transaction_type, delivery_order_no, indenter_name, vendor_id,
        source_location_id, destination_location_id, performed_by, notes
      ) VALUES ($1, 'RECEIVE_FROM_VENDOR', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        txnNo,
        delivery_order_no || null,
        'Gas Pantai Timur Concessionaire',
        vendorId,
        sourceLocationId,
        destinationLocationId,
        staffId,
        notes || 'Refilled cylinders received into Logistic Pharmacy store',
      ]
    );
    const transaction = txnRes.rows[0];

    const processedItems = [];

    for (const cylData of cylinders) {
      const gasId = cylData.gas_id.trim();

      // Check if cylinder already exists in system
      const existingRes = await client.query(
        `SELECT id, gas_id, name, status_id FROM gas_cylinders WHERE LOWER(gas_id) = LOWER($1) FOR UPDATE`,
        [gasId]
      );

      let cylinderId;
      let statusBeforeId = null;
      let cylinderName = cylData.name;

      if (existingRes.rows.length > 0) {
        // Tank previously returned to GPT, now returned full
        const existing = existingRes.rows[0];
        cylinderId = existing.id;
        statusBeforeId = existing.status_id;
        cylinderName = existing.name;

        await client.query(
          `UPDATE gas_cylinders
           SET current_location_id = $1,
               status_id = $2,
               batch_number = COALESCE($3, batch_number)
           WHERE id = $4`,
          [destinationLocationId, fullStatusId, batch_number || null, cylinderId]
        );
      } else {
        // Brand new cylinder registered on arrival
        if (!cylData.gas_type_id || !cylData.gas_volume_id || !cylData.valve_type_id) {
          throw new Error(`Specifications required to register new cylinder "${gasId}"`);
        }

        if (!cylinderName) {
          const [gt, gv, vt] = await Promise.all([
            client.query(`SELECT name FROM gas_types WHERE id = $1`, [cylData.gas_type_id]),
            client.query(`SELECT display_label FROM gas_volumes WHERE id = $1`, [cylData.gas_volume_id]),
            client.query(`SELECT name FROM valve_types WHERE id = $1`, [cylData.valve_type_id]),
          ]);
          cylinderName = `${gt.rows[0]?.name || 'Gas'} ${gv.rows[0]?.display_label || ''} ${vt.rows[0]?.name || ''}`.trim();
        }

        const newCyl = await client.query(
          `INSERT INTO gas_cylinders (
            gas_id, name, gas_type_id, gas_volume_id, valve_type_id,
            status_id, current_location_id, vendor_id, batch_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            gasId,
            cylinderName,
            cylData.gas_type_id,
            cylData.gas_volume_id,
            cylData.valve_type_id,
            fullStatusId,
            destinationLocationId,
            vendorId,
            batch_number || null,
          ]
        );
        cylinderId = newCyl.rows[0].id;
      }

      await client.query(
        `INSERT INTO transaction_items (transaction_id, cylinder_id, status_before_id, status_after_id, item_remarks)
         VALUES ($1, $2, $3, $4, $5)`,
        [transaction.id, cylinderId, statusBeforeId, fullStatusId, 'Received refilled from GPT']
      );

      processedItems.push({ id: cylinderId, gas_id: gasId, name: cylinderName, is_new: existingRes.rows.length === 0 });
    }

    await client.query('COMMIT');

    return {
      success: true,
      transaction_no: txnNo,
      total_items: processedItems.length,
      items: processedItems,
      message: `Successfully received ${processedItems.length} refilled cylinder(s) into Logistic Pharmacy store`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    return reply.status(400).send({ error: err.message });
  } finally {
    client.release();
  }
});

// 4.5 Transaction History Query
fastify.get('/api/transactions', async (req) => {
  const { type, location_id, date_from, date_to, search, limit = 100 } = req.query;

  let query = `
    SELECT t.id, t.transaction_no, t.transaction_type, t.indent_no, t.delivery_order_no,
           t.indenter_name, t.notes, t.created_at,
           src.name AS source_location_name,
           dst.name AS destination_location_name,
           u.full_name AS performed_by_name,
           v.name AS vendor_name,
           (SELECT COUNT(*)::int FROM transaction_items ti WHERE ti.transaction_id = t.id) AS item_count
    FROM transactions t
    JOIN locations src ON t.source_location_id = src.id
    JOIN locations dst ON t.destination_location_id = dst.id
    JOIN users u ON t.performed_by = u.id
    LEFT JOIN vendors v ON t.vendor_id = v.id
    WHERE 1=1
  `;
  const params = [];

  if (type) {
    params.push(type);
    query += ` AND t.transaction_type = $${params.length}`;
  }

  if (location_id) {
    params.push(location_id);
    query += ` AND (t.source_location_id = $${params.length} OR t.destination_location_id = $${params.length})`;
  }

  if (date_from) {
    params.push(date_from);
    query += ` AND t.created_at >= $${params.length}::timestamptz`;
  }

  if (date_to) {
    params.push(date_to);
    query += ` AND t.created_at <= $${params.length}::timestamptz`;
  }

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (t.transaction_no ILIKE $${params.length} OR t.indent_no ILIKE $${params.length} OR t.indenter_name ILIKE $${params.length})`;
  }

  query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1}`;
  params.push(Number(limit));

  const { rows } = await pool.query(query, params);
  return rows;
});

// Transaction Details with items
fastify.get('/api/transactions/:id', async (req, reply) => {
  const { id } = req.params;
  const txnRes = await pool.query(
    `SELECT t.*, src.name AS source_name, dst.name AS destination_name, u.full_name AS staff_name
     FROM transactions t
     JOIN locations src ON t.source_location_id = src.id
     JOIN locations dst ON t.destination_location_id = dst.id
     JOIN users u ON t.performed_by = u.id
     WHERE t.id = $1`,
    [id]
  );

  if (txnRes.rows.length === 0) {
    return reply.status(404).send({ error: 'Transaction not found' });
  }

  const itemsRes = await pool.query(
    `SELECT ti.id, ti.cylinder_id, ti.item_remarks, c.gas_id, c.name AS cylinder_name,
            sb.name AS status_before, sa.name AS status_after
     FROM transaction_items ti
     JOIN gas_cylinders c ON ti.cylinder_id = c.id
     LEFT JOIN cylinder_statuses sb ON ti.status_before_id = sb.id
     LEFT JOIN cylinder_statuses sa ON ti.status_after_id = sa.id
     WHERE ti.transaction_id = $1`,
    [id]
  );

  return {
    ...txnRes.rows[0],
    items: itemsRes.rows,
  };
});

// ============================================================================
// 5. DASHBOARD & SUMMARY REPORTS
// ============================================================================
fastify.get('/api/reports/dashboard', async () => {
  const [summaryRows, totalsRes, recentTxnsRes] = await Promise.all([
    pool.query(`SELECT * FROM v_inventory_summary ORDER BY location_name ASC`),
    pool.query(`
      SELECT 
        COUNT(*)::int AS total_cylinders,
        COUNT(*) FILTER (WHERE is_in_hospital = TRUE)::int AS in_hospital_count,
        COUNT(*) FILTER (WHERE is_in_hospital = FALSE OR status_code IN ('RETURNED_TO_VENDOR', 'GPT') OR status_name ILIKE '%Vendor%' OR status_name ILIKE '%GPT%')::int AS at_vendor_count,
        COUNT(*) FILTER (WHERE (status_code IN ('FULL', 'FLL') OR status_name ILIKE '%Full%') AND is_in_hospital = TRUE)::int AS full_count,
        COUNT(*) FILTER (WHERE status_code IN ('ISSUED', 'USE', 'IN_USE') OR status_name ILIKE '%Use%' OR status_name ILIKE '%Issue%')::int AS issued_count,
        COUNT(*) FILTER (WHERE (status_code IN ('EMPTY', 'MPT') OR status_name ILIKE '%Empty%') AND is_in_hospital = TRUE)::int AS empty_count
      FROM v_cylinder_details
    `),
    pool.query(`
      SELECT t.id, t.transaction_no, t.transaction_type, t.indenter_name, t.created_at,
             src.name AS source_name, dst.name AS destination_name,
             (SELECT COUNT(*)::int FROM transaction_items ti WHERE ti.transaction_id = t.id) AS item_count
      FROM transactions t
      JOIN locations src ON t.source_location_id = src.id
      JOIN locations dst ON t.destination_location_id = dst.id
      ORDER BY t.created_at DESC LIMIT 5
    `),
  ]);

  return {
    totals: totalsRes.rows[0],
    inventorySummary: summaryRows.rows,
    recentTransactions: recentTxnsRes.rows,
  };
});

// Start Fastify Server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3009', 10);
    const host = '0.0.0.0';
    await fastify.listen({ port, host });
    console.log(`\n======================================================`);
    console.log(`SmartGas Fastify Server running at http://localhost:${port}`);
    console.log(`Ready for 2D scanner rapid requests & frontend API`);
    console.log(`======================================================\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
