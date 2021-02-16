import {
  Entity,
  Unique,
} from 'typeorm';
import { snakeCase } from 'typeorm/util/StringUtils';
import {
  RosterColumnInfo,
  RosterColumnType,
} from './roster.types';
import { Org } from '../org/org.model';
import { Role } from '../role/role.model';
import { CustomRosterColumn } from './custom-roster-column.model';
import { baseRosterColumns, RosterEntity } from './roster-entity';
import { UserRole } from '../user/user-role.model';

@Entity()
@Unique(['edipi', 'unit'])
export class Roster extends RosterEntity {

  static getColumnSelect(column: RosterColumnInfo) {
    // Make sure custom columns are converted to appropriate types
    if (column.custom) {
      switch (column.type) {
        case RosterColumnType.Boolean:
          return `(roster.custom_columns ->> '${column.name}')::BOOLEAN`;
        case RosterColumnType.Number:
          return `(roster.custom_columns ->> '${column.name}')::DOUBLE PRECISION`;
        default:
          return `roster.custom_columns ->> '${column.name}'`;
      }
    }
    return `roster.${snakeCase(column.name)}`;
  }

  static async queryAllowedRoster(org: Org, userRole: UserRole, columns?: RosterColumnInfo[]) {
    //
    // Query the roster, returning only columns and rows that are allowed for the role of the requester.
    //
    if (!columns) {
      columns = await Roster.getAllowedColumns(org, userRole.role);
    }
    const queryBuilder = Roster.createQueryBuilder('roster').select([]);
    queryBuilder.leftJoin('roster.unit', 'u');
    // Always select the id column
    queryBuilder.addSelect('roster.id', 'id');
    queryBuilder.addSelect('u.id', 'unit');

    // Add all columns that are allowed by the user's role
    columns.forEach(column => {
      queryBuilder.addSelect(Roster.getColumnSelect(column), column.name);
    });

    // Filter out roster entries that are not on the active roster or are not allowed by the role's index prefix.
    queryBuilder
      .where('u.org_id = :orgId', { orgId: org.id });

    if (!userRole.allUnits) {
      queryBuilder
        .andWhere(`u.id IN (${(await userRole.getUnits()).map(unit => unit.id).join(',')})`);
    }

    return queryBuilder;
  }

  static async getAllowedColumns(org: Org, role: Role) {
    const allColumns = await Roster.getColumns(org.id);
    const fineGrained = !(role.allowedRosterColumns.length === 1 && role.allowedRosterColumns[0] === '*');
    return allColumns.filter(column => {
      let allowed = true;
      if (fineGrained && role.allowedRosterColumns.indexOf(column.name) < 0) {
        allowed = false;
      } else if (!role.canViewPII && column.pii) {
        allowed = false;
      } else if (!role.canViewPHI && column.phi) {
        allowed = false;
      }
      return allowed;
    });
  }

  static async getColumns(orgId: number) {
    const customColumns = (await CustomRosterColumn.find({
      where: {
        org: orgId,
      },
    })).map(customColumn => {
      const columnInfo: RosterColumnInfo = {
        ...customColumn,
        displayName: customColumn.display,
        custom: true,
        updatable: true,
      };
      return columnInfo;
    });
    return [...baseRosterColumns, ...customColumns];
  }

}
