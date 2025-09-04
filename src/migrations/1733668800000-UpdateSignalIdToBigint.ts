import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateSignalIdToBigint1733668800000 implements MigrationInterface {
  name = 'UpdateSignalIdToBigint1733668800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if calls table exists first
    const hasTable = await queryRunner.hasTable('calls');
    if (hasTable) {
      await queryRunner.query(
        `ALTER TABLE "calls" ALTER COLUMN "signalId" TYPE BIGINT`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('calls');
    if (hasTable) {
      await queryRunner.query(
        `ALTER TABLE "calls" ALTER COLUMN "signalId" TYPE INTEGER`,
      );
    }
  }
}
