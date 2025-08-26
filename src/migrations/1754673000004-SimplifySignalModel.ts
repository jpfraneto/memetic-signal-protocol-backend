import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifySignalModel1754673000004 implements MigrationInterface {
  name = 'SimplifySignalModel1754673000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns for simplified signal model
    await queryRunner.query(`
      ALTER TABLE \`signals\` 
      ADD COLUMN \`tokenAddress\` varchar(255) NOT NULL DEFAULT '',
      ADD COLUMN \`tokenTicker\` varchar(50) NOT NULL DEFAULT '',
      ADD COLUMN \`initialMarketCap\` varchar(255) NOT NULL DEFAULT '',
      ADD COLUMN \`direction\` enum('UP', 'DOWN') NOT NULL DEFAULT 'UP'
    `);

    // Migrate existing data if needed (populate from tokens JSON if it exists)
    await queryRunner.query(`
      UPDATE \`signals\` 
      SET 
        \`tokenAddress\` = JSON_UNQUOTE(JSON_EXTRACT(\`tokens\`, '$[0].ca')),
        \`tokenTicker\` = JSON_UNQUOTE(JSON_EXTRACT(\`tokens\`, '$[0].ticker')),
        \`initialMarketCap\` = JSON_UNQUOTE(JSON_EXTRACT(\`tokens\`, '$[0].mc')),
        \`direction\` = JSON_UNQUOTE(JSON_EXTRACT(\`tokens\`, '$[0].direction'))
      WHERE JSON_LENGTH(\`tokens\`) > 0
    `);

    // Remove old columns that are no longer needed
    await queryRunner.query(`ALTER TABLE \`signals\` DROP COLUMN \`tokens\``);
    await queryRunner.query(`ALTER TABLE \`signals\` DROP COLUMN \`metadata\``);
    await queryRunner.query(`ALTER TABLE \`signals\` DROP COLUMN \`correctPredictions\``);

    // Remove default values after migration
    await queryRunner.query(`
      ALTER TABLE \`signals\` 
      ALTER COLUMN \`tokenAddress\` DROP DEFAULT,
      ALTER COLUMN \`tokenTicker\` DROP DEFAULT,
      ALTER COLUMN \`initialMarketCap\` DROP DEFAULT,
      ALTER COLUMN \`direction\` DROP DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back old columns
    await queryRunner.query(`
      ALTER TABLE \`signals\` 
      ADD COLUMN \`tokens\` json NOT NULL,
      ADD COLUMN \`metadata\` json NULL,
      ADD COLUMN \`correctPredictions\` tinyint NOT NULL DEFAULT 0
    `);

    // Migrate data back to old format (best effort)
    await queryRunner.query(`
      UPDATE \`signals\` 
      SET \`tokens\` = JSON_ARRAY(
        JSON_OBJECT(
          'ca', \`tokenAddress\`,
          'ticker', \`tokenTicker\`,
          'mc', \`initialMarketCap\`,
          'direction', \`direction\`
        )
      )
      WHERE \`tokenAddress\` IS NOT NULL AND \`tokenAddress\` != ''
    `);

    // Remove new columns
    await queryRunner.query(`ALTER TABLE \`signals\` DROP COLUMN \`direction\``);
    await queryRunner.query(`ALTER TABLE \`signals\` DROP COLUMN \`initialMarketCap\``);
    await queryRunner.query(`ALTER TABLE \`signals\` DROP COLUMN \`tokenTicker\``);
    await queryRunner.query(`ALTER TABLE \`signals\` DROP COLUMN \`tokenAddress\``);
  }
}