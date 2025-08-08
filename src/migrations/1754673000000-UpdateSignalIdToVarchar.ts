import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateSignalIdToVarchar1754673000000 implements MigrationInterface {
    name = 'UpdateSignalIdToVarchar1754673000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`calls\` MODIFY COLUMN \`signalId\` VARCHAR(255) NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`calls\` MODIFY COLUMN \`signalId\` BIGINT NOT NULL`);
    }
}