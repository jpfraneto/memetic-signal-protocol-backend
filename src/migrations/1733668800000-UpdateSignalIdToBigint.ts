import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateSignalIdToBigint1733668800000 implements MigrationInterface {
  name = 'UpdateSignalIdToBigint1733668800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`calls\` MODIFY COLUMN \`signalId\` BIGINT NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`calls\` MODIFY COLUMN \`signalId\` INT NOT NULL`,
    );
  }
}
