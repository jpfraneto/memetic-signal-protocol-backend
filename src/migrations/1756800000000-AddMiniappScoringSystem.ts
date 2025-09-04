import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMiniappScoringSystem1756800000000 implements MigrationInterface {
  name = 'AddMiniappScoringSystem1756800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add totalScore and lastScoreUpdate to users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN "total_score" DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN "last_score_update" TIMESTAMP NULL
    `);

    // Create price_snapshots table for market cap tracking
    await queryRunner.query(`
      CREATE TABLE "price_snapshots" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "token_address" VARCHAR(42) NOT NULL,
        "market_cap" DECIMAL(20,8) NOT NULL,
        "price" DECIMAL(10,8) NOT NULL,
        "volume24h" DECIMAL(20,8) NULL,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "snapshot_at" TIMESTAMP NOT NULL
      )
    `);

    // Create indexes for price snapshots
    await queryRunner.query(`
      CREATE INDEX "idx_price_snapshot_token_time" ON "price_snapshots" ("token_address", "snapshot_at");
      CREATE INDEX "idx_price_snapshot_token" ON "price_snapshots" ("token_address");
      CREATE INDEX "idx_price_snapshot_time" ON "price_snapshots" ("snapshot_at");
    `);

    console.log('Successfully added miniapp scoring system tables and columns');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop price_snapshots table
    await queryRunner.query(`DROP TABLE IF EXISTS "price_snapshots"`);

    // Remove columns from users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      DROP COLUMN IF EXISTS "total_score",
      DROP COLUMN IF EXISTS "last_score_update"
    `);
  }
}