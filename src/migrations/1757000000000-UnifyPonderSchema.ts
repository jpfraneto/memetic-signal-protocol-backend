import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifyPonderSchema1757000000000 implements MigrationInterface {
  name = 'UnifyPonderSchema1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Update signals table to match Ponder schema
    
    // Change direction from enum to boolean
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Add temporary boolean column
        ALTER TABLE "signals" ADD COLUMN "direction_temp" BOOLEAN;
        
        -- Convert enum values to boolean
        UPDATE "signals" SET "direction_temp" = 
          CASE 
            WHEN "direction"::TEXT = 'UP' OR "direction"::TEXT = 'up' THEN TRUE
            WHEN "direction"::TEXT = 'DOWN' OR "direction"::TEXT = 'down' THEN FALSE
            ELSE TRUE
          END;
        
        -- Drop the old enum column and rename temp column
        ALTER TABLE "signals" DROP COLUMN "direction";
        ALTER TABLE "signals" RENAME COLUMN "direction_temp" TO "direction";
        ALTER TABLE "signals" ALTER COLUMN "direction" SET NOT NULL;
      END $$;
    `);
    
    // Rename columns to match Ponder snake_case convention
    await queryRunner.query(`
      ALTER TABLE "signals" 
      RENAME COLUMN "blockNumber" TO "block_number"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "signals" 
      RENAME COLUMN "expiresAt" TO "expires_at"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "signals" 
      RENAME COLUMN "transactionHash" TO "transaction_hash"
    `);
    
    // Remove backend-specific columns that are not part of Ponder schema
    await queryRunner.query(`
      ALTER TABLE "signals" 
      DROP COLUMN IF EXISTS "source",
      DROP COLUMN IF EXISTS "wallet_address",
      DROP COLUMN IF EXISTS "clientFid"
    `);
    
    // Step 2: Create Ponder tables
    
    // Create fid_stats table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fid_stats" (
        "fid" INTEGER PRIMARY KEY,
        "total_signals" INTEGER NOT NULL DEFAULT 0,
        "active_signals" INTEGER NOT NULL DEFAULT 0,
        "won_signals" INTEGER NOT NULL DEFAULT 0,
        "lost_signals" INTEGER NOT NULL DEFAULT 0,
        "block_number" BIGINT NOT NULL,
        "transaction_hash" VARCHAR(66) NOT NULL
      )
    `);
    
    // Create wallet_authorizations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_authorizations" (
        "id" VARCHAR(66) PRIMARY KEY,
        "fid" INTEGER NOT NULL,
        "wallet" VARCHAR(42) NOT NULL,
        "block_number" BIGINT NOT NULL,
        "transaction_hash" VARCHAR(66) NOT NULL
      )
    `);
    
    // Create daily_signal_counts table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_signal_counts" (
        "id" VARCHAR(66) PRIMARY KEY,
        "fid" INTEGER NOT NULL,
        "day" DATE NOT NULL,
        "count" INTEGER NOT NULL,
        "block_number" BIGINT NOT NULL,
        "transaction_hash" VARCHAR(66) NOT NULL
      )
    `);
    
    // Create fid_bans table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fid_bans" (
        "id" VARCHAR(66) PRIMARY KEY,
        "fid" INTEGER NOT NULL,
        "banned" BOOLEAN NOT NULL,
        "block_number" BIGINT NOT NULL,
        "transaction_hash" VARCHAR(66) NOT NULL
      )
    `);
    
    // Create wallet_bans table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_bans" (
        "id" VARCHAR(66) PRIMARY KEY,
        "wallet" VARCHAR(42) NOT NULL,
        "banned" BOOLEAN NOT NULL,
        "block_number" BIGINT NOT NULL,
        "transaction_hash" VARCHAR(66) NOT NULL
      )
    `);
    
    // Step 3: Add indexes for performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_signals_fid" ON "signals" ("fid");
      CREATE INDEX IF NOT EXISTS "idx_signals_ca" ON "signals" ("ca");
      CREATE INDEX IF NOT EXISTS "idx_signals_status" ON "signals" ("status");
      CREATE INDEX IF NOT EXISTS "idx_signals_timestamp" ON "signals" ("timestamp");
      CREATE INDEX IF NOT EXISTS "idx_signals_expires_at" ON "signals" ("expires_at");
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_fid_stats_fid" ON "fid_stats" ("fid");
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_wallet_auth_fid" ON "wallet_authorizations" ("fid");
      CREATE INDEX IF NOT EXISTS "idx_wallet_auth_wallet" ON "wallet_authorizations" ("wallet");
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_daily_signals_fid" ON "daily_signal_counts" ("fid");
      CREATE INDEX IF NOT EXISTS "idx_daily_signals_day" ON "daily_signal_counts" ("day");
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_fid_bans_fid" ON "fid_bans" ("fid");
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_wallet_bans_wallet" ON "wallet_bans" ("wallet");
    `);
    
    // Step 4: Clean up old enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS "signal_direction_enum";
    `);
    
    console.log('Successfully unified database schema with Ponder');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This migration is designed to be one-way for production deployment
    // Reverting would require complex data migration back to enum
    throw new Error('This migration cannot be reverted. It unifies the schema with Ponder permanently.');
  }
}