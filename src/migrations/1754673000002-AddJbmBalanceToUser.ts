import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJbmBalanceToUser1754673000002 implements MigrationInterface {
  name = 'AddJbmBalanceToUser1754673000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`jbmBalance\` decimal(65,0) NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`jbmBalance\``);
  }
}
