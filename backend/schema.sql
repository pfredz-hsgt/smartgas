-- ==============================================================================
-- DATABASE SCHEMA: storgas (SmartGas Cylinder Management System)
-- Target RDBMS: PostgreSQL 14+
-- Generated based on: project-smartgas.txt specification
-- Updated: Added Vendor / Concessionaire workflow (Gas Pantai Timur Sdn Bhd)
--          Removed serial_number & hydro_test_due_date (handled by vendor)
-- ==============================================================================

-- Enable UUID extension (PostgreSQL 13+ includes gen_random_uuid() natively,
-- but uuid-ossp is good for legacy compatibility if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. REFERENCE / LOOKUP TABLES (Managed via Settings: Add/Edit/View/Delete)
-- ==============================================================================

-- Gas Types (e.g., Oxygen, Nitrous Oxide, Carbon Dioxide, Entenox, Compressed Air)
CREATE TABLE IF NOT EXISTS gas_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,            -- e.g. 'OX', 'NO', 'CO', 'EX', 'CA'
    name VARCHAR(100) NOT NULL UNIQUE,          -- e.g. 'Oxygen', 'Nitrous Oxide'
    description TEXT,
    color_code VARCHAR(20),                     -- Hex code for UI badge/cylinder shoulder color standard
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Gas Volumes / Capacities (e.g., 0.5, 0.7, 1.4, 3.4 m3, 6.0 KG, etc.)
CREATE TABLE IF NOT EXISTS gas_volumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volume_value NUMERIC(6, 2) NOT NULL,        -- e.g. 0.50, 0.70, 1.40, 6.00
    unit VARCHAR(20) NOT NULL DEFAULT 'm3',      -- 'm3', 'kg', 'L'
    display_label VARCHAR(50) NOT NULL,         -- e.g. '0.5 m³', '6 KG'
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_gas_volume UNIQUE (volume_value, unit)
);

-- Valve Types (e.g., Pin-Index, Bullnose, Ambulance)
CREATE TABLE IF NOT EXISTS valve_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,            -- e.g. 'PI', 'BN', 'AMB'
    name VARCHAR(100) NOT NULL UNIQUE,          -- e.g. 'Pin Index', 'Bullnose', 'Ambulance'
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Cylinder Statuses (e.g., Full, Issued, Empty, Returned to GPT, Expired, Damaged)
-- Defined as a table so users can customize status tags via Settings
CREATE TABLE IF NOT EXISTS cylinder_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,            -- e.g. 'FULL', 'ISSUED', 'EMPTY', 'RETURNED_TO_VENDOR', 'EXPIRED', 'DAMAGED'
    name VARCHAR(50) NOT NULL,                  -- Display name
    description TEXT,
    badge_color VARCHAR(30) DEFAULT 'gray',      -- UI badge styling (e.g. emerald, blue, amber, orange, red)
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Concessionaires / Vendors (e.g. Gas Pantai Timur Sdn Bhd - GPT)
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,            -- e.g. 'GPT'
    name VARCHAR(150) NOT NULL,                 -- e.g. 'Gas Pantai Timur Sdn Bhd'
    short_name VARCHAR(50),                     -- e.g. 'GPT'
    contact_person VARCHAR(100),
    contact_phone VARCHAR(50),
    email VARCHAR(100),
    address TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hospital Locations / Units / Wards / Offsite Vendor Site
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,            -- e.g. 'LOG-PHARM', 'ICU', 'HD', 'OT', 'ED', 'VEND-GPT'
    name VARCHAR(100) NOT NULL,                 -- e.g. 'Logistic Pharmacy Store', 'Intensive Care Unit'
    type VARCHAR(30) NOT NULL DEFAULT 'ward',   -- 'central_store', 'ward', 'ot', 'icu', 'clinic', 'vendor'
    is_central_store BOOLEAN NOT NULL DEFAULT FALSE, -- Flag for Main Hospital Store (Logistic Pharmacy)
    is_in_hospital BOOLEAN NOT NULL DEFAULT TRUE,    -- FALSE for external sites like GPT vendor plant
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL, -- Linked vendor if type = 'vendor'
    contact_person VARCHAR(100),
    contact_phone VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 2. USER MANAGEMENT & AUTHENTICATION
-- ==============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'staff',   -- 'admin', 'staff', 'viewer'
    assigned_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 3. GAS CYLINDER INVENTORY (Core Asset Table)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS gas_cylinders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Scannable Unique Barcode / QR ID (e.g. 'ox0.5pi1', 'ca7.0bn1', or printed barcode)
    -- Highly indexed for instantaneous wireless 2D scanner retrieval (<1ms)
    gas_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Display Name (autogenerated e.g. "Oxygen 0.5 m³ Pin Index" or custom name)
    name VARCHAR(255) NOT NULL,
    
    -- Classification Foreign Keys
    gas_type_id UUID NOT NULL REFERENCES gas_types(id) ON DELETE RESTRICT,
    gas_volume_id UUID NOT NULL REFERENCES gas_volumes(id) ON DELETE RESTRICT,
    valve_type_id UUID NOT NULL REFERENCES valve_types(id) ON DELETE RESTRICT,
    status_id UUID NOT NULL REFERENCES cylinder_statuses(id) ON DELETE RESTRICT,
    
    -- Current Physical Location (tracks whether it is in Logistic Pharmacy, Ward, or Offsite with Vendor)
    current_location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    
    -- Associated Vendor / Concessionaire (e.g. Gas Pantai Timur Sdn Bhd)
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    
    -- Physical & Quality Tracking
    -- Note: serial_number & hydro_test_due_date removed as they are managed directly by the vendor (GPT)
    batch_number VARCHAR(100),                  -- Supplier/refill batch number
    expiry_date DATE,                           -- Gas batch expiry date (if applicable)
    
    -- Metadata & Notes
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 4. TRANSACTIONS & AUDIT LOG (Issue / Return / Vendor Refill History)
-- ==============================================================================

-- Header table for bulk transactions (e.g. issuing to wards, returning to pharmacy, returning to GPT, receiving from GPT)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_no VARCHAR(50) UNIQUE NOT NULL,  -- e.g. 'TXN-20261012-0001'
    
    -- Operation Types:
    -- 'ISSUE'               : Logistic Pharmacy -> Ward/Unit
    -- 'RETURN'              : Ward/Unit -> Logistic Pharmacy
    -- 'RETURN_TO_VENDOR'    : Logistic Pharmacy -> Gas Pantai Timur (GPT)
    -- 'RECEIVE_FROM_VENDOR' : Gas Pantai Timur (GPT) -> Logistic Pharmacy
    -- 'TRANSFER'            : Unit -> Unit
    -- 'ADJUSTMENT'          : Inventory stock correction
    transaction_type VARCHAR(30) NOT NULL,       
    
    -- Manual Indent / DO / Consignment Reference
    indent_no VARCHAR(100),                      -- Manual physical indent slip reference (for ward issue/return)
    delivery_order_no VARCHAR(100),              -- Vendor DO or consignment slip number (for GPT transactions)
    indenter_name VARCHAR(150),                  -- Indenter/receiver name (staff or GPT representative/driver)
    
    -- Associated Vendor (populated for RETURN_TO_VENDOR and RECEIVE_FROM_VENDOR)
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    
    -- Location Movement
    source_location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    destination_location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    
    -- Performed By Staff (Logged-in User)
    performed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Items scanned and processed in each transaction
CREATE TABLE IF NOT EXISTS transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    cylinder_id UUID NOT NULL REFERENCES gas_cylinders(id) ON DELETE RESTRICT,
    
    -- Status Snapshot for audit trail
    status_before_id UUID REFERENCES cylinder_statuses(id) ON DELETE SET NULL,
    status_after_id UUID REFERENCES cylinder_statuses(id) ON DELETE SET NULL,
    
    item_remarks TEXT,                          -- e.g. 'Returned early due to leak', 'Empty', 'Refilled by GPT'
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate scan of the same cylinder within the same transaction batch
    CONSTRAINT uq_transaction_cylinder UNIQUE (transaction_id, cylinder_id)
);

-- ==============================================================================
-- 5. PERFORMANCE INDEXES (Optimized for 2D Quick Scan & Reporting)
-- ==============================================================================

-- Rapid scanner lookup by Barcode/Gas ID
CREATE INDEX IF NOT EXISTS idx_gas_cylinders_gas_id ON gas_cylinders(gas_id);

-- Filter by location and status (Main view inventory page)
CREATE INDEX IF NOT EXISTS idx_gas_cylinders_location_status ON gas_cylinders(current_location_id, status_id);

-- Filter by gas specifications
CREATE INDEX IF NOT EXISTS idx_gas_cylinders_specs ON gas_cylinders(gas_type_id, gas_volume_id, valve_type_id);

-- Filter by vendor
CREATE INDEX IF NOT EXISTS idx_gas_cylinders_vendor ON gas_cylinders(vendor_id);

-- Batch search & date ordering
CREATE INDEX IF NOT EXISTS idx_gas_cylinders_batch ON gas_cylinders(batch_number);
CREATE INDEX IF NOT EXISTS idx_gas_cylinders_created ON gas_cylinders(created_at DESC);

-- Transaction history search by date, type, locations, and references
CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(transaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_dest ON transactions(destination_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor ON transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_indent ON transactions(indent_no);
CREATE INDEX IF NOT EXISTS idx_transactions_do ON transactions(delivery_order_no);
CREATE INDEX IF NOT EXISTS idx_txn_items_cylinder ON transaction_items(cylinder_id);

-- ==============================================================================
-- 6. AUTOMATED TIMESTAMP TRIGGER (updated_at)
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_gas_types_updated
BEFORE UPDATE ON gas_types FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_gas_volumes_updated
BEFORE UPDATE ON gas_volumes FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_valve_types_updated
BEFORE UPDATE ON valve_types FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_cylinder_statuses_updated
BEFORE UPDATE ON cylinder_statuses FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_vendors_updated
BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_locations_updated
BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_users_updated
BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_gas_cylinders_updated
BEFORE UPDATE ON gas_cylinders FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ==============================================================================
-- 7. HELPER VIEWS (Convenient for Fastify API & Reports)
-- ==============================================================================

-- Comprehensive View: Cylinders with resolved human-readable names
CREATE OR REPLACE VIEW v_cylinder_details AS
SELECT 
    c.id,
    c.gas_id,
    c.name,
    c.batch_number,
    c.expiry_date,
    c.notes,
    c.created_at,
    c.updated_at,
    
    -- Gas Type Details
    gt.id AS gas_type_id,
    gt.code AS gas_type_code,
    gt.name AS gas_type_name,
    gt.color_code AS gas_type_color,
    
    -- Volume Details
    gv.id AS gas_volume_id,
    gv.volume_value,
    gv.unit AS volume_unit,
    gv.display_label AS volume_label,
    
    -- Valve Details
    vt.id AS valve_type_id,
    vt.code AS valve_type_code,
    vt.name AS valve_type_name,
    
    -- Status Details
    cs.id AS status_id,
    cs.code AS status_code,
    cs.name AS status_name,
    cs.badge_color AS status_badge_color,
    
    -- Location Details
    loc.id AS location_id,
    loc.code AS location_code,
    loc.name AS location_name,
    loc.type AS location_type,
    loc.is_central_store,
    loc.is_in_hospital,
    
    -- Vendor Details
    v.id AS vendor_id,
    v.code AS vendor_code,
    v.name AS vendor_name,
    v.short_name AS vendor_short_name
FROM gas_cylinders c
JOIN gas_types gt ON c.gas_type_id = gt.id
JOIN gas_volumes gv ON c.gas_volume_id = gv.id
JOIN valve_types vt ON c.valve_type_id = vt.id
JOIN cylinder_statuses cs ON c.status_id = cs.id
JOIN locations loc ON c.current_location_id = loc.id
LEFT JOIN vendors v ON c.vendor_id = v.id;

-- Hospital Inventory View: Only cylinders physically inside the hospital
CREATE OR REPLACE VIEW v_hospital_inventory AS
SELECT * 
FROM v_cylinder_details
WHERE is_in_hospital = TRUE;

-- Vendor Refill Queue View: Cylinders currently offsite with Gas Pantai Timur for refilling
CREATE OR REPLACE VIEW v_cylinders_at_vendor AS
SELECT * 
FROM v_cylinder_details
WHERE is_in_hospital = FALSE OR status_code IN ('RETURNED_TO_VENDOR', 'GPT') OR status_name ILIKE '%Vendor%' OR status_name ILIKE '%GPT%';

-- Inventory Aggregation View: Counts by location, gas type, volume, and status
CREATE OR REPLACE VIEW v_inventory_summary AS
SELECT 
    loc.name AS location_name,
    loc.is_central_store,
    loc.is_in_hospital,
    gt.name AS gas_type_name,
    gv.display_label AS volume_label,
    vt.name AS valve_type_name,
    cs.name AS status_name,
    COUNT(c.id) AS cylinder_count
FROM gas_cylinders c
JOIN locations loc ON c.current_location_id = loc.id
JOIN gas_types gt ON c.gas_type_id = gt.id
JOIN gas_volumes gv ON c.gas_volume_id = gv.id
JOIN valve_types vt ON c.valve_type_id = vt.id
JOIN cylinder_statuses cs ON c.status_id = cs.id
GROUP BY loc.name, loc.is_central_store, loc.is_in_hospital, gt.name, gv.display_label, vt.name, cs.name;

-- ==============================================================================
-- 8. INITIAL SEED DATA (Based directly on project-smartgas.txt)
-- ==============================================================================

-- 8.1 Gas Types
INSERT INTO gas_types (code, name, color_code, sort_order) VALUES
('OX', 'Oxygen', '#1E88E5', 1),
('NO', 'Nitrous Oxide', '#00ACC1', 2),
('CO', 'Carbon Dioxide', '#757575', 3),
('EX', 'Entenox', '#3949AB', 4),
('CA', 'Compressed Air', '#43A047', 5)
ON CONFLICT (code) DO NOTHING;

-- 8.2 Gas Volumes
INSERT INTO gas_volumes (volume_value, unit, display_label, sort_order) VALUES
(0.50, 'm3', '0.5 m³', 1),
(0.70, 'm3', '0.7 m³', 2),
(1.40, 'm3', '1.4 m³', 3),
(1.60, 'm3', '1.6 m³', 4),
(2.00, 'm3', '2.0 m³', 5),
(3.40, 'm3', '3.4 m³', 6),
(6.00, 'kg', '6 KG', 7),
(6.80, 'm3', '6.8 m³', 8),
(7.00, 'm3', '7.0 m³', 9)
ON CONFLICT (volume_value, unit) DO NOTHING;

-- 8.3 Valve Types
INSERT INTO valve_types (code, name, sort_order) VALUES
('PI', 'Pin Index', 1),
('BN', 'Bullnose', 2),
('AMB', 'Ambulance', 3)
ON CONFLICT (code) DO NOTHING;

-- 8.4 Cylinder Statuses
INSERT INTO cylinder_statuses (code, name, badge_color, sort_order) VALUES
('FULL', 'Full', 'emerald', 1),
('ISSUED', 'Issued / In-Use', 'blue', 2),
('EMPTY', 'Empty', 'amber', 3),
('RETURNED_TO_VENDOR', 'Returned to GPT', 'orange', 4),
('EXPIRED', 'Expired', 'red', 5),
('DAMAGED', 'Damaged', 'rose', 6),
('MAINTENANCE', 'Under Maintenance', 'purple', 7)
ON CONFLICT (code) DO NOTHING;

-- 8.5 Vendors / Concessionaires
INSERT INTO vendors (code, name, short_name, contact_person, contact_phone, sort_order) VALUES
('GPT', 'Gas Pantai Timur Sdn Bhd', 'GPT', 'Concessionaire Representative', '09-XXXXXXX', 1)
ON CONFLICT (code) DO NOTHING;

-- 8.6 Locations (Hospital Wards + Offsite Vendor Site)
INSERT INTO locations (code, name, type, is_central_store, is_in_hospital, vendor_id, sort_order) VALUES
('LOG-PHARM', 'Logistic Pharmacy Store', 'central_store', TRUE, TRUE, NULL, 1),
('ICU', 'Intensive Care Unit (ICU)', 'icu', FALSE, TRUE, NULL, 2),
('HD', 'Hemodialysis Unit (HD)', 'ward', FALSE, TRUE, NULL, 3),
('OT', 'Operation Theater (OT)', 'ot', FALSE, TRUE, NULL, 4),
('ED', 'Emergency Department (ED)', 'ward', FALSE, TRUE, NULL, 5),
('WARD-1', 'General Ward 1', 'ward', FALSE, TRUE, NULL, 6),
('WARD-2', 'General Ward 2', 'ward', FALSE, TRUE, NULL, 7),
('VEND-GPT', 'Gas Pantai Timur Sdn Bhd (Refilling Plant)', 'vendor', FALSE, FALSE, (SELECT id FROM vendors WHERE code = 'GPT'), 8)
ON CONFLICT (code) DO NOTHING;

-- 8.7 Default System Accounts
-- Password placeholder: 'admin123' (Salted bcrypt hash below: $2b$10$wT0E8hC85M4.rE98K1bC1e2qQ5r7RkJbU.1sKzFwFwX8P8i7vH7hC)
INSERT INTO users (username, full_name, email, password_hash, role) VALUES
('admin', 'Pharmacy System Administrator', 'admin@smartgas.local', '$2b$10$wT0E8hC85M4.rE98K1bC1e2qQ5r7RkJbU.1sKzFwFwX8P8i7vH7hC', 'admin'),
('staff', 'Logistic Pharmacy Staff', 'staff@smartgas.local', '$2b$10$wT0E8hC85M4.rE98K1bC1e2qQ5r7RkJbU.1sKzFwFwX8P8i7vH7hC', 'staff')
ON CONFLICT (username) DO NOTHING;
