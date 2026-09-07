-- Additive SQL Migration for Installment Management Feature
-- Valachchenai Harbor Fisher Clearance Management System
-- Generated: 2026-09-07

CREATE TABLE IF NOT EXISTS `installment_plans` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `debt_id` BIGINT NOT NULL,
  `fisher_id` BIGINT NOT NULL,
  `starting_balance` DECIMAL(12,2) NOT NULL,
  `starting_payment_id` BIGINT NOT NULL DEFAULT 0,
  `monthly_amount` DECIMAL(12,2) NOT NULL,
  `first_due_date` DATE NOT NULL,
  `grace_days` INT NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `notes` TEXT NULL,
  `cancelled_at` DATETIME NULL,
  `cancelled_by_admin_id` INT NULL,
  `cancellation_reason` VARCHAR(500) NULL,
  `completed_at` DATETIME NULL,
  `created_by_admin_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_installment_plans_debt_id` (`debt_id`),
  KEY `idx_installment_plans_fisher_id` (`fisher_id`),
  KEY `idx_installment_plans_status` (`status`),
  KEY `idx_installment_plans_debt_status` (`debt_id`, `status`),
  KEY `idx_installment_plans_fisher_status` (`fisher_id`, `status`),
  KEY `fk_installment_plans_created_by` (`created_by_admin_id`),
  KEY `fk_installment_plans_cancelled_by` (`cancelled_by_admin_id`),
  CONSTRAINT `fk_installment_plans_debt` FOREIGN KEY (`debt_id`) REFERENCES `fisher_debts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_installment_plans_fisher` FOREIGN KEY (`fisher_id`) REFERENCES `fishers` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_installment_plans_created_by` FOREIGN KEY (`created_by_admin_id`) REFERENCES `admins` (`id`) ON UPDATE RESTRICT,
  CONSTRAINT `fk_installment_plans_cancelled_by` FOREIGN KEY (`cancelled_by_admin_id`) REFERENCES `admins` (`id`) ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `installment_dues` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `plan_id` BIGINT NOT NULL,
  `installment_number` INT NOT NULL,
  `due_date` DATE NOT NULL,
  `due_amount` DECIMAL(12,2) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_installment_dues_plan_id` (`plan_id`),
  KEY `idx_installment_dues_due_date` (`due_date`),
  KEY `idx_installment_dues_plan_due_date` (`plan_id`, `due_date`),
  UNIQUE KEY `idx_plan_installment_num` (`plan_id`, `installment_number`),
  CONSTRAINT `fk_installment_dues_plan` FOREIGN KEY (`plan_id`) REFERENCES `installment_plans` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
