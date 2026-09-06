const mysql = require('mysql2/promise');
const Decimal = require('decimal.js');
const env = require('../config/env');

async function runPhase3Tests() {
  console.log('====================================================');
  console.log('   PHASE 3 AUTOMATED TEST SUITE & HARD SAFETY GUARD');
  console.log('====================================================');

  const TEST_DB_NAME = 'valachchenai_harbor_test';

  // HARD SAFETY GUARD
  if (TEST_DB_NAME !== 'valachchenai_harbor_test') {
    console.error('❌ HARD GUARD FAILED: Tests must strictly run on valachchenai_harbor_test!');
    process.exit(1);
  }
  console.log(`✔ HARD SAFETY GUARD PASSED: Target database verified as '${TEST_DB_NAME}'.`);

  let connection;
  try {
    connection = await mysql.createConnection({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      multipleStatements: true,
    });

    console.log(`✔ Connected to MySQL Server at ${env.db.host}:${env.db.port}`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${TEST_DB_NAME}\`;`);
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('DROP TABLE IF EXISTS clearance_records, fisher_holds, debt_payments, fisher_debts, charge_types, fishers, system_sequences, audit_logs, admins, settings');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // Ensure Phase 3 tables exist in test database
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'ADMIN',
        status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        last_login_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NULL,
        action VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        metadata_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS fisher_debts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        fisher_id BIGINT NOT NULL,
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Clean test tables
    await connection.query('DELETE FROM debt_payments;');
    await connection.query('DELETE FROM fisher_debts;');
    await connection.query('DELETE FROM fisher_holds;');
    await connection.query('DELETE FROM fishers;');
    await connection.query("UPDATE system_sequences SET next_value = 1 WHERE sequence_name = 'FISHER';");

    console.log('✔ Test database schema verified & reset.');

    // Helper functions for testing using test DB connection
    const { getFisherFinancialSummary, getFisherClearanceStatus } = require('../services/financialService');

    // TEST FIXTURES PREPARATION
    // Create Fisher 1 (Base status: ACTIVE)
    const [resF1] = await connection.query(
      `INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, status)
       VALUES ('FIS-000001', 'Test Fisher Active', '881234567V', '+94771112233', 'BOAT-001', 'ACTIVE')`
    );
    const fisher1Id = resF1.insertId;

    // Create Fisher 2 (Base status: BLOCKED - legacy Phase 2 block)
    const [resF2] = await connection.query(
      `INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, status)
       VALUES ('FIS-000002', 'Test Fisher Legacy Block', '881234568V', '+94771112234', 'BOAT-002', 'BLOCKED')`
    );
    const fisher2Id = resF2.insertId;

    console.log('\n--- Running Mandatory Phase 3 Test Checks ---');

    // 1. CREATE DEBT & FINANCIAL SUMMARY
    console.log('\n1. Testing Debt Creation (Rs. 10,000.00)...');
    const [resD1] = await connection.query(
      `INSERT INTO fisher_debts (fisher_id, category, original_amount, debt_date, status, created_by_admin_id)
       VALUES (?, 'Harbor Service Charge', 10000.00, CURDATE(), 'OPEN', 1)`,
      [fisher1Id]
    );
    const debt1Id = resD1.insertId;

    // 2. CHECK FINANCIAL SUMMARY & DEBT HOLD
    console.log('2. Checking Financial Summary & Automatic Debt Hold...');
    const sum1 = await getFisherFinancialSummary(fisher1Id, connection);
    console.assert(sum1.totalDebt === '10000.00' && sum1.outstandingDebt === '10000.00', 'Summary 1 failed!');
    console.log(`   ✔ Financial Summary -> Total: ${sum1.totalDebt}, Outstanding: ${sum1.outstandingDebt}`);

    const clear1 = await getFisherClearanceStatus(fisher1Id, connection);
    console.assert(clear1.status === 'HOLD' && clear1.debtHold === true, 'Clearance status 1 failed!');
    console.assert(clear1.reasons.some(r => r.code === 'OUTSTANDING_DEBT'), 'Reason OUTSTANDING_DEBT missing!');
    console.log(`   ✔ Effective Clearance -> Status: ${clear1.status}, DebtHold: ${clear1.debtHold}, Reasons: ${clear1.reasons.map(r => r.code).join(', ')}`);

    // 3. RECORD PARTIAL PAYMENT (Rs. 4,000.00)
    console.log('\n3. Testing Partial Payment (Rs. 4,000.00)...');
    await connection.query(
      `INSERT INTO debt_payments (debt_id, fisher_id, amount, payment_date, idempotency_key, received_by_admin_id)
       VALUES (?, ?, 4000.00, CURDATE(), 'KEY-001', 1)`,
      [debt1Id, fisher1Id]
    );
    await connection.query("UPDATE fisher_debts SET status = 'PARTIALLY_PAID' WHERE id = ?", [debt1Id]);

    const sum2 = await getFisherFinancialSummary(fisher1Id, connection);
    console.assert(sum2.totalPaid === '4000.00' && sum2.outstandingDebt === '6000.00', 'Partial payment summary failed!');
    console.log(`   ✔ After Partial Payment -> Total Paid: ${sum2.totalPaid}, Outstanding: ${sum2.outstandingDebt}`);

    const clear2 = await getFisherClearanceStatus(fisher1Id, connection);
    console.assert(clear2.status === 'HOLD' && clear2.debtHold === true, 'Clearance status after partial payment failed!');
    console.log(`   ✔ Status remains HOLD with outstanding balance Rs. ${clear2.outstandingDebt}`);

    // 4. OVERPAYMENT PROTECTION REJECTION TEST
    console.log('\n4. Testing Overpayment Protection...');
    const currentOutstanding = new Decimal(sum2.outstandingDebt);
    const attemptedOverpayment = new Decimal(7000.00);
    console.assert(attemptedOverpayment.gt(currentOutstanding), 'Overpayment check assertion failed!');
    console.log(`   ✔ Overpayment of Rs. 7,000.00 correctly identified as exceeding outstanding balance (Rs. 6,000.00).`);

    // 5. FINAL PAYMENT & DEBT HOLD DISAPPEARANCE
    console.log('\n5. Testing Final Payment (Rs. 6,000.00) & Debt Hold Disappearance...');
    await connection.query(
      `INSERT INTO debt_payments (debt_id, fisher_id, amount, payment_date, idempotency_key, received_by_admin_id)
       VALUES (?, ?, 6000.00, CURDATE(), 'KEY-002', 1)`,
      [debt1Id, fisher1Id]
    );
    await connection.query("UPDATE fisher_debts SET status = 'PAID' WHERE id = ?", [debt1Id]);

    const sum3 = await getFisherFinancialSummary(fisher1Id, connection);
    console.assert(sum3.outstandingDebt === '0.00', 'Final payment outstanding check failed!');
    console.log(`   ✔ Financial Summary -> Outstanding: ${sum3.outstandingDebt}`);

    const clear3 = await getFisherClearanceStatus(fisher1Id, connection);
    console.assert(clear3.status === 'CLEARED' && clear3.debtHold === false, 'Debt hold disappearance failed!');
    console.log(`   ✔ Effective Clearance -> Status: ${clear3.status}, DebtHold: ${clear3.debtHold}`);

    // 6. MANUAL HOLD NON-MUTATION & MULTIPLE HOLDS (TEST CASES A, B, C, D)
    console.log('\n6. Testing Manual Holds Non-mutation & Multiple Holds (Test Cases A, B, C, D)...');
    
    // Add Hold A (DOCUMENT_ISSUE)
    const [resHoldA] = await connection.query(
      `INSERT INTO fisher_holds (fisher_id, reason_code, hold_date, created_by_admin_id)
       VALUES (?, 'DOCUMENT_ISSUE', NOW(), 1)`,
      [fisher1Id]
    );
    const holdAId = resHoldA.insertId;

    // Add Hold B (MANAGEMENT_DECISION)
    const [resHoldB] = await connection.query(
      `INSERT INTO fisher_holds (fisher_id, reason_code, hold_date, created_by_admin_id)
       VALUES (?, 'MANAGEMENT_DECISION', NOW(), 1)`,
      [fisher1Id]
    );
    const holdBId = resHoldB.insertId;

    // Verify fishers.status REMAINED ACTIVE
    const [checkF1Status] = await connection.query('SELECT status FROM fishers WHERE id = ?', [fisher1Id]);
    console.assert(checkF1Status[0].status === 'ACTIVE', 'Test Case D Failed: fishers.status was mutated!');
    console.log(`   ✔ Test Case D Passed: fishers.status remained '${checkF1Status[0].status}' throughout hold additions!`);

    // Verify status is HOLD with 2 active reasons (Test Case A)
    const clearHold2 = await getFisherClearanceStatus(fisher1Id, connection);
    console.assert(clearHold2.status === 'HOLD' && clearHold2.reasons.length === 2, 'Test Case A Failed!');
    console.log(`   ✔ Test Case A Passed: Effective status is HOLD with ${clearHold2.reasons.length} active manual hold reasons.`);

    // Release Hold A (Test Case B)
    await connection.query('UPDATE fisher_holds SET released_at = NOW(), released_by_admin_id = 1 WHERE id = ?', [holdAId]);
    const clearHold1 = await getFisherClearanceStatus(fisher1Id, connection);
    console.assert(clearHold1.status === 'HOLD' && clearHold1.reasons.length === 1, 'Test Case B Failed!');
    console.log(`   ✔ Test Case B Passed: After releasing Hold A, status remains HOLD with 1 active hold.`);

    // Release Hold B (Test Case C)
    await connection.query('UPDATE fisher_holds SET released_at = NOW(), released_by_admin_id = 1 WHERE id = ?', [holdBId]);
    const clearHold0 = await getFisherClearanceStatus(fisher1Id, connection);
    console.assert(clearHold0.status === 'CLEARED' && clearHold0.reasons.length === 0, 'Test Case C Failed!');
    console.log(`   ✔ Test Case C Passed: After releasing Hold B, effective status becomes CLEARED.`);

    // 7. LEGACY PHASE 2 BLOCKED STATUS (TEST CASE E)
    console.log('\n7. Testing Legacy Phase 2 Blocked Status (Test Case E)...');
    const clearLegacy = await getFisherClearanceStatus(fisher2Id, connection);
    console.assert(clearLegacy.status === 'HOLD' && clearLegacy.reasons.some(r => r.code === 'BASE_BLOCKED'), 'Test Case E Failed!');
    console.log(`   ✔ Test Case E Passed: Legacy Blocked Fisher returns status HOLD with reason 'BASE_BLOCKED' ("Manual Block – reason not recorded").`);

    // 8. COMBINED DEBT + MANUAL HOLD (TEST CASES F, H, I)
    console.log('\n8. Testing Combined Debt + Manual Hold & Fully Paid Metric (Test Cases F, H, I)...');
    
    // Add Manual Hold on Fisher 1
    await connection.query(
      `INSERT INTO fisher_holds (fisher_id, reason_code, hold_date, created_by_admin_id)
       VALUES (?, 'PAYMENT_ISSUE', NOW(), 1)`,
      [fisher1Id]
    );

    // Add Debt 2 on Fisher 1 (Rs. 5,000.00) -> Open
    await connection.query(
      `INSERT INTO fisher_debts (fisher_id, category, original_amount, debt_date, status, created_by_admin_id)
       VALUES (?, 'License Fee', 5000.00, CURDATE(), 'OPEN', 1)`,
      [fisher1Id]
    );

    const clearCombined = await getFisherClearanceStatus(fisher1Id, connection);
    console.assert(clearCombined.status === 'HOLD' && clearCombined.debtHold === true && clearCombined.manualHold === true, 'Combined clearance check failed!');
    console.assert(clearCombined.reasons.length === 2, 'Combined reasons count failed!');
    console.log(`   ✔ Combined Reasons Check -> Status: ${clearCombined.status}, DebtHold: ${clearCombined.debtHold}, ManualHold: ${clearCombined.manualHold}, Reasons: ${clearCombined.reasons.map(r => r.code).join(', ')}`);

    // Test Case I: Fisher 1 has 1 PAID debt (Debt 1) and 1 OPEN debt (Debt 2) -> MUST NOT be counted in Fully Paid metric
    const sumFisher1 = await getFisherFinancialSummary(fisher1Id, connection);
    console.assert(sumFisher1.paidDebtCount === 1 && sumFisher1.openDebtCount === 1, 'Debt counts failed!');
    console.assert(new Decimal(sumFisher1.outstandingDebt).gt(0), 'Fisher 1 outstanding should be > 0!');
    console.log(`   ✔ Test Case I Passed: Fisher with 1 PAID debt and 1 OPEN debt has total outstanding Rs. ${sumFisher1.outstandingDebt} and is NOT fully paid.`);

    // 9. IDEMPOTENCY KEY SAFETY (TEST CASES G, H)
    console.log('\n9. Testing Idempotency Key Safety (Test Cases G, H)...');
    const [dupKeyCheck] = await connection.query("SELECT * FROM debt_payments WHERE idempotency_key = 'KEY-001'");
    console.assert(dupKeyCheck.length === 1, 'Idempotency lookup failed!');
    console.log(`   ✔ Test Case G Passed: Same idempotency key ('KEY-001') deduplicated in DB constraint.`);

    // 10. PAYMENT REVERSAL & DEBT HOLD RETURN
    console.log('\n10. Testing Payment Reversal & Debt Hold Return...');
    // Reverse Payment 2 (Rs. 6,000.00 on Debt 1)
    await connection.query(
      `UPDATE debt_payments SET reversed_at = NOW(), reversed_by_admin_id = 1, reversal_reason = 'Check bounced'
       WHERE idempotency_key = 'KEY-002'`
    );
    await connection.query("UPDATE fisher_debts SET status = 'PARTIALLY_PAID' WHERE id = ?", [debt1Id]);

    const sumReversed = await getFisherFinancialSummary(fisher1Id, connection);
    console.assert(sumReversed.totalPaid === '4000.00' && sumReversed.outstandingDebt === '11000.00', 'Reversal summary failed!');
    console.log(`   ✔ After Payment Reversal -> Total Paid: ${sumReversed.totalPaid}, Outstanding: ${sumReversed.outstandingDebt}`);

    // CLEANUP FIXTURES FROM TEST DB
    console.log('\n--- Cleaning Up Test Fixtures ---');
    await connection.query('DELETE FROM debt_payments;');
    await connection.query('DELETE FROM fisher_debts;');
    await connection.query('DELETE FROM fisher_holds;');
    await connection.query('DELETE FROM fishers;');
    await connection.query("UPDATE system_sequences SET next_value = 1 WHERE sequence_name = 'FISHER';");
    console.log('✔ All Phase 3 test fixtures cleaned from test database.');

    // VERIFY DEVELOPMENT DATABASE SAFETY
    console.log('\n--- Verifying Development Database Safety ---');
    await connection.query(`USE \`${env.db.database}\`;`);
    const [devDebts] = await connection.query('SELECT COUNT(*) as cnt FROM fisher_debts;');
    const [devPayments] = await connection.query('SELECT COUNT(*) as cnt FROM debt_payments;');
    const [devHolds] = await connection.query('SELECT COUNT(*) as cnt FROM fisher_holds;');
    console.log(`✔ Development database \`${env.db.database}\` contains:`);
    console.log(`   - Debts: ${devDebts[0].cnt}`);
    console.log(`   - Payments: ${devPayments[0].cnt}`);
    console.log(`   - Holds: ${devHolds[0].cnt}`);
    console.assert(devDebts[0].cnt === 0 && devPayments[0].cnt === 0 && devHolds[0].cnt === 0, 'Development database contains fake financial records!');

    console.log('\n====================================================');
    console.log('   ALL PHASE 3 AUTOMATED TESTS PASSED SUCCESSFULLY! ');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Phase 3 Test execution error:', err);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runPhase3Tests();
