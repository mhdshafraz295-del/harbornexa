const prisma = require('../config/prismaClient');
const env = require('../config/env');

async function runMigration() {
  console.log('--- Valachchenai Harbor Migration Tool (Prisma Engine) ---');
  console.log(`Checking connection to MySQL target database \`${env.db.database}\`...`);

  try {
    // 1. Verify Prisma connectivity
    await prisma.$queryRaw`SELECT 1`;
    console.log('✔ MySQL Server and target database reachable via Prisma.');

    // 2. Create admins table
    const createAdminsTable = `
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'ADMIN',
        status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        last_login_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createAdminsTable);
    console.log('✔ Table `admins` created or already exists.');

    // 3. Create audit_logs table
    const createAuditLogsTable = `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NULL,
        action VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        metadata_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_audit_logs_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createAuditLogsTable);
    console.log('✔ Table `audit_logs` created or already exists.');

    // 4. Create settings table
    const createSettingsTable = `
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createSettingsTable);
    console.log('✔ Table `settings` created or already exists.');

    // 5. Create system_sequences table
    const createSequencesTable = `
      CREATE TABLE IF NOT EXISTS system_sequences (
        sequence_name VARCHAR(50) PRIMARY KEY,
        next_value BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createSequencesTable);
    console.log('✔ Table `system_sequences` created or already exists.');

    // Seed sequences if not exist
    await prisma.$executeRawUnsafe(`
      INSERT INTO system_sequences (sequence_name, next_value)
      VALUES ('FISHER', 1), ('CLEARANCE', 1)
      ON DUPLICATE KEY UPDATE sequence_name = sequence_name;
    `);
    console.log('✔ Sequences `FISHER` and `CLEARANCE` seeded.');

    // 6. Create fishers table
    const createFishersTable = `
      CREATE TABLE IF NOT EXISTS fishers (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        fisher_id VARCHAR(20) UNIQUE NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        nic VARCHAR(20) UNIQUE NOT NULL,
        phone VARCHAR(20) NULL,
        boat_no VARCHAR(100) NULL,
        address TEXT NULL,
        notes TEXT NULL,
        status ENUM('ACTIVE', 'BLOCKED', 'PENDING') NOT NULL DEFAULT 'ACTIVE',
        is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_by_admin_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_fishers_created_by FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
        INDEX idx_fishers_full_name (full_name),
        INDEX idx_fishers_phone (phone),
        INDEX idx_fishers_boat_no (boat_no),
        INDEX idx_fishers_status (status),
        INDEX idx_fishers_is_archived (is_archived)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createFishersTable);
    console.log('✔ Table `fishers` created with indexes or already exists.');

    // 7. Create charge_types table
    const createChargeTypesTable = `
      CREATE TABLE IF NOT EXISTS charge_types (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        default_amount DECIMAL(12,2) NOT NULL,
        description VARCHAR(500) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_admin_id INT NOT NULL,
        updated_by_admin_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_charge_types_created_by FOREIGN KEY (created_by_admin_id) REFERENCES admins(id),
        CONSTRAINT fk_charge_types_updated_by FOREIGN KEY (updated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
        INDEX idx_charge_types_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createChargeTypesTable);
    console.log('✔ Table `charge_types` created or already exists.');

    // 8. Create fisher_debts table
    const createDebtsTable = `
      CREATE TABLE IF NOT EXISTS fisher_debts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        fisher_id BIGINT NOT NULL,
        charge_type_id BIGINT NULL,
        category VARCHAR(100) NOT NULL,
        description TEXT NULL,
        original_amount DECIMAL(12,2) NOT NULL,
        debt_date DATE NOT NULL,
        due_date DATE NULL,
        status ENUM('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
        notes TEXT NULL,
        cancelled_at DATETIME NULL,
        cancelled_by_admin_id INT NULL,
        cancellation_reason VARCHAR(500) NULL,
        created_by_admin_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_debts_fisher FOREIGN KEY (fisher_id) REFERENCES fishers(id) ON DELETE CASCADE,
        CONSTRAINT fk_debts_charge_type FOREIGN KEY (charge_type_id) REFERENCES charge_types(id) ON DELETE SET NULL,
        CONSTRAINT fk_debts_created_by FOREIGN KEY (created_by_admin_id) REFERENCES admins(id),
        CONSTRAINT fk_debts_cancelled_by FOREIGN KEY (cancelled_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
        INDEX idx_debts_fisher_id (fisher_id),
        INDEX idx_debts_status (status),
        INDEX idx_debts_debt_date (debt_date),
        INDEX idx_debts_due_date (due_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createDebtsTable);
    console.log('✔ Table `fisher_debts` created or already exists.');

    // Ensure charge_type_id column exists if fisher_debts was previously created
    const dbName = env.db.database;
    const chargeTypeCol = await prisma.$queryRaw`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ${dbName} AND TABLE_NAME = 'fisher_debts' AND COLUMN_NAME = 'charge_type_id'
    `;
    if (!chargeTypeCol || chargeTypeCol.length === 0) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE fisher_debts 
        ADD COLUMN charge_type_id BIGINT NULL AFTER fisher_id,
        ADD CONSTRAINT fk_debts_charge_type FOREIGN KEY (charge_type_id) REFERENCES charge_types(id) ON DELETE SET NULL;
      `);
      console.log('✔ Added `charge_type_id` column to `fisher_debts`.');
    }

    // 9. Create debt_payments table
    const createPaymentsTable = `
      CREATE TABLE IF NOT EXISTS debt_payments (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        debt_id BIGINT NOT NULL,
        fisher_id BIGINT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        payment_date DATE NOT NULL,
        payment_method VARCHAR(50) NULL,
        reference_no VARCHAR(100) NULL,
        notes TEXT NULL,
        idempotency_key VARCHAR(64) NOT NULL UNIQUE,
        received_by_admin_id INT NOT NULL,
        reversed_at DATETIME NULL,
        reversed_by_admin_id INT NULL,
        reversal_reason VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_payments_debt FOREIGN KEY (debt_id) REFERENCES fisher_debts(id) ON DELETE CASCADE,
        CONSTRAINT fk_payments_fisher FOREIGN KEY (fisher_id) REFERENCES fishers(id) ON DELETE CASCADE,
        CONSTRAINT fk_payments_received_by FOREIGN KEY (received_by_admin_id) REFERENCES admins(id),
        CONSTRAINT fk_payments_reversed_by FOREIGN KEY (reversed_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
        INDEX idx_payments_debt_id (debt_id),
        INDEX idx_payments_fisher_id (fisher_id),
        INDEX idx_payments_payment_date (payment_date),
        INDEX idx_payments_reversed_at (reversed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createPaymentsTable);
    console.log('✔ Table `debt_payments` created or already exists.');

    // 10. Create fisher_holds table
    const createHoldsTable = `
      CREATE TABLE IF NOT EXISTS fisher_holds (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        fisher_id BIGINT NOT NULL,
        reason_code ENUM('PAYMENT_ISSUE', 'DOCUMENT_ISSUE', 'MANAGEMENT_DECISION', 'OTHER') NOT NULL,
        reason_text VARCHAR(500) NULL,
        notes TEXT NULL,
        hold_date DATETIME NOT NULL,
        created_by_admin_id INT NOT NULL,
        released_at DATETIME NULL,
        released_by_admin_id INT NULL,
        release_notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_holds_fisher FOREIGN KEY (fisher_id) REFERENCES fishers(id) ON DELETE CASCADE,
        CONSTRAINT fk_holds_created_by FOREIGN KEY (created_by_admin_id) REFERENCES admins(id),
        CONSTRAINT fk_holds_released_by FOREIGN KEY (released_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
        INDEX idx_holds_fisher_id (fisher_id),
        INDEX idx_holds_released_at (released_at),
        INDEX idx_holds_reason_code (reason_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createHoldsTable);
    console.log('✔ Table `fisher_holds` created or already exists.');

    // 11. Create clearance_records table
    const createClearanceRecordsTable = `
      CREATE TABLE IF NOT EXISTS clearance_records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        clearance_no VARCHAR(30) NOT NULL UNIQUE,
        fisher_id BIGINT NOT NULL,
        boat_no_snapshot VARCHAR(100) NULL,
        base_status_snapshot ENUM('ACTIVE', 'BLOCKED', 'PENDING') NOT NULL,
        outstanding_debt_snapshot DECIMAL(12,2) NOT NULL,
        clearance_status VARCHAR(30) NOT NULL,
        notes TEXT NULL,
        idempotency_key VARCHAR(64) NOT NULL UNIQUE,
        granted_by_admin_id INT NOT NULL,
        granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_clearance_fisher FOREIGN KEY (fisher_id) REFERENCES fishers(id) ON DELETE CASCADE,
        CONSTRAINT fk_clearance_granted_by FOREIGN KEY (granted_by_admin_id) REFERENCES admins(id),
        INDEX idx_clearance_fisher_id (fisher_id),
        INDEX idx_clearance_granted_at (granted_at),
        INDEX idx_clearance_status (clearance_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await prisma.$executeRawUnsafe(createClearanceRecordsTable);
    console.log('✔ Table `clearance_records` created or already exists.');

    // 12. Drop unused fisher_bcl_records table if exists
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS fisher_bcl_records;');
    console.log('✔ Table `fisher_bcl_records` removed (unused legacy table).');

    console.log('-------------------------------------------');
    console.log('Migration completed successfully with clean schema!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
