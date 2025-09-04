import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateSignalIdToVarchar1754673000000
  implements MigrationInterface
{
  name = 'UpdateSignalIdToVarchar1754673000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('calls');
    if (hasTable) {
      await queryRunner.query(
        `ALTER TABLE "calls" ALTER COLUMN "signalId" TYPE VARCHAR(255)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('calls');
    if (hasTable) {
      await queryRunner.query(
        `ALTER TABLE "calls" ALTER COLUMN "signalId" TYPE BIGINT`,
      );
    }
  }
}
