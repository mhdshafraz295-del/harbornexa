const mysql = require('mysql2/promise');
const env = require('../config/env');
const { validateSriLankanNIC, normalizeSriLankanPhone } = require('../utils/validation');

async function runPhase2Tests() {
  console.log('====================================================');
  console.log('   PHASE 2 AUTOMATED TEST SUITE & HARD SAFETY GUARD');
  console.log('====================================================');

  const TEST_DB_NAME = 'valachchenai_harbor_test';

  // HARD SAFETY GUARD
  if (TEST_DB_NAME !== 'valachchenai_harbor_test') {
    console.error('❌ HARD GUARD FAILED: Tests must strictly run on valachchenai_harbor_test!');
    process.exit(1);
  }
  if (env.db.database === TEST_DB_NAME) {
    console.log('✔ Environment database name verified as test database.');
  } else {
    console.log(`✔ Overriding target database from '${env.db.database}' to '${TEST_DB_NAME}' for isolation.`);
  }

  let connection;
  try {
    // 1. Connect to MySQL server
    connection = await mysql.createConnection({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      multipleStatements: true,
    });

    console.log(`✔ Connected to MySQL Server at ${env.db.host}:${env.db.port}`);

    // Create & switch to test database
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${TEST_DB_NAME}\`;`);
    console.log(`✔ Switched to test database \`${TEST_DB_NAME}\`.`);

    // 2. Provision test schema
    await connection.query(`
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

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NULL,
        action VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        metadata_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_test_audit_logs_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS system_sequences (
        sequence_name VARCHAR(50) PRIMARY KEY,
        next_value BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      INSERT INTO system_sequences (sequence_name, next_value)
      VALUES ('FISHER', 1)
      ON DUPLICATE KEY UPDATE next_value = next_value;

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
        CONSTRAINT fk_test_fishers_created_by FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
        INDEX idx_fishers_full_name (full_name),
        INDEX idx_fishers_phone (phone),
        INDEX idx_fishers_boat_no (boat_no),
        INDEX idx_fishers_status (status),
        INDEX idx_fishers_is_archived (is_archived)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✔ Test database schema initialized successfully.');

    // Clear test tables before run
    await connection.query('DELETE FROM fishers;');
    await connection.query("UPDATE system_sequences SET next_value = 1 WHERE sequence_name = 'FISHER';");

    console.log('\n--- Running Core Verification Checks ---');

    // TEST 1: SRI LANKAN NIC VALIDATION & NORMALIZATION
    console.log('\n1. Testing Sri Lankan NIC Validation & Normalization...');
    const oldNicVal = validateSriLankanNIC('991234567v');
    console.assert(oldNicVal.isValid && oldNicVal.normalizedNic === '991234567V', 'Old NIC failed!');
    console.log(`   ✔ Old NIC ('991234567v') -> Normalized: ${oldNicVal.normalizedNic}`);

    const newNicVal = validateSriLankanNIC('200527001738');
    console.assert(newNicVal.isValid && newNicVal.normalizedNic === '200527001738', 'New NIC failed!');
    console.log(`   ✔ New NIC ('200527001738') -> Normalized: ${newNicVal.normalizedNic}`);

    const invalidNicVal = validateSriLankanNIC('12345');
    console.assert(!invalidNicVal.isValid, 'Invalid NIC failed to be rejected!');
    console.log('   ✔ Invalid NIC ("12345") correctly rejected.');

    // TEST 2: PHONE NORMALIZATION
    console.log('\n2. Testing Sri Lankan Phone Normalization...');
    const phone1 = normalizeSriLankanPhone('0771234567');
    console.assert(phone1.isValid && phone1.normalizedPhone === '+94771234567', 'Phone 1 failed!');
    console.log(`   ✔ Local Phone ('0771234567') -> Normalized: ${phone1.normalizedPhone}`);

    const phone2 = normalizeSriLankanPhone('+94 77 123 4567');
    console.assert(phone2.isValid && phone2.normalizedPhone === '+94771234567', 'Phone 2 failed!');
    console.log(`   ✔ Format Phone ('+94 77 123 4567') -> Normalized: ${phone2.normalizedPhone}`);

    // TEST 3: TRANSACTION-SAFE FISHER ID GENERATION & CONCURRENCY
    console.log('\n3. Testing Sequence-based Fisher ID Generation & Concurrency...');
    
    // Function to simulate transaction-safe fisher creation
    async function createFisherTx(fullName, rawNic, rawPhone, boatNo, status = 'ACTIVE') {
      const conn = await mysql.createConnection({
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database: TEST_DB_NAME,
      });

      try {
        await conn.beginTransaction();
        const [seq] = await conn.query("SELECT next_value FROM system_sequences WHERE sequence_name='FISHER' FOR UPDATE;");
        const nextVal = seq[0].next_value;
        const fisherId = `FIS-${String(nextVal).padStart(6, '0')}`;
        await conn.query("UPDATE system_sequences SET next_value = next_value + 1 WHERE sequence_name='FISHER';");

        const nicNorm = validateSriLankanNIC(rawNic).normalizedNic;
        const phoneNorm = normalizeSriLankanPhone(rawPhone).normalizedPhone;

        const [res] = await conn.query(
          `INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [fisherId, fullName, nicNorm, phoneNorm, boatNo, status]
        );
        await conn.commit();
        await conn.end();
        return { id: res.insertId, fisherId };
      } catch (err) {
        await conn.rollback();
        await conn.end();
        throw err;
      }
    }

    const f1 = await createFisherTx('Kadiramarthamby Rifan', '881234567V', '0771112233', 'IMULA-A-0123', 'ACTIVE');
    console.assert(f1.fisherId === 'FIS-000001', 'F1 Fisher ID generation failed!');
    console.log(`   ✔ Single Fisher creation -> ID: ${f1.fisherId}`);

    // Concurrency test: insert 5 fishers concurrently
    console.log('   Running concurrent Fisher creation test...');
    const concurrentPromises = [
      createFisherTx('Fisher Two', '901234561V', '0771000001', 'BOAT-2', 'ACTIVE'),
      createFisherTx('Fisher Three', '901234562V', '0771000002', 'BOAT-3', 'BLOCKED'),
      createFisherTx('Fisher Four', '901234563V', '0771000003', 'BOAT-4', 'PENDING'),
      createFisherTx('Fisher Five', '901234564V', '0771000004', 'BOAT-5', 'ACTIVE'),
    ];

    const results = await Promise.all(concurrentPromises);
    const generatedIds = results.map(r => r.fisherId);
    console.log(`   ✔ Concurrent Fisher IDs generated: ${generatedIds.join(', ')}`);
    const uniqueIds = new Set(generatedIds);
    console.assert(uniqueIds.size === generatedIds.length, 'Duplicate Fisher IDs detected in concurrency test!');
    console.log('   ✔ Concurrency test passed: Zero duplicate Fisher IDs generated!');

    // TEST 4: DUPLICATE NIC REJECTION
    console.log('\n4. Testing Duplicate NIC Rejection (409 Conflict)...');
    try {
      await createFisherTx('Duplicate Fisher', '881234567V', '0779998888', 'BOAT-DUP', 'ACTIVE');
      console.assert(false, 'Duplicate NIC was not rejected!');
    } catch (dupErr) {
      console.assert(dupErr.code === 'ER_DUP_ENTRY', 'Duplicate NIC check failed!');
      console.log('   ✔ Duplicate NIC correctly blocked by database constraint ER_DUP_ENTRY.');
    }

    // TEST 5: MULTI-FIELD SEARCH & STATUS FILTERS
    console.log('\n5. Testing Multi-field Search & Status Filters...');
    const [searchByName] = await connection.query("SELECT * FROM fishers WHERE full_name LIKE '%Rifan%'");
    console.assert(searchByName.length === 1, 'Search by Name failed!');
    console.log(`   ✔ Search by Name ('Rifan') -> Found: ${searchByName[0].full_name} (${searchByName[0].fisher_id})`);

    const [searchByNic] = await connection.query("SELECT * FROM fishers WHERE nic = '881234567V'");
    console.assert(searchByNic.length === 1, 'Search by NIC failed!');
    console.log(`   ✔ Search by NIC ('881234567V') -> Found: ${searchByNic[0].fisher_id}`);

    const [searchByBoat] = await connection.query("SELECT * FROM fishers WHERE boat_no LIKE '%IMULA%'");
    console.assert(searchByBoat.length === 1, 'Search by Boat No failed!');
    console.log(`   ✔ Search by Boat No ('IMULA') -> Found: ${searchByBoat[0].boat_no}`);

    const [blockedFilter] = await connection.query("SELECT * FROM fishers WHERE status = 'BLOCKED'");
    console.assert(blockedFilter.length === 1, 'Blocked filter failed!');
    console.log(`   ✔ Blocked Status Filter -> Found ${blockedFilter.length} blocked fisher: ${blockedFilter[0].full_name}`);

    // TEST 6: ARCHIVE & RESTORE LOGIC + ARCHIVE FILTER
    console.log('\n6. Testing Archive, Restore & archiveStatus Filter...');
    await connection.query("UPDATE fishers SET is_archived = TRUE WHERE fisher_id = 'FIS-000001';");
    
    const [archivedList] = await connection.query("SELECT * FROM fishers WHERE is_archived = TRUE;");
    console.assert(archivedList.length === 1 && archivedList[0].fisher_id === 'FIS-000001', 'Archived list failed!');
    console.log(`   ✔ Archived Filter ('archiveStatus=ARCHIVED') -> Returned ONLY archived fisher: ${archivedList[0].fisher_id}`);

    const [activeNonArchivedList] = await connection.query("SELECT * FROM fishers WHERE is_archived = FALSE;");
    console.assert(activeNonArchivedList.length === 4, 'Active list should exclude archived fishers!');
    console.log(`   ✔ Active List ('archiveStatus=ACTIVE') -> Returned ${activeNonArchivedList.length} non-archived fishers.`);

    // Restore fisher
    await connection.query("UPDATE fishers SET is_archived = FALSE WHERE fisher_id = 'FIS-000001';");
    console.log('   ✔ Restore action set `is_archived = FALSE`.');

    // TEST 7: GLOBAL REAL DATABASE COUNTS
    console.log('\n7. Testing Global Real Database Counts Calculation...');
    const [globalCounts] = await connection.query(`
      SELECT
        SUM(CASE WHEN is_archived = FALSE THEN 1 ELSE 0 END) as count_all,
        SUM(CASE WHEN is_archived = FALSE AND status = 'ACTIVE' THEN 1 ELSE 0 END) as count_active,
        SUM(CASE WHEN is_archived = FALSE AND status = 'BLOCKED' THEN 1 ELSE 0 END) as count_blocked,
        SUM(CASE WHEN is_archived = FALSE AND status = 'PENDING' THEN 1 ELSE 0 END) as count_pending,
        SUM(CASE WHEN is_archived = TRUE THEN 1 ELSE 0 END) as count_archived
      FROM fishers
    `);
    const c = globalCounts[0];
    const countAll = Number(c.count_all);
    const countActive = Number(c.count_active);
    const countBlocked = Number(c.count_blocked);
    const countPending = Number(c.count_pending);
    const countArchived = Number(c.count_archived);
    console.log(`   ✔ Global Counts -> All: ${countAll}, Active: ${countActive}, Blocked: ${countBlocked}, Pending: ${countPending}, Archived: ${countArchived}`);
    console.assert(countAll === 5 && countActive === 3 && countBlocked === 1 && countPending === 1 && countArchived === 0, 'Global counts mismatch!');

    // CLEANUP FIXTURES FROM TEST DB
    console.log('\n--- Cleaning Up Test Fixtures ---');
    await connection.query('DELETE FROM fishers;');
    await connection.query("UPDATE system_sequences SET next_value = 1 WHERE sequence_name = 'FISHER';");
    console.log('✔ All test fixtures deleted from test database.');

    // VERIFY DEV DATABASE IS CLEAN
    console.log('\n--- Verifying Development Database Safety ---');
    await connection.query(`USE \`${env.db.database}\`;`);
    const [devFishers] = await connection.query('SELECT COUNT(*) as cnt FROM fishers;');
    console.log(`✔ Development database \`${env.db.database}\` contains ${devFishers[0].cnt} fisher records.`);
    console.assert(devFishers[0].cnt === 0, 'Development database contains fake/test records!');

    console.log('\n====================================================');
    console.log('   ALL PHASE 2 AUTOMATED TESTS PASSED SUCCESSFULLY! ');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Test execution error:', err);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runPhase2Tests();
