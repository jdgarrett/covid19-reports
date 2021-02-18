import { expect } from 'chai';
import FormData from 'form-data';
import { expectNoErrors } from '../../util/test-utils/expect';
import {
  seedOrgContact,
  seedOrgContactRoles,
} from '../../util/test-utils/seed';
import { TestRequest } from '../../util/test-utils/test-request';
import {
  uniqueEdipi,
  uniqueString,
} from '../../util/test-utils/unique';
import { Org } from '../org/org.model';
import { addUserToOrg } from '../org/org.model.mock';
import { seedRoleAdmin } from '../role/role.model.mock';
import { seedUnit } from '../unit/unit.model.mock';
import { User } from '../user/user.model';
import {
  seedUser,
  seedUserInternal,
} from '../user/user.model.mock';
import { CustomRosterColumn } from './custom-roster-column.model';
import { seedCustomRosterColumn } from './custom-roster-column.model.mock';
import { baseRosterColumns } from './roster-entity';
import {
  ChangeType,
  RosterHistory,
} from './roster-history.model';
import { Roster } from './roster.model';
import {
  mockRosterUploadCsv,
  seedRosterEntries,
  seedRosterEntry,
} from './roster.model.mock';
import { RosterColumnType } from './roster.types';

describe(`Roster Controller`, () => {

  const basePath = '/api/roster';
  let req: TestRequest;
  let org: Org;
  let contact: User;

  beforeEach(async () => {
    ({ org, contact } = await seedOrgContactRoles());
    req = new TestRequest(basePath);
    req.setUser(contact);
  });

  describe(`${basePath}/:orgId/column : get`, () => {

    it(`gets the org's roster column info`, async () => {
      const columnA = await seedCustomRosterColumn(org);
      const columnB = await seedCustomRosterColumn(org);

      const res = await req.get(`/${org.id}/column`);

      expectNoErrors(res);
      expect(res.data).to.be.array();
      expect(res.data).to.have.lengthOf(baseRosterColumns.length + 2);
      const dataColumnNames = res.data.map((x: CustomRosterColumn) => x.name);
      expect(dataColumnNames).to.include.members([columnA.name, columnB.name]);
    });

  });

  describe(`${basePath}/:orgId/column : post`, () => {

    it(`adds a custom roster column to the org`, async () => {
      const customColumnsCountBefore = await CustomRosterColumn.count({
        where: { org },
      });

      const body = {
        name: uniqueString(),
        displayName: uniqueString(),
        type: RosterColumnType.String,
        pii: true,
        phi: true,
        required: true,
        config: {
          stuff: uniqueString(),
        },
      };
      const res = await req.post(`/${org.id}/column`, body);

      expectNoErrors(res);
      expect(res.data.name).to.exist;
      const columnName = res.data.name;

      const columnAfter = (await CustomRosterColumn.findOne({
        name: columnName,
        org,
      }, {
        relations: ['org'],
      }))!;
      expect(columnAfter).to.exist;
      expect(columnAfter.org!.id).to.equal(org.id);
      expect(columnAfter).to.containSubset({
        name: body.name,
        display: body.displayName,
        type: body.type,
        pii: body.pii,
        phi: body.phi,
        required: body.required,
        config: body.config,
      });

      const customColumnsCountAfter = await CustomRosterColumn.count({
        where: { org },
      });
      expect(customColumnsCountAfter).to.equal(customColumnsCountBefore + 1);
    });

  });

  describe(`${basePath}/:orgId/column/:columnName : put`, () => {

    it(`updates the custom column`, async () => {
      const column = await seedCustomRosterColumn(org);

      const body = {
        displayName: uniqueString(),
        type: RosterColumnType.Boolean,
        pii: !column.pii,
        phi: !column.phi,
        required: !column.required,
        config: {
          stuff: uniqueString(),
        },
      };
      const res = await req.put(`/${org.id}/column/${column.name}`, body);

      expectNoErrors(res);
      expect(res.data.name).to.equal(column.name);

      const columnAfter = (await CustomRosterColumn.findOne({
        name: column.name,
        org,
      }))!;
      expect(columnAfter).to.containSubset({
        display: body.displayName,
        type: body.type,
        pii: body.pii,
        phi: body.phi,
        required: body.required,
        config: body.config,
      });
    });

  });

  describe(`${basePath}/:orgId/column/:columnName : delete`, () => {

    it(`deletes the column`, async () => {
      const column = await seedCustomRosterColumn(org);

      const columnBefore = await CustomRosterColumn.findOne({
        name: column.name,
        org,
      });
      expect(columnBefore).to.exist;

      const columnCountBefore = await CustomRosterColumn.count();

      const res = await req.delete(`/${org.id}/column/${column.name}`);

      expectNoErrors(res);

      const columnAfter = await CustomRosterColumn.findOne({
        name: column.name,
        org,
      });
      expect(columnAfter).not.to.exist;

      expect(await CustomRosterColumn.count()).to.equal(columnCountBefore - 1);
    });

  });

  describe(`${basePath}/info/:edipi : get`, () => {

    it(`gets an individual's roster infos`, async () => {
      const userInternal = await seedUserInternal();
      const unit = await seedUnit(org);
      const rosterEntry = await seedRosterEntry(unit);

      req.setUser(userInternal);
      const res = await req.get(`/info/${rosterEntry.edipi}?reportDate=2045-01-01`);

      expectNoErrors(res);
      expect(res.data.rosters).to.be.array();
      expect(res.data.rosters).to.have.lengthOf(1);
      expect(res.data.rosters[0]).to.have.keys([
        'unit',
        'columns',
      ]);
      expect(res.data.rosters[0].unit).to.have.keys([
        'id',
        'name',
        'musterConfiguration',
        'org',
      ]);
      expect(res.data.rosters[0].unit.org).to.have.keys([
        'defaultMusterConfiguration',
        'id',
        'name',
        'description',
        'indexPrefix',
        'reportingGroup',
      ]);
      expect(res.data.rosters[0].columns).to.be.array();
      expect(res.data.rosters[0].columns).to.have.lengthOf(baseRosterColumns.length);
      expect(res.data.rosters[0].columns[0]).to.have.keys([
        'name',
        'displayName',
        'type',
        'pii',
        'phi',
        'custom',
        'required',
        'updatable',
        'value',
      ]);
    });

  });

  describe(`${basePath}/:orgId/template : get`, () => {

    it(`gets the org's roster template`, async () => {
      const customColumn = await seedCustomRosterColumn(org);

      const res = await req.get(`/${org.id}/template`);

      expectNoErrors(res);
      expect(res.data).to.be.a('string');
      const csvHeaderParts = res.data.split('\n')[0].split(',');
      expect(csvHeaderParts).to.include('unit');
      expect(csvHeaderParts).to.include.members(baseRosterColumns.map(x => x.name));
      expect(csvHeaderParts).to.include(customColumn.name);
    });

  });

  describe(`${basePath}/:orgId/info : get`, () => {

    it(`gets the org's roster column info`, async () => {
      const customColumn = await seedCustomRosterColumn(org);

      const res = await req.get(`/${org.id}/info`);

      expectNoErrors(res);
      expect(res.data).to.be.array();
      const dataNames = res.data.map((x: CustomRosterColumn) => x.name);
      expect(dataNames).to.include.members(baseRosterColumns.map(x => x.name));
      expect(dataNames).to.include(customColumn.name);
    });

  });

  describe(`${basePath}/:orgId : get`, () => {

    it(`gets the org's roster`, async () => {
      const units = [
        await seedUnit(org),
        await seedUnit(org),
      ];
      const rosterEntries = [
        await seedRosterEntry(units[0]),
        await seedRosterEntry(units[0]),
        await seedRosterEntry(units[1]),
      ];

      const res = await req.get(`/${org.id}`);

      expectNoErrors(res);
      expect(res.data.rows).to.be.array();
      expect(res.data.rows).to.have.lengthOf(rosterEntries.length);
      expect(res.data.totalRowsCount).to.equal(rosterEntries.length);
      const dataIds = res.data.rows.map((x: Roster) => x.id);
      expect(dataIds).to.include.members(rosterEntries.map(x => x.id));
    });

  });

  describe(`${basePath}/:orgId/search : post`, () => {

    it(`returns the matching roster entries`, async () => {
      const units = [
        await seedUnit(org),
        await seedUnit(org),
      ];
      const rosterEntries = [
        await seedRosterEntry(units[0]),
        await seedRosterEntry(units[0]),
        await seedRosterEntry(units[1]),
      ];

      const res = await req.post(`/${org.id}/search`, {
        firstName: {
          op: '=',
          value: rosterEntries[1].firstName,
        },
      });

      expectNoErrors(res);
      expect(res.data.rows).to.be.array();
      expect(res.data.rows).to.have.lengthOf(1);
      expect(res.data.totalRowsCount).to.equal(1);
      expect(res.data.rows[0].edipi).to.equal(rosterEntries[1].edipi);
    });

  });

  describe(`${basePath}/:orgId : post`, () => {

    it(`adds a roster entry to the org`, async () => {
      const unit = await seedUnit(org);

      const rosterCountBefore = await Roster.count({
        where: {
          unit: unit.id,
        },
      });

      const rosterHistoryCountBefore = await RosterHistory.count({
        where: {
          unit: unit.id,
        },
      });

      const body = {
        edipi: uniqueEdipi(),
        firstName: uniqueString(),
        lastName: uniqueString(),
        unit: unit.id,
      };
      const res = await req.post(`/${org.id}`, body);

      expectNoErrors(res);
      expect(res.data.id).to.exist;

      const rosterEntryAfter = await Roster.findOne({
        where: {
          edipi: body.edipi,
          unit: unit.id,
        },
      });
      expect(rosterEntryAfter).to.exist;

      const rosterCountAfter = await Roster.count({
        where: {
          unit: unit.id,
        },
      });
      expect(rosterCountAfter).to.equal(rosterCountBefore + 1);

      const rosterHistoryAfter = (await RosterHistory.findOne({
        where: {
          unit: unit.id,
        },
        order: {
          timestamp: 'DESC',
        },
      }))!;
      expect(rosterHistoryAfter.edipi).to.equal(body.edipi);
      expect(rosterHistoryAfter.changeType).to.equal(ChangeType.Added);

      const rosterHistoryCountAfter = await RosterHistory.count({
        where: {
          unit: unit.id,
        },
      });
      expect(rosterHistoryCountAfter).to.equal(rosterHistoryCountBefore + 1);
    });

  });

  describe(`${basePath}/:orgId/bulk : post`, () => {

    it(`adds multiple roster entries with an uploaded csv`, async () => {
      const unit = await seedUnit(org);

      const rosterCountBefore = await Roster.count({
        where: {
          unit: unit.id,
        },
      });

      const rosterHistoryCountBefore = await RosterHistory.count({
        where: {
          unit: unit.id,
        },
      });

      const entriesToAdd = 3;
      const rosterCsv = await mockRosterUploadCsv({
        unit,
        rosterCount: entriesToAdd,
      });
      const formData = new FormData();
      formData.append('roster_csv', rosterCsv, 'roster.csv');

      const res = await req.post(`/${org.id}/bulk`, formData, {
        headers: formData.getHeaders(),
      });

      expectNoErrors(res);

      const rosterCountAfter = await Roster.count({
        where: {
          unit: unit.id,
        },
      });
      expect(rosterCountAfter).to.equal(rosterCountBefore + entriesToAdd);

      const rosterHistoryCountAfter = await RosterHistory.count({
        where: {
          unit: unit.id,
        },
      });
      expect(rosterHistoryCountAfter).to.equal(rosterHistoryCountBefore + entriesToAdd);
    });

  });

  describe(`${basePath}/:orgId/bulk : delete`, () => {

    it(`deletes all roster entries visible to the user in the org`, async () => {
      // Unit that should have its roster deleted.
      const unitToBeCleared = await seedUnit(org);
      const rosterEntriesToBeDeleted = await seedRosterEntries({
        unit: unitToBeCleared,
        count: 3,
      });

      // User who can only see the one unit.
      const user = await seedUser();
      const role = await seedRoleAdmin(org);
      await addUserToOrg(user, role, [unitToBeCleared], false);

      // Unit in same org, that should be untouched.
      const otherUnit = await seedUnit(org);
      await seedRosterEntries({
        unit: otherUnit,
        count: 2,
      });

      // Unit in other org, that should be untouched.
      const { org: otherOrg } = await seedOrgContact();
      const otherOrgUnit = await seedUnit(otherOrg);
      await seedRosterEntries({
        unit: otherOrgUnit,
        count: 2,
      });

      const rosterCountBefore = await Roster.count();

      const clearedRosterCountBefore = await Roster.count({
        where: { unit: unitToBeCleared.id },
      });

      const otherUnitRosterCountBefore = await Roster.count({
        where: { unit: otherUnit.id },
      });

      const otherOrgUnitRosterCountBefore = await Roster.count({
        where: { unit: otherOrgUnit.id },
      });

      req.setUser(user);
      const res = await req.delete(`/${org.id}/bulk`);

      expectNoErrors(res);

      const rosterCountAfter = await Roster.count();
      expect(rosterCountAfter).to.equal(rosterCountBefore - rosterEntriesToBeDeleted.length);

      const clearedRosterCountAfter = await Roster.count({
        where: { unit: unitToBeCleared.id },
      });
      expect(clearedRosterCountAfter).to.equal(clearedRosterCountBefore - rosterEntriesToBeDeleted.length);

      const otherUnitRosterCountAfter = await Roster.count({
        where: { unit: otherUnit.id },
      });
      expect(otherUnitRosterCountAfter).to.equal(otherUnitRosterCountBefore);

      const otherOrgUnitRosterCountAfter = await Roster.count({
        where: { unit: otherOrgUnit.id },
      });
      expect(otherOrgUnitRosterCountAfter).to.equal(otherOrgUnitRosterCountBefore);
    });

  });

  // TODO: '/:orgId/:rosterId' : get
  // TODO: '/:orgId/:rosterId' : delete
  // TODO: '/:orgId/:rosterId' : put

});
