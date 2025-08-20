import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionFieldsToUser1754673000003
  implements MigrationInterface
{
  name = 'AddSubscriptionFieldsToUser1754673000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`isSubscriber\` tinyint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`subscriptionExpiresAt\` timestamp NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`subscribedAt\` timestamp NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`subscribedAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`subscriptionExpiresAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`isSubscriber\``,
    );
  }
}
