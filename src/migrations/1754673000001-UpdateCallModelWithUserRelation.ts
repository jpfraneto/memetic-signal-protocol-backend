import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateCallModelWithUserRelation1754673000001
  implements MigrationInterface
{
  name = 'UpdateCallModelWithUserRelation1754673000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if calls table exists first
    const hasTable = await queryRunner.hasTable('calls');
    if (!hasTable) {
      return; // Skip if table doesn't exist
    }
    
    // Drop the primary key constraint on id (PostgreSQL syntax)
    await queryRunner.query(`ALTER TABLE "calls" DROP CONSTRAINT IF EXISTS "PK_calls"`);

    // Make signalId the primary key
    await queryRunner.query(
      `ALTER TABLE "calls" ADD CONSTRAINT "PK_calls_signalId" PRIMARY KEY ("signalId")`,
    );

    // Remove columns that no longer exist
    await queryRunner.query(
      `ALTER TABLE "calls" DROP COLUMN IF EXISTS "blockNumber"`,
    );
    await queryRunner.query(`ALTER TABLE "calls" DROP COLUMN IF EXISTS "entryPrice"`);
    await queryRunner.query(`ALTER TABLE "calls" DROP COLUMN IF EXISTS "gasUsed"`);
    await queryRunner.query(`ALTER TABLE "calls" DROP COLUMN IF EXISTS "isActive"`);
    await queryRunner.query(`ALTER TABLE "calls" DROP COLUMN IF EXISTS "isWon"`);

    // Rename entryPrice to callPrice if it exists (PostgreSQL syntax)
    const hasEntryPrice = await queryRunner.hasColumn('calls', 'entryPrice');
    if (hasEntryPrice) {
      await queryRunner.query(
        `ALTER TABLE "calls" RENAME COLUMN "entryPrice" TO "callPrice"`,
      );
    }

    // Add new columns
    await queryRunner.query(
      `ALTER TABLE "calls" ADD COLUMN "currentPrice" DECIMAL(20,8)`,
    );
    await queryRunner.query(
      `ALTER TABLE "calls" ADD COLUMN "pnl" DECIMAL(20,8)`,
    );

    // Add foreign key constraint for user relationship
    await queryRunner.query(
      `ALTER TABLE "calls" ADD CONSTRAINT "FK_calls_users" FOREIGN KEY ("fid") REFERENCES "users"("fid") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign key constraint
    await queryRunner.query(
      `ALTER TABLE "calls" DROP CONSTRAINT IF EXISTS "FK_calls_users"`,
    );

    // Remove new columns
    await queryRunner.query(
      `ALTER TABLE "calls" DROP COLUMN IF EXISTS "currentPrice"`,
    );
    await queryRunner.query(`ALTER TABLE "calls" DROP COLUMN IF EXISTS "pnl"`);

    // Rename callPrice back to entryPrice
    const hasCallPrice = await queryRunner.hasColumn('calls', 'callPrice');
    if (hasCallPrice) {
      await queryRunner.query(
        `ALTER TABLE "calls" RENAME COLUMN "callPrice" TO "entryPrice"`,
      );
    }

    // Add back removed columns
    await queryRunner.query(
      `ALTER TABLE "calls" ADD COLUMN "blockNumber" INTEGER NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "calls" ADD COLUMN "gasUsed" INTEGER`);
    await queryRunner.query(
      `ALTER TABLE "calls" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE`,
    );
    await queryRunner.query(`ALTER TABLE "calls" ADD COLUMN "isWon" BOOLEAN`);

    // Drop the primary key constraint on signalId
    await queryRunner.query(`ALTER TABLE "calls" DROP CONSTRAINT IF EXISTS "PK_calls_signalId"`);

    // Make id the primary key again
    await queryRunner.query(`ALTER TABLE "calls" ADD CONSTRAINT "PK_calls" PRIMARY KEY ("id")`);
  }
}
