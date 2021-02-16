import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultipleUnitSupport1613436966607 implements MigrationInterface {
  name = 'MultipleUnitSupport1613436966607';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_role" ADD "all_units" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`CREATE TABLE "user_role_unit" ("user_role" integer NOT NULL, "unit" integer NOT NULL, CONSTRAINT "PK_772b5914223d720d1aee4e3e7c8" PRIMARY KEY ("user_role", "unit"))`);
    await queryRunner.query(`CREATE INDEX "IDX_97020bc8ce123b5a4a27e73962" ON "user_role_unit" ("user_role") `);
    await queryRunner.query(`CREATE INDEX "IDX_b44564e0f78b5335fd9d6939f5" ON "user_role_unit" ("unit") `);

    await queryRunner.query(`ALTER TABLE "unit" ADD "new_id" SERIAL NOT NULL`);
    await queryRunner.query(`ALTER TABLE "roster_history" ADD "new_unit_id" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "roster" ADD "new_unit_id" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "roster" DISABLE TRIGGER roster_audit`);

    const orgs = await queryRunner.query(`SELECT id FROM "org"`);
    console.log(orgs);
    for (const org of orgs) {
      const orgUnits = await queryRunner.query(`SELECT id, new_id FROM unit WHERE org_id=${org.id}`) as { id: string, new_id: number }[];
      console.log(orgUnits);
      const orgRoles = await queryRunner.query(`SELECT user_role.id, index_prefix FROM user_role LEFT JOIN "role" ON role_id = "role"."id" WHERE "role".org_id = ${org.id}`) as { id: number, index_prefix: string }[];
      console.log(orgRoles);
      for (const role of orgRoles) {
        if (role.index_prefix === '*') {
          await queryRunner.query(`UPDATE user_role SET all_units=true WHERE id=${role.id}`);
        } else {
          // for each unit that matches index prefix, insert into user_role_unit table
          for (const unit of orgUnits) {
            if (matchWildcardString(unit.id, role.index_prefix)) {
              await queryRunner.query(`INSERT INTO user_role_unit (user_role, unit) VALUES (${role.id}, ${unit.new_id})`);
            }
          }
        }
      }
      for (const unit of orgUnits) {
        await queryRunner.query(`UPDATE roster SET new_unit_id=${unit.new_id} WHERE unit_id='${unit.id}' AND unit_org=${org.id}`);
        await queryRunner.query(`UPDATE roster_history SET new_unit_id=${unit.new_id} WHERE unit_id='${unit.id}' AND unit_org=${org.id}`);
      }
    }

    await queryRunner.query(`ALTER TABLE "user_role" DROP COLUMN "index_prefix"`);
    await queryRunner.query(`ALTER TABLE "roster" DROP CONSTRAINT "FK_b12544f980cb8f403bc514a2ab5"`);
    await queryRunner.query(`ALTER TABLE "roster_history" DROP CONSTRAINT "FK_34e597fefbd4b9d5600513023fd"`);

    await queryRunner.query(`ALTER TABLE "unit" DROP CONSTRAINT "PK_a01b525274c7f20afb31a742d47"`);
    await queryRunner.query(`ALTER TABLE "unit" DROP COLUMN "id"`);
    await queryRunner.query(`ALTER TABLE "unit" RENAME "new_id" TO "id"`);
    await queryRunner.query(`ALTER TABLE "unit" ADD CONSTRAINT "PK_a01b525274c7f20afb31a742d47" PRIMARY KEY ("id")`);

    await queryRunner.query(`ALTER TABLE "roster_history" ALTER COLUMN "new_unit_id" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "roster_history" DROP COLUMN "unit_id"`);
    await queryRunner.query(`ALTER TABLE "roster_history" DROP COLUMN "unit_org"`);
    await queryRunner.query(`ALTER TABLE "roster_history" RENAME "new_unit_id" TO "unit_id"`);

    await queryRunner.query(`ALTER TABLE "roster" ALTER COLUMN "new_unit_id" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "roster" DROP CONSTRAINT "UQ_ce01434bd61ca4cdb9527b8f1fa"`);
    await queryRunner.query(`ALTER TABLE "roster" DROP COLUMN "unit_id"`);
    await queryRunner.query(`ALTER TABLE "roster" DROP COLUMN "unit_org"`);
    await queryRunner.query(`ALTER TABLE "roster" RENAME "new_unit_id" TO "unit_id"`);
    await queryRunner.query(`ALTER TABLE "roster" ADD CONSTRAINT "UQ_ce01434bd61ca4cdb9527b8f1fa" UNIQUE ("edipi", "unit_id")`);
    await queryRunner.query(`ALTER TABLE "roster" ENABLE TRIGGER roster_audit`);

    await queryRunner.query(`ALTER TABLE "roster_history" ADD CONSTRAINT "FK_34e597fefbd4b9d5600513023fd" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "roster" ADD CONSTRAINT "FK_b12544f980cb8f403bc514a2ab5" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "user_role_unit" ADD CONSTRAINT "FK_97020bc8ce123b5a4a27e739629" FOREIGN KEY ("user_role") REFERENCES "user_role"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "user_role_unit" ADD CONSTRAINT "FK_b44564e0f78b5335fd9d6939f55" FOREIGN KEY ("unit") REFERENCES "unit"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`CREATE TABLE "query-result-cache" ("id" SERIAL NOT NULL, "identifier" character varying, "time" bigint NOT NULL, "duration" integer NOT NULL, "query" text NOT NULL, "result" text NOT NULL, CONSTRAINT "PK_6a98f758d8bfd010e7e10ffd3d3" PRIMARY KEY ("id"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "query-result-cache"`);
    await queryRunner.query(`ALTER TABLE "user_role_unit" DROP CONSTRAINT "FK_b44564e0f78b5335fd9d6939f55"`);
    await queryRunner.query(`ALTER TABLE "user_role_unit" DROP CONSTRAINT "FK_97020bc8ce123b5a4a27e739629"`);
    await queryRunner.query(`ALTER TABLE "roster" DROP CONSTRAINT "FK_b12544f980cb8f403bc514a2ab5"`);
    await queryRunner.query(`ALTER TABLE "roster_history" DROP CONSTRAINT "FK_34e597fefbd4b9d5600513023fd"`);
    await queryRunner.query(`ALTER TABLE "roster" DROP CONSTRAINT "UQ_ce01434bd61ca4cdb9527b8f1fa"`);
    await queryRunner.query(`ALTER TABLE "user_notification_setting" ALTER COLUMN "last_notified_date" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "roster" DROP COLUMN "unit_id"`);
    await queryRunner.query(`ALTER TABLE "roster" ADD "unit_id" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "roster" ADD CONSTRAINT "UQ_ce01434bd61ca4cdb9527b8f1fa" UNIQUE ("edipi", "unit_id", "unit_org")`);
    await queryRunner.query(`ALTER TABLE "roster_history" DROP COLUMN "unit_id"`);
    await queryRunner.query(`ALTER TABLE "roster_history" ADD "unit_id" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "user_role" DROP COLUMN "all_units"`);
    await queryRunner.query(`ALTER TABLE "user_role" ADD "all_units" character varying NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "unit" DROP CONSTRAINT "PK_a01b525274c7f20afb31a742d47"`);
    await queryRunner.query(`ALTER TABLE "unit" ADD CONSTRAINT "PK_c6c0d1d31080b7f603d960238f1" PRIMARY KEY ("org_id")`);
    await queryRunner.query(`ALTER TABLE "unit" DROP COLUMN "id"`);
    await queryRunner.query(`ALTER TABLE "unit" ADD "id" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "unit" DROP CONSTRAINT "PK_c6c0d1d31080b7f603d960238f1"`);
    await queryRunner.query(`ALTER TABLE "unit" ADD CONSTRAINT "PK_a01b525274c7f20afb31a742d47" PRIMARY KEY ("org_id", "id")`);
    await queryRunner.query(`ALTER TABLE "roster_history" ADD CONSTRAINT "FK_34e597fefbd4b9d5600513023fd" FOREIGN KEY ("unit_org", "unit_id") REFERENCES "unit"("org_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "roster" ADD CONSTRAINT "FK_b12544f980cb8f403bc514a2ab5" FOREIGN KEY ("unit_org", "unit_id") REFERENCES "unit"("org_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`DROP INDEX "IDX_b44564e0f78b5335fd9d6939f5"`);
    await queryRunner.query(`DROP INDEX "IDX_97020bc8ce123b5a4a27e73962"`);
    await queryRunner.query(`DROP TABLE "user_role_unit"`);
    await queryRunner.query(`ALTER TABLE "user_role" RENAME COLUMN "all_units" TO "index_prefix"`);
  }

}

function matchWildcardString(str: string, pattern: string) {
  const escapeRegex = (part: string) => part.replace(/([.*+?^=!:${}()|[]\/\\])/g, '\\$1');
  return new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`).test(str);
}
