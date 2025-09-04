import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateSignalModelForNewStructure1756645000000
  implements MigrationInterface
{
  name = 'UpdateSignalModelForNewStructure1756645000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns to signals table
    await queryRunner.query(`
      ALTER TABLE signals 
      ADD COLUMN IF NOT EXISTS "transactionHash" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "userAddress" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "timeframe" INTEGER,
      ADD COLUMN IF NOT EXISTS "timeframeHours" INTEGER,
      ADD COLUMN IF NOT EXISTS "blockNumber" BIGINT,
      ADD COLUMN IF NOT EXISTS "gasUsed" BIGINT,
      ADD COLUMN IF NOT EXISTS "metadata" JSONB
    `);

    // For PostgreSQL, we need to handle enum differently
    // First create the new enum type if it doesn't exist
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_direction_enum') THEN
          CREATE TYPE signal_direction_enum AS ENUM('UP', 'DOWN', 'up', 'down');
        END IF;
      END $$;
    `);
    
    // Update the column to use the new enum (if it exists)
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Check if the column exists and update it
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'signals' AND column_name = 'direction') THEN
          ALTER TABLE signals ALTER COLUMN direction TYPE signal_direction_enum 
          USING direction::text::signal_direction_enum;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove new columns
    await queryRunner.query(`
      ALTER TABLE signals 
      DROP COLUMN IF EXISTS "transactionHash",
      DROP COLUMN IF EXISTS "userAddress",
      DROP COLUMN IF EXISTS "timeframe",
      DROP COLUMN IF EXISTS "timeframeHours",
      DROP COLUMN IF EXISTS "blockNumber",
      DROP COLUMN IF EXISTS "gasUsed",
      DROP COLUMN IF EXISTS "metadata"
    `);

    // Revert direction enum
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signal_direction_enum_old') THEN
          ALTER TABLE signals ALTER COLUMN direction TYPE signal_direction_enum_old 
          USING direction::text::signal_direction_enum_old;
          DROP TYPE signal_direction_enum;
          ALTER TYPE signal_direction_enum_old RENAME TO signal_direction_enum;
        END IF;
      END $$;
    `);
  }
}
