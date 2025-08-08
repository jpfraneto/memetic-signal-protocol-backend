import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateCallModelWithUserRelation1754673000001
  implements MigrationInterface
{
  name = 'UpdateCallModelWithUserRelation1754673000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the primary key constraint on id
    await queryRunner.query(`ALTER TABLE \`calls\` DROP PRIMARY KEY`);

    // Make signalId the primary key
    await queryRunner.query(
      `ALTER TABLE \`calls\` ADD PRIMARY KEY (\`signalId\`)`,
    );

    // Remove columns that no longer exist
    await queryRunner.query(
      `ALTER TABLE \`calls\` DROP COLUMN \`blockNumber\``,
    );
    await queryRunner.query(`ALTER TABLE \`calls\` DROP COLUMN \`entryPrice\``);
    await queryRunner.query(`ALTER TABLE \`calls\` DROP COLUMN \`gasUsed\``);
    await queryRunner.query(`ALTER TABLE \`calls\` DROP COLUMN \`isActive\``);
    await queryRunner.query(`ALTER TABLE \`calls\` DROP COLUMN \`isWon\``);

    // Rename entryPrice to callPrice if it exists
    await queryRunner.query(
      `ALTER TABLE \`calls\` CHANGE \`entryPrice\` \`callPrice\` DECIMAL(18,8) NULL`,
    );

    // Add new columns
    await queryRunner.query(
      `ALTER TABLE \`calls\` ADD \`currentPrice\` DECIMAL(20,8) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calls\` ADD \`pnl\` DECIMAL(20,8) NULL`,
    );

    // Add foreign key constraint for user relationship
    await queryRunner.query(
      `ALTER TABLE \`calls\` ADD CONSTRAINT \`FK_calls_users\` FOREIGN KEY (\`fid\`) REFERENCES \`users\`(\`fid\`) ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign key constraint
    await queryRunner.query(
      `ALTER TABLE \`calls\` DROP FOREIGN KEY \`FK_calls_users\``,
    );

    // Remove new columns
    await queryRunner.query(
      `ALTER TABLE \`calls\` DROP COLUMN \`currentPrice\``,
    );
    await queryRunner.query(`ALTER TABLE \`calls\` DROP COLUMN \`pnl\``);

    // Rename callPrice back to entryPrice
    await queryRunner.query(
      `ALTER TABLE \`calls\` CHANGE \`callPrice\` \`entryPrice\` DECIMAL(18,8) NULL`,
    );

    // Add back removed columns
    await queryRunner.query(
      `ALTER TABLE \`calls\` ADD \`blockNumber\` INT NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`calls\` ADD \`gasUsed\` INT NULL`);
    await queryRunner.query(
      `ALTER TABLE \`calls\` ADD \`isActive\` BOOLEAN NOT NULL DEFAULT TRUE`,
    );
    await queryRunner.query(`ALTER TABLE \`calls\` ADD \`isWon\` BOOLEAN NULL`);

    // Drop the primary key constraint on signalId
    await queryRunner.query(`ALTER TABLE \`calls\` DROP PRIMARY KEY`);

    // Make id the primary key again
    await queryRunner.query(`ALTER TABLE \`calls\` ADD PRIMARY KEY (\`id\`)`);
  }
}
