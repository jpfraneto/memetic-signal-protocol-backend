import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifySignalModel1754673000004 implements MigrationInterface {
  name = 'SimplifySignalModel1754673000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns for simplified signal model
    // First create the enum type for PostgreSQL
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_direction_enum') THEN
          CREATE TYPE signal_direction_enum AS ENUM('UP', 'DOWN');
        END IF;
      END $$;
    `);
    
    await queryRunner.query(`
      ALTER TABLE "signals" 
      ADD COLUMN IF NOT EXISTS "tokenAddress" VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "tokenTicker" VARCHAR(50) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "initialMarketCap" VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "direction" signal_direction_enum NOT NULL DEFAULT 'UP'
    `);

    // Migrate existing data if needed (populate from tokens JSON if it exists)
    // Only do this if the tokens column actually exists
    const hasTokensColumn = await queryRunner.hasColumn('signals', 'tokens');
    if (hasTokensColumn) {
      await queryRunner.query(`
        UPDATE "signals" 
        SET 
          "tokenAddress" = COALESCE(("tokens"->0->>'ca')::VARCHAR, ''),
          "tokenTicker" = COALESCE(("tokens"->0->>'ticker')::VARCHAR, ''),
          "initialMarketCap" = COALESCE(("tokens"->0->>'mc')::VARCHAR, ''),
          "direction" = CASE 
            WHEN ("tokens"->0->>'direction') = 'UP' THEN 'UP'::signal_direction_enum
            WHEN ("tokens"->0->>'direction') = 'DOWN' THEN 'DOWN'::signal_direction_enum
            ELSE 'UP'::signal_direction_enum
          END
        WHERE "tokens" IS NOT NULL AND jsonb_array_length("tokens") > 0
      `);
    }

    // Remove old columns that are no longer needed
    await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN IF EXISTS "tokens"`);
    await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN IF EXISTS "metadata"`);
    await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN IF EXISTS "correctPredictions"`);

    // Remove default values after migration
    await queryRunner.query(`
      ALTER TABLE "signals" 
      ALTER COLUMN "tokenAddress" DROP DEFAULT,
      ALTER COLUMN "tokenTicker" DROP DEFAULT,
      ALTER COLUMN "initialMarketCap" DROP DEFAULT,
      ALTER COLUMN "direction" DROP DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back old columns
    await queryRunner.query(`
      ALTER TABLE "signals" 
      ADD COLUMN "tokens" JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN "metadata" JSONB,
      ADD COLUMN "correctPredictions" SMALLINT NOT NULL DEFAULT 0
    `);

    // Migrate data back to old format (best effort)
    await queryRunner.query(`
      UPDATE "signals" 
      SET "tokens" = jsonb_build_array(
        jsonb_build_object(
          'ca', "tokenAddress",
          'ticker', "tokenTicker",
          'mc', "initialMarketCap",
          'direction', "direction"::TEXT
        )
      )
      WHERE "tokenAddress" IS NOT NULL AND "tokenAddress" != ''
    `);

    // Remove new columns
    await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN IF EXISTS "direction"`);
    await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN IF EXISTS "initialMarketCap"`);
    await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN IF EXISTS "tokenTicker"`);
    await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN IF EXISTS "tokenAddress"`);
    
    // Drop the enum type
    await queryRunner.query(`DROP TYPE IF EXISTS signal_direction_enum`);
  }
}