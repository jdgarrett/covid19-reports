import { getManager, EntityManager } from 'typeorm';
import database from '.';
import { Org } from '../api/org/org.model';
import { Role } from '../api/role/role.model';
import { RosterColumnType } from '../api/roster/roster.types';
import { User } from '../api/user/user.model';
import { Workspace } from '../api/workspace/workspace.model';
import { Roster } from '../api/roster/roster.model';
import { CustomRosterColumn } from '../api/roster/custom-roster-column.model';
import { Unit } from '../api/unit/unit.model';
import { env } from '../util/env';
import { Log } from '../util/log';

require('dotenv').config();

export default (async function() {
  if (!env.isDev) {
    throw new Error('You can only seed the database in a development environment.');
  }

  Log.info('Seeding database...');

  const connection = await database;

  await getManager().transaction(async manager => {

    // Create Group Admin
    let groupAdmin = manager.create(User, {
      edipi: '0000000001',
      firstName: 'Group',
      lastName: 'Admin',
      phone: '123-456-7890',
      email: 'groupadmin@statusengine.com',
      service: 'Space Force',
      isRegistered: true,
    });
    groupAdmin = await manager.save(groupAdmin);

    // Create Org 1 & 2 and their Users
    await generateOrg(manager, 1, groupAdmin, 5, 20);
    await generateOrg(manager, 2, groupAdmin, 5, 20);
  });

  await connection.close();
  Log.info('Finished!');
}());


async function generateOrg(manager: EntityManager, orgNum: number, admin: User, numUsers: number, numRosterEntries: number) {
  let org = manager.create(Org, {
    name: `Test Group ${orgNum}`,
    description: `Group ${orgNum} for testing.`,
    contact: admin,
    indexPrefix: `testgroup${orgNum}`,
    reportingGroup: `test${orgNum}`,
    defaultMusterConfiguration: [],
  });
  org = await manager.save(org);

  let customColumn = manager.create(CustomRosterColumn, {
    org,
    name: 'myCustomColumn',
    display: `My Custom Column : Group ${orgNum}`,
    type: RosterColumnType.String,
    phi: false,
    pii: false,
    required: false,
  });
  customColumn = await manager.save(customColumn);

  const units: Unit[] = [];
  for (let i = 1; i <= 5; i++) {
    let unit = manager.create(Unit, {
      org,
      name: `Unit ${i} : Group ${orgNum}`,
      musterConfiguration: [],
    });
    unit = await manager.save(unit);
    units.push(unit);
  }

  let groupAdminRole = createGroupAdminRole(manager, org);
  groupAdminRole = await manager.save(groupAdminRole);
  await admin.addRole(manager, groupAdminRole, [], true);
  await manager.save(admin);

  let groupUserRole = createGroupUserRole(manager, org);
  groupUserRole.allowedRosterColumns.push(customColumn.name);
  groupUserRole = await manager.save(groupUserRole);

  for (let i = 0; i < numUsers; i++) {
    let user = manager.create(User, {
      edipi: `${orgNum}00000000${i}`,
      firstName: 'User',
      lastName: `${i}`,
      phone: randomPhoneNumber(),
      email: `user${i}@org${orgNum}.com`,
      service: 'Space Force',
      isRegistered: true,
    });
    user = await manager.save(user);
    await user.addRole(manager, groupUserRole, [units[i % 5]], false);
  }

  for (let i = 0; i < numRosterEntries; i++) {
    const customColumns: any = {};
    customColumns[customColumn.name] = `custom column value`;
    const rosterEntry = manager.create(Roster, {
      edipi: `${orgNum}${`${i}`.padStart(9, '0')}`,
      firstName: 'Roster',
      lastName: `Entry${i}`,
      unit: units[i % 5],
      customColumns,
    });
    await manager.save(rosterEntry);
  }

  return org;
}

function randomPhoneNumber() {
  return `${randomNumber(100, 999)}-${randomNumber(100, 999)}-${randomNumber(1000, 9999)}`;
}

function randomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createGroupAdminRole(manager: EntityManager, org: Org, workspace?: Workspace) {
  return manager.create(Role, {
    name: `Group Admin : Group ${org.id}`,
    description: 'For managing the group.',
    org,
    allowedRosterColumns: ['*'],
    allowedNotificationEvents: ['*'],
    canManageGroup: true,
    canManageRoster: true,
    canManageWorkspace: true,
    canViewMuster: true,
    canViewPII: true,
    canViewRoster: true,
    workspace,
  });
}

function createGroupUserRole(manager: EntityManager, org: Org, workspace?: Workspace) {
  return manager.create(Role, {
    name: `Group User : Group ${org.id}`,
    description: `Basic role for all Group ${org.id} users.`,
    org,
    allowedRosterColumns: ['edipi', 'firstName', 'lastName'],
    allowedNotificationEvents: [],
    canManageRoster: true,
    canViewRoster: true,
    canViewMuster: true,
    workspace,
  });
}
