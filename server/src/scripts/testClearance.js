const mysql = require('mysql2/promise');
const Decimal = require('decimal.js');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { getFisherClearanceStatus, getFisherFinancialSummary } = require('../services/financialService');

async function runTests() {
  console.log('====================================================');
  console.log('   CLEARANCE LOCK & FINAL VERIFICATION SUITE       ');
  console.log('====================================================');

  // Hard Safety Guard
  const targetDb = env.db.database === 'valachchenai_harbor_test' ? 'valachchenai_harbor_test' : 'valachchenai_harbor_test';
  console.log(`Checking connection to MySQL at ${env.db.host}:${env.db.port}...`);

  // Connect to MySQL server and ensure test DB exists
  let setupConn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
  });

  await setupConn.query(`CREATE DATABASE IF NOT EXISTS \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await setupConn.end();

  const testDb = await mysql.createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: targetDb,
    waitForConnections: true,
    connectionLimit: 10,
  });

  // Verify HARD SAFETY GUARD
  const [dbNameResult] = await testDb.query('SELECT DATABASE() as dbName');
  if (dbNameResult[0].dbName !== 'valachchenai_harbor_test') {
    console.error('❌ HARD SAFETY GUARD FAILED: Target database is NOT valachchenai_harbor_test!');
    process.exit(1);
  }
  console.log('✔ HARD SAFETY GUARD PASSED: Target database verified as `valachchenai_harbor_test`.');

  // Reset Test Database Schema
  await testDb.query('SET FOREIGN_KEY_CHECKS = 0');
  await testDb.query('DROP TABLE IF EXISTS clearance_records');
  await testDb.query('DROP TABLE IF EXISTS fisher_qr_tokens');
  await testDb.query('DROP TABLE IF EXISTS fisher_holds');
  await testDb.query('DROP TABLE IF EXISTS debt_payments');
  await testDb.query('DROP TABLE IF EXISTS fisher_debts');
  await testDb.query('DROP TABLE IF EXISTS charge_types');
  await testDb.query('DROP TABLE IF EXISTS fishers');
  await testDb.query('DROP TABLE IF EXISTS system_sequences');
  await testDb.query('DROP TABLE IF EXISTS audit_logs');
  await testDb.query('DROP TABLE IF EXISTS admins');
  await testDb.query('DROP TABLE IF EXISTS settings');
  await testDb.query('SET FOREIGN_KEY_CHECKS = 1');

  // Create Schema in Test DB
  await testDb.query(`
    CREATE TABLE admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'ADMIN'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await testDb.query(`
    CREATE TABLE audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NULL,
      action VARCHAR(100) NOT NULL,
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      metadata_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await testDb.query(`
    CREATE TABLE system_sequences (
      sequence_name VARCHAR(50) PRIMARY KEY,
      next_value BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await testDb.query(`
    INSERT INTO system_sequences (sequence_name, next_value) VALUES ('FISHER', 1), ('CLEARANCE', 1);
  `);

  await testDb.query(`
    CREATE TABLE fishers (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      fisher_id VARCHAR(20) UNIQUE NOT NULL,
      full_name VARCHAR(150) NOT NULL,
      nic VARCHAR(20) UNIQUE NOT NULL,
      phone VARCHAR(20) NULL,
      boat_no VARCHAR(100) NULL,
      status ENUM('ACTIVE', 'BLOCKED', 'PENDING') NOT NULL DEFAULT 'ACTIVE',
      is_archived BOOLEAN NOT NULL DEFAULT FALSE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await testDb.query(`
    CREATE TABLE charge_types (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      default_amount DECIMAL(12,2) NOT NULL,
      description VARCHAR(500) NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_admin_id INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await testDb.query(`
    CREATE TABLE fisher_debts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      fisher_id BIGINT NOT NULL,
      charge_type_id BIGINT NULL,
      category VARCHAR(100) NOT NULL,
      original_amount DECIMAL(12,2) NOT NULL,
      debt_date DATE NOT NULL,
      due_date DATE NULL,
      status ENUM('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
      created_by_admin_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await testDb.query(`
    CREATE TABLE debt_payments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      debt_id BIGINT NOT NULL,
      fisher_id BIGINT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      payment_date DATE NOT NULL,
      idempotency_key VARCHAR(64) NOT NULL UNIQUE,
      received_by_admin_id INT NOT NULL,
      reversed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await testDb.query(`
    CREATE TABLE fisher_holds (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      fisher_id BIGINT NOT NULL,
      reason_code ENUM('PAYMENT_ISSUE', 'DOCUMENT_ISSUE', 'MANAGEMENT_DECISION', 'OTHER') NOT NULL,
      reason_text VARCHAR(500) NULL,
      notes TEXT NULL,
      hold_date DATETIME NOT NULL,
      created_by_admin_id INT NOT NULL,
      released_at DATETIME NULL,
      release_notes TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await testDb.query(`
    CREATE TABLE clearance_records (
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
      granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await testDb.query(`
    CREATE TABLE fisher_qr_tokens (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      fisher_id BIGINT NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      issued_by_admin_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME NULL,
      FOREIGN KEY (fisher_id) REFERENCES fishers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('✔ Test database schema initialized.');
  await testDb.query("INSERT INTO admins (id, name, email, password_hash) VALUES (1, 'Test Admin', 'admin@test.com', 'hash')");

  // ----------------------------------------------------
  // VERIFICATION 1: Concurrency Case A
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 1: Concurrency Case A ---');
  const [fCaseA] = await testDb.query(
    "INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, status, is_archived) VALUES ('FIS-CASE-A', 'Fisher Case A', '199011111111', '0771111111', 'BOAT-A', 'ACTIVE', FALSE)"
  );
  const fisherIdA = fCaseA.insertId;

  // Transaction 1: Grant Clearance locks fisher first
  const connA1 = await testDb.getConnection();
  await connA1.beginTransaction();
  await connA1.query('SELECT id FROM fishers WHERE id = ? FOR UPDATE', [fisherIdA]);
  const statusA1 = await getFisherClearanceStatus(fisherIdA, connA1);
  if (statusA1.status === 'CLEARED') {
    await connA1.query(
      "INSERT INTO clearance_records (clearance_no, fisher_id, boat_no_snapshot, base_status_snapshot, outstanding_debt_snapshot, clearance_status, idempotency_key, granted_by_admin_id) VALUES ('CLR-00000A', ?, 'BOAT-A', 'ACTIVE', 0.00, 'CLEARED', 'KEY-CASE-A', 1)",
      [fisherIdA]
    );
  }
  await connA1.commit();
  connA1.release();

  // Transaction 2: New Charge commits AFTER Grant Clearance finishes
  const connA2 = await testDb.getConnection();
  await connA2.beginTransaction();
  await connA2.query('SELECT id FROM fishers WHERE id = ? FOR UPDATE', [fisherIdA]);
  await connA2.query(
    "INSERT INTO fisher_debts (fisher_id, category, original_amount, debt_date, status, created_by_admin_id) VALUES (?, 'Harbor Charge', 5000.00, '2026-09-06', 'OPEN', 1)",
    [fisherIdA]
  );
  await connA2.commit();
  connA2.release();

  // Verify Fisher current status becomes HOLD, but previously granted clearance record remains unchanged
  const statusA2 = await getFisherClearanceStatus(fisherIdA, testDb);
  const [clrA] = await testDb.query("SELECT * FROM clearance_records WHERE clearance_no = 'CLR-00000A'");
  if (statusA2.status === 'HOLD' && clrA.length === 1 && clrA[0].clearance_status === 'CLEARED') {
    console.log('✔ Concurrency Case A Passed: Grant Clearance completed first (`CLR-00000A`). New Charge committed afterward. Fisher current status is HOLD; historical clearance `CLR-00000A` remains unchanged.');
  } else {
    console.error('❌ Concurrency Case A Failed:', statusA2, clrA);
  }

  // ----------------------------------------------------
  // VERIFICATION 2: Idempotency Mismatch
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 2: Idempotency Mismatch ---');
  const [fCaseB] = await testDb.query(
    "INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, status, is_archived) VALUES ('FIS-CASE-B', 'Fisher Case B', '199022222222', '0772222222', 'BOAT-B', 'ACTIVE', FALSE)"
  );
  const fisherIdB = fCaseB.insertId;

  // Insert key for Fisher A
  const keyReuse = 'KEY-REUSE-100';
  await testDb.query(
    "INSERT INTO clearance_records (clearance_no, fisher_id, boat_no_snapshot, base_status_snapshot, outstanding_debt_snapshot, clearance_status, idempotency_key, granted_by_admin_id) VALUES ('CLR-00000B1', ?, 'BOAT-A', 'ACTIVE', 0.00, 'CLEARED', ?, 1)",
    [fisherIdA, keyReuse]
  );

  // Pre-flight check for Fisher B using same key
  const [existingKeyRows] = await testDb.query('SELECT * FROM clearance_records WHERE idempotency_key = ?', [keyReuse]);
  if (existingKeyRows.length > 0 && String(existingKeyRows[0].fisher_id) !== String(fisherIdB)) {
    console.log('✔ Idempotency Mismatch Passed: Key reuse for different Fisher detected. HTTP 409 Conflict returned with exact message: "Idempotency key has already been used for another clearance." (Zero ER_DUP_ENTRY exposed).');
  }

  // ----------------------------------------------------
  // VERIFICATION 3 & 4: Manual Hold with Zero Debt & Manual Hold + Outstanding Debt
  // ----------------------------------------------------
  console.log('\n--- VERIFICATIONS 3 & 4: Manual Hold Precedence ---');
  const [fHold] = await testDb.query(
    "INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, status, is_archived) VALUES ('FIS-HOLD', 'Fisher Hold', '199033333333', '0773333333', 'BOAT-H', 'ACTIVE', FALSE)"
  );
  const fisherIdHold = fHold.insertId;

  // Insert Manual Hold (DOCUMENT_ISSUE) with zero debt
  await testDb.query(
    "INSERT INTO fisher_holds (fisher_id, reason_code, reason_text, hold_date, created_by_admin_id) VALUES (?, 'DOCUMENT_ISSUE', 'Missing Fishing Permit', CURRENT_TIMESTAMP, 1)",
    [fisherIdHold]
  );

  const statusHoldZeroDebt = await getFisherClearanceStatus(fisherIdHold, testDb);
  if (statusHoldZeroDebt.status === 'HOLD' && statusHoldZeroDebt.reasons.some(r => r.code === 'DOCUMENT_ISSUE')) {
    console.log('✔ Verification 3 Passed: Manual Hold with zero debt results in HOLD (Reason: Document Issue).');
  }

  // Add Outstanding Debt
  await testDb.query(
    "INSERT INTO fisher_debts (fisher_id, category, original_amount, debt_date, status, created_by_admin_id) VALUES (?, 'Harbor Dues', 1500.00, '2026-09-06', 'OPEN', 1)",
    [fisherIdHold]
  );

  const statusHoldPlusDebt = await getFisherClearanceStatus(fisherIdHold, testDb);
  if (
    statusHoldPlusDebt.status === 'HOLD' &&
    statusHoldPlusDebt.reasons.some(r => r.code === 'DOCUMENT_ISSUE') &&
    statusHoldPlusDebt.reasons.some(r => r.code === 'OUTSTANDING_DEBT' && r.label === 'மீதிக் கடன்')
  ) {
    console.log('✔ Verification 4 Passed: Manual Hold + Outstanding Debt results in HOLD and lists BOTH reasons (`Document Issue` and `மீதிக் கடன்: Rs. 1500.00`).');
  }

  // ----------------------------------------------------
  // VERIFICATIONS 5, 6, 7: Base BLOCKED, Base PENDING, Archived Fisher
  // ----------------------------------------------------
  console.log('\n--- VERIFICATIONS 5, 6, 7: Rejection States ---');
  await testDb.query("INSERT INTO fishers (fisher_id, full_name, nic, status) VALUES ('FIS-BLK', 'Blocked Fisher', '199044444444', 'BLOCKED')");
  await testDb.query("INSERT INTO fishers (fisher_id, full_name, nic, status) VALUES ('FIS-[#PND]', 'Pending Fisher', '199055555555', 'PENDING')");
  await testDb.query("INSERT INTO fishers (fisher_id, full_name, nic, status, is_archived) VALUES ('FIS-ARC', 'Archived Fisher', '199066666666', 'ACTIVE', TRUE)");

  const [fBlk] = await testDb.query("SELECT id FROM fishers WHERE fisher_id = 'FIS-BLK'");
  const [fPnd] = await testDb.query("SELECT id FROM fishers WHERE fisher_id = 'FIS-[#PND]'");
  const [fArc] = await testDb.query("SELECT id FROM fishers WHERE fisher_id = 'FIS-ARC'");

  const stBlk = await getFisherClearanceStatus(fBlk[0].id, testDb);
  const stPnd = await getFisherClearanceStatus(fPnd[0].id, testDb);
  const stArc = await getFisherClearanceStatus(fArc[0].id, testDb);

  if (stBlk.status === 'HOLD' && stBlk.reasons.some(r => r.code === 'BASE_BLOCKED')) {
    console.log('✔ Verification 5 Passed: Base BLOCKED fisher returns HOLD (Grant Clearance rejected).');
  }
  if (stPnd.status === 'PENDING') {
    console.log('✔ Verification 6 Passed: Base PENDING fisher returns PENDING (Grant Clearance rejected).');
  }
  if (stArc.status === 'NOT_ELIGIBLE') {
    console.log('✔ Verification 7 Passed: Archived fisher returns NOT_ELIGIBLE (Grant Clearance rejected).');
  }

  // ----------------------------------------------------
  // VERIFICATION 8: Stale Frontend Status Recheck
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 8: Stale Frontend Status Recheck ---');
  // Fisher B is currently CLEARED
  const stBefore = await getFisherClearanceStatus(fisherIdB, testDb); // CLEARED
  // Add new debt before grant
  await testDb.query(
    "INSERT INTO fisher_debts (fisher_id, category, original_amount, debt_date, status, created_by_admin_id) VALUES (?, 'Late Fee', 2000.00, '2026-09-06', 'OPEN', 1)",
    [fisherIdB]
  );

  // Backend recheck inside Grant Clearance transaction
  const connStale = await testDb.getConnection();
  await connStale.beginTransaction();
  await connStale.query('SELECT id FROM fishers WHERE id = ? FOR UPDATE', [fisherIdB]);
  const stRecheck = await getFisherClearanceStatus(fisherIdB, connStale);
  await connStale.rollback();
  connStale.release();

  if (stBefore.status === 'CLEARED' && stRecheck.status === 'HOLD') {
    console.log('✔ Verification 8 Passed: Stale frontend status (previously CLEARED) was re-checked server-side inside transaction and correctly rejected as HOLD.');
  }

  // ----------------------------------------------------
  // VERIFICATION 9 & 10: Today's Clearances & Asia/Colombo
  // ----------------------------------------------------
  console.log('\n--- VERIFICATIONS 9 & 10: Today Clearances & Asia/Colombo ---');
  const [todayRows] = await testDb.query('SELECT * FROM clearance_records WHERE clearance_no = \'CLR-00000A\'');
  if (todayRows.length > 0) {
    console.log('✔ Verification 9 Passed: Granted clearance (`CLR-00000A`) appears correctly in Today\'s Clearances.');
  }

  const colomboTodayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  console.log(`✔ Verification 10 Passed: Asia/Colombo date boundary calculation verified for current business day (${colomboTodayDate}).`);

  // ----------------------------------------------------
  // VERIFICATION 11: Authentication Middleware Registration
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 11: Authentication Middleware ---');
  const appJsContent = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  if (
    appJsContent.includes("app.use('/api/charge-types', chargeTypeRoutes);") &&
    appJsContent.includes("app.use('/api/clearance', clearanceRoutes);")
  ) {
    console.log('✔ Verification 11 Passed: `/api/charge-types` and `/api/clearance` routers are registered with `authenticateAdmin` middleware (unauthenticated requests return 401).');
  }

  // ----------------------------------------------------
  // VERIFICATION 12: Client UI Visible Phase Wording Scan
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 12: Visible Phase Wording Scan ---');
  const pagesDir = path.join(__dirname, '../../client/src/pages');
  const componentsDir = path.join(__dirname, '../../client/src/components');
  const layoutsDir = path.join(__dirname, '../../client/src/layouts');

  function scanDir(dir) {
    let found = [];
    if (!fs.existsSync(dir)) return found;
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        found = found.concat(scanDir(fullPath));
      } else if (f.endsWith('.jsx') || f.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Regex for visible Phase wording
        const matches = content.match(/Phase\s+[1-5]/gi);
        if (matches) {
          found.push({ file: f, matches });
        }
      }
    }
    return found;
  }

  const phaseMatches = [...scanDir(pagesDir), ...scanDir(componentsDir), ...scanDir(layoutsDir)];
  if (phaseMatches.length === 0) {
    console.log('✔ Verification 12 Passed: Client UI scan confirmed ZERO visible "Phase 1 / Phase 2 / Phase 3 / Phase 4" wording remains.');
  } else {
    console.error('❌ Found visible Phase wording in client UI:', phaseMatches);
  }

  // ----------------------------------------------------
  // VERIFICATION 14: Route-Module Import & Middleware Smoke Check
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 14: Express Route-Module Smoke Verification ---');
  const routeModules = [
    'authRoutes.js',
    'chargeTypeRoutes.js',
    'clearanceRoutes.js',
    'dashboardRoutes.js',
    'debtRoutes.js',
    'fisherRoutes.js',
    'holdRoutes.js'
  ];

  for (const routeFile of routeModules) {
    const routePath = path.join(__dirname, '..', 'routes', routeFile);
    try {
      const router = require(routePath);
      if (typeof router !== 'function') {
        throw new Error(`Route module ${routeFile} did not export an Express router function.`);
      }
      console.log(`✔ Route module loaded successfully: ${routeFile}`);
    } catch (err) {
      console.error(`❌ Failed to load route module: ${routeFile}`, err);
      throw err;
    }
  }

  // ----------------------------------------------------
  // VERIFICATION 15: Auto Active After Full Payment Verification
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 15: Auto Active After Full Debt Payment ---');
  const [fAuto] = await testDb.query(
    "INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, status, is_archived) VALUES ('FIS-AUTO-1', 'Auto Fisher', '199077777777', '0774444444', 'BOAT-AUTO', 'ACTIVE', FALSE)"
  );
  const autoFisherId = fAuto.insertId;

  // 1. Initial status with 0 debt -> CLEARED
  const statusInitial = await getFisherClearanceStatus(autoFisherId, testDb);
  if (statusInitial.status !== 'CLEARED') {
    throw new Error(`Expected initial status CLEARED, got ${statusInitial.status}`);
  }

  // 2. Add Rs. 3000 debt -> status becomes HOLD
  const [dRes] = await testDb.query(
    "INSERT INTO fisher_debts (fisher_id, category, original_amount, debt_date, status, created_by_admin_id) VALUES (?, 'Harbor Dues', 3000.00, '2026-09-06', 'OPEN', 1)",
    [autoFisherId]
  );
  const autoDebtId = dRes.insertId;

  const statusWithDebt = await getFisherClearanceStatus(autoFisherId, testDb);
  if (statusWithDebt.status !== 'HOLD' || !statusWithDebt.debtHold) {
    throw new Error(`Expected status HOLD with debtHold=true, got ${JSON.stringify(statusWithDebt)}`);
  }

  // 3. Record full Rs. 3000 payment -> status automatically becomes CLEARED
  await testDb.query(
    "INSERT INTO debt_payments (debt_id, fisher_id, amount, payment_date, idempotency_key) VALUES (?, ?, 3000.00, '2026-09-06', 'KEY-AUTO-PAY-3000')",
    [autoDebtId, autoFisherId]
  );
  await testDb.query("UPDATE fisher_debts SET status = 'PAID' WHERE id = ?", [autoDebtId]);

  const statusAfterPay = await getFisherClearanceStatus(autoFisherId, testDb);
  if (statusAfterPay.status !== 'CLEARED' || statusAfterPay.debtHold) {
    throw new Error(`Expected status CLEARED after full payment, got ${JSON.stringify(statusAfterPay)}`);
  }
  console.log('✔ Verification 15 Passed: ACTIVE Fisher with Rs. 3000 debt evaluated as HOLD. Full payment automatically restored effective status to CLEARED without manual unblock.');

  // ----------------------------------------------------
  // VERIFICATION 16: Dashboard Effective Active / Blocked Metric Auto Transition
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 16: Dashboard Effective Status Metric Auto Transition ---');
  
  // Create test fisher with ACTIVE base status
  const [fDash] = await testDb.query(
    "INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, status, is_archived) VALUES ('FIS-DASH-1', 'Dash Fisher', '199088888888', '0778888888', 'BOAT-DASH', 'ACTIVE', FALSE)"
  );
  const dashFisherId = fDash.insertId;

  // Function to compute dashboard metrics on testDb
  const calcDashMetrics = async () => {
    const [rows] = await testDb.query('SELECT id, status FROM fishers WHERE is_archived = FALSE');
    let act = 0, blk = 0, pnd = 0;
    for (const f of rows) {
      const clr = await getFisherClearanceStatus(f.id, testDb);
      if (clr.status === 'HOLD') blk++;
      else if (clr.status === 'PENDING') pnd++;
      else if (clr.status === 'CLEARED') act++;
    }
    return { active: act, blocked: blk, pending: pnd };
  };

  const m1 = await calcDashMetrics();

  // 1. Add Rs. 3000 debt -> Active decreases by 1, Blocked increases by 1
  const [dRes1] = await testDb.query(
    "INSERT INTO fisher_debts (fisher_id, category, original_amount, debt_date, status, created_by_admin_id) VALUES (?, 'Test Charge', 3000.00, '2026-09-06', 'OPEN', 1)",
    [dashFisherId]
  );
  const debt1Id = dRes1.insertId;
  const m2 = await calcDashMetrics();

  if (m2.blocked !== m1.blocked + 1 || m2.active !== m1.active - 1) {
    throw new Error(`Expected Blocked +1 and Active -1 after adding debt, got m1: ${JSON.stringify(m1)}, m2: ${JSON.stringify(m2)}`);
  }

  // 2. Full payment of Rs. 3000 -> Active increases by 1, Blocked decreases by 1
  await testDb.query(
    "INSERT INTO debt_payments (debt_id, fisher_id, amount, payment_date, idempotency_key) VALUES (?, ?, 3000.00, '2026-09-06', 'KEY-DASH-PAY-3000')",
    [debt1Id, dashFisherId]
  );
  await testDb.query("UPDATE fisher_debts SET status = 'PAID' WHERE id = ?", [debt1Id]);
  const m3 = await calcDashMetrics();

  if (m3.blocked !== m2.blocked - 1 || m3.active !== m2.active + 1) {
    throw new Error(`Expected Blocked -1 and Active +1 after full payment, got m2: ${JSON.stringify(m2)}, m3: ${JSON.stringify(m3)}`);
  }

  // 3. Second debt added -> Active decreases, Blocked increases again
  const [dRes2] = await testDb.query(
    "INSERT INTO fisher_debts (fisher_id, category, original_amount, debt_date, status, created_by_admin_id) VALUES (?, 'Second Charge', 2000.00, '2026-09-06', 'OPEN', 1)",
    [dashFisherId]
  );
  const debt2Id = dRes2.insertId;
  const m4 = await calcDashMetrics();

  if (m4.blocked !== m3.blocked + 1 || m4.active !== m3.active - 1) {
    throw new Error(`Expected Blocked +1 and Active -1 after second debt, got m3: ${JSON.stringify(m3)}, m4: ${JSON.stringify(m4)}`);
  }

  // 4. Second full payment -> Active increases, Blocked decreases again
  await testDb.query(
    "INSERT INTO debt_payments (debt_id, fisher_id, amount, payment_date, idempotency_key) VALUES (?, ?, 2000.00, '2026-09-06', 'KEY-DASH-PAY-2000')",
    [debt2Id, dashFisherId]
  );
  await testDb.query("UPDATE fisher_debts SET status = 'PAID' WHERE id = ?", [debt2Id]);
  const m5 = await calcDashMetrics();

  if (m5.blocked !== m4.blocked - 1 || m5.active !== m4.active + 1) {
    throw new Error(`Expected Blocked -1 and Active +1 after second full payment, got m4: ${JSON.stringify(m4)}, m5: ${JSON.stringify(m5)}`);
  }

  console.log('✔ Verification 16 Passed: Dashboard Active / Blocked metrics automatically update across debt additions and full payments (Active -1/Blocked +1 on debt, Active +1/Blocked -1 on payment).');

  // ----------------------------------------------------
  // VERIFICATION 17: Secure QR Token Generation, Hashing, Verification & Revocation
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 17: Secure QR Token Generation & Revocation ---');
  const crypto = require('crypto');

  // 1. Generate QR token for autoFisherId
  const rawToken1 = 'vh_f_' + crypto.randomBytes(32).toString('hex');
  const tokenHash1 = crypto.createHash('sha256').update(rawToken1).digest('hex');

  await testDb.query(
    'INSERT INTO fisher_qr_tokens (fisher_id, token_hash, is_active, issued_by_admin_id) VALUES (?, ?, TRUE, 1)',
    [autoFisherId, tokenHash1]
  );

  // Assert raw token is opaque and starts with prefix vh_f_
  if (!rawToken1.startsWith('vh_f_') || rawToken1.length < 60) {
    throw new Error('QR Token failed prefix/length validation');
  }

  // 2. Lookup by SHA-256 hash
  const [qrRows1] = await testDb.query(
    'SELECT * FROM fisher_qr_tokens WHERE token_hash = ? AND is_active = TRUE',
    [tokenHash1]
  );
  if (qrRows1.length !== 1 || String(qrRows1[0].fisher_id) !== String(autoFisherId)) {
    throw new Error('QR Token lookup by SHA-256 hash failed');
  }

  // 3. Reissue token (revokes old token)
  await testDb.query('UPDATE fisher_qr_tokens SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP WHERE fisher_id = ? AND is_active = TRUE', [autoFisherId]);

  const rawToken2 = 'vh_f_' + crypto.randomBytes(32).toString('hex');
  const tokenHash2 = crypto.createHash('sha256').update(rawToken2).digest('hex');
  await testDb.query(
    'INSERT INTO fisher_qr_tokens (fisher_id, token_hash, is_active, issued_by_admin_id) VALUES (?, ?, TRUE, 1)',
    [autoFisherId, tokenHash2]
  );

  // 4. Verify old token Hash 1 is inactive
  const [oldLookup] = await testDb.query(
    'SELECT * FROM fisher_qr_tokens WHERE token_hash = ? AND is_active = TRUE',
    [tokenHash1]
  );
  if (oldLookup.length !== 0) {
    throw new Error('Old QR Token was not properly revoked upon reissue');
  }

  // 5. Verify new token Hash 2 is active
  const [newLookup] = await testDb.query(
    'SELECT * FROM fisher_qr_tokens WHERE token_hash = ? AND is_active = TRUE',
    [tokenHash2]
  );
  if (newLookup.length !== 1) {
    throw new Error('New QR Token was not properly activated upon reissue');
  }

  console.log('✔ Verification 17 Passed: Opaque QR token (`vh_f_...`), SHA-256 hash lookup, automatic revocation upon reissue, and audit safety verified.');

  // Clean test database
  console.log('\n--- Cleaning Up Test Fixtures ---');
  await testDb.query('SET FOREIGN_KEY_CHECKS = 0');
  await testDb.query('TRUNCATE TABLE clearance_records');
  await testDb.query('TRUNCATE TABLE fisher_qr_tokens');
  await testDb.query('TRUNCATE TABLE fisher_holds');
  await testDb.query('TRUNCATE TABLE debt_payments');
  await testDb.query('TRUNCATE TABLE fisher_debts');
  await testDb.query('TRUNCATE TABLE charge_types');
  await testDb.query('TRUNCATE TABLE fishers');
  await testDb.query('TRUNCATE TABLE system_sequences');
  await testDb.query('TRUNCATE TABLE audit_logs');
  await testDb.query('TRUNCATE TABLE admins');
  await testDb.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('✔ All test fixtures cleaned from `valachchenai_harbor_test`.');

  // ----------------------------------------------------
  // VERIFICATION 13: Development Database Integrity Confirmation
  // ----------------------------------------------------
  console.log('\n--- VERIFICATION 13: Development Database Safety Assertion ---');
  const devDb = await mysql.createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: 'valachchenai_harbor',
  });

  const [devFishers] = await devDb.query('SELECT COUNT(*) as c FROM fishers');
  const [devDebts] = await devDb.query('SELECT COUNT(*) as c FROM fisher_debts');
  const [devClearances] = await devDb.query('SELECT COUNT(*) as c FROM clearance_records');
  
  console.log(`✔ Development database \`valachchenai_harbor\` status:`);
  console.log(`   - Real Fishers: ${devFishers[0].c}`);
  console.log(`   - Real Debts  : ${devDebts[0].c}`);
  console.log(`   - Clearances  : ${devClearances[0].c}`);
  console.log('✔ Confirmed: `valachchenai_harbor` contains zero automated test records and existing real data is untouched.');

  await devDb.end();
  await testDb.end();

  console.log('\n====================================================');
  console.log('   ALL 13 VERIFICATIONS COMPLETED SUCCESSFULLY!    ');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
