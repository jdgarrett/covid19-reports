import { Response } from 'express';
import csv from 'csvtojson';
import fs from 'fs';
import {
  getConnection,
  In,
  OrderByCondition,
  QueryBuilder,
  SelectQueryBuilder,
} from 'typeorm';
import _ from 'lodash';
import moment from 'moment';
import {
  ApiRequest, EdipiParam, OrgColumnNameParams, OrgParam, OrgRosterParams, PagedQuery,
} from '../index';
import { Roster } from './roster.model';
import {
  BadRequestError,
  NotFoundError,
  RosterUploadError,
  RosterUploadErrorInfo,
  UnprocessableEntity,
} from '../../util/error-types';
import {
  BaseType, dateFromString, getOptionalParam, getRequiredParam,
} from '../../util/util';
import { Org } from '../org/org.model';
import { CustomColumnConfig, CustomRosterColumn } from './custom-roster-column.model';
import { Unit } from '../unit/unit.model';
import { CustomColumnValue, RosterColumnInfo, RosterColumnType } from './roster.types';
import { UserRole } from '../user/user-role.model';
import { ChangeType, RosterHistory } from './roster-history.model';
import { baseRosterColumns } from './roster-entity';

class RosterController {

  async addCustomColumn(req: ApiRequest<OrgParam, CustomColumnData>, res: Response) {
    if (!req.body.name) {
      throw new BadRequestError('A name must be supplied when adding a new column.');
    }
    if (!req.body.displayName) {
      throw new BadRequestError('A display name must be supplied when adding a new column.');
    }
    if (!req.body.type) {
      throw new BadRequestError('A type must be supplied when adding a new column.');
    }

    const columnName = req.body.name;
    const existingColumn = await CustomRosterColumn.findOne({
      where: {
        name: columnName,
        org: req.appOrg!.id,
      },
    });

    if (existingColumn
      || columnName.toLowerCase() === 'unit'
      || baseRosterColumns.find(column => column.name.toLowerCase() === columnName.toLowerCase())) {
      throw new BadRequestError('There is already a column with that name.');
    }

    const column = new CustomRosterColumn();
    column.org = req.appOrg;
    setCustomColumnFromBody(column, req.body);

    const newColumn = await column.save();
    res.status(201).json(newColumn);
  }

  async updateCustomColumn(req: ApiRequest<OrgColumnNameParams, CustomColumnData>, res: Response) {
    const existingColumn = await CustomRosterColumn.findOne({
      relations: ['org'],
      where: {
        name: req.params.columnName,
        org: req.appOrg!.id,
      },
    });

    if (!existingColumn) {
      throw new NotFoundError('The roster column could not be found.');
    }

    if (req.body.name && req.body.name !== req.params.columnName) {
      throw new BadRequestError('Unable to change the field name of a custom column.');
    }

    setCustomColumnFromBody(existingColumn, req.body);
    const updatedColumn = await existingColumn.save();

    res.json(updatedColumn);
  }

  async deleteCustomColumn(req: ApiRequest<OrgColumnNameParams>, res: Response) {
    const existingColumn = await CustomRosterColumn.findOne({
      relations: ['org'],
      where: {
        name: req.params.columnName,
        org: req.appOrg!.id,
      },
    });

    if (!existingColumn) {
      throw new NotFoundError('The roster column could not be found.');
    }

    const deletedColumn = await existingColumn.remove();
    res.json(deletedColumn);
  }

  async getRosterTemplate(req: ApiRequest, res: Response) {
    const columns = await Roster.getAllowedColumns(req.appOrg!, req.appUserRole!.role);
    const headers: string[] = ['unit'];
    const example: string[] = ['unit1'];
    columns.forEach(column => {
      headers.push(column.name);
      if (column.name === 'edipi') {
        example.push('0000000001');
      } else {
        switch (column.type) {
          case RosterColumnType.Number:
            example.push('12345');
            break;
          case RosterColumnType.Boolean:
            example.push('false');
            break;
          case RosterColumnType.String:
            example.push('Example Text');
            break;
          case RosterColumnType.Date:
            example.push(new Date().toLocaleDateString());
            break;
          case RosterColumnType.DateTime:
            example.push(new Date().toISOString());
            break;
          default:
            example.push('');
            break;
        }
      }
    });
    const csvContents = `${headers.join(',')}\n${example.join(',')}`;
    res.header('Content-Type', 'text/csv');
    res.attachment('roster-template.csv');
    res.send(csvContents);
  }

  async getRoster(req: ApiRequest<OrgParam, any, GetRosterQuery>, res: Response) {
    res.json(await internalSearchRoster(req.query, req.appOrg!, req.appUserRole!));
  }

  async searchRoster(req: ApiRequest<OrgParam, SearchRosterBody, GetRosterQuery>, res: Response) {
    res.json(await internalSearchRoster(req.query, req.appOrg!, req.appUserRole!, req.body));
  }

  async uploadRosterEntries(req: ApiRequest<OrgParam>, res: Response) {
    const org = req.appOrg!;

    if (!req.file || !req.file.path) {
      throw new BadRequestError('No file to process.');
    }

    const rosterEntries: Roster[] = [];
    let roster: RosterFileRow[];
    try {
      roster = await csv().fromFile(req.file.path) as RosterFileRow[];
    } catch (err) {
      throw new UnprocessableEntity('Roster file was unable to be processed. Check that it is formatted correctly.');
    } finally {
      fs.unlinkSync(req.file.path);
    }

    const orgUnits = await req.appUserRole?.getUnits();

    if (!orgUnits) {
      throw new BadRequestError('No units found.');
    }

    const columns = await Roster.getAllowedColumns(org, req.appUserRole!.role);
    const errors: RosterUploadErrorInfo[] = [];
    const existingEntries = await Roster.find({
      where: {
        edipi: In(roster.map(x => x.edipi)),
      },
    });

    const onError = (error: Error, row?: RosterFileRow, index?: number, column?: string) => {
      errors.push({
        column,
        edipi: row?.edipi,
        error: error.message,
        // Offset by 2 - 1 because of being zero-based and 1 because of the csv header row
        line: index !== undefined ? index + 2 : undefined,
      });
    };

    roster.forEach((row, index) => {
      const units = orgUnits.filter(u => row.unit === u.name);
      const unit = units.length > 0 ? units[0] : undefined;
      // Pre-validate / check for row-level issues.
      try {
        if (!row.unit) {
          throw new BadRequestError('Unable to add roster entries without a unit.');
        }
        if (units.length === 0) {
          throw new NotFoundError(`Unit "${row.unit}" could not be found in the group.`);
        }
        if (existingEntries.some(({ edipi }) => edipi === row.edipi)) {
          throw new BadRequestError(`Entry with EDIPI already exists.`);
        }
      } catch (error) {
        onError(error, row, index);
      }

      const entry = new Roster();
      entry.unit = unit!;
      for (const column of columns) {
        try {
          setColumnFromCSV(entry, row, column);
        } catch (error) {
          onError(error, row, index, column.name);
        }
      }
      rosterEntries.push(entry);
    });

    if (errors.length === 0) {
      try {
        await Roster.save(rosterEntries);
      } catch (error) {
        const edipi = error.parameters[0];
        const index = roster.findIndex(r => r.edipi === edipi);
        const row = index === -1 ? undefined : roster[index];
        onError(error, row, index, error.column);
      }
    }

    if (errors.length !== 0) {
      throw new RosterUploadError(errors);
    }

    res.json({
      count: rosterEntries.length,
    });
  }

  async deleteRosterEntries(req: ApiRequest, res: Response) {
    const units = await req.appUserRole!.getUnits();
    for (const unit of units) {
      await Roster.delete({
        unit,
      });
    }
    res.status(200).send();
  }

  async getFullRosterInfo(req: ApiRequest<OrgParam>, res: Response) {
    const columns = await Roster.getColumns(req.appOrg!.id);
    res.json(columns);
  }

  async getRosterInfo(req: ApiRequest<OrgParam>, res: Response) {
    const columns = await Roster.getAllowedColumns(req.appOrg!, req.appUserRole!.role);
    res.json(columns);
  }

  async getRosterInfosForIndividual(req: ApiRequest<EdipiParam, null, ReportDateQuery>, res: Response) {
    const reportDate = dateFromString(req.query.reportDate);
    if (!reportDate) {
      throw new BadRequestError('Missing reportDate.');
    }
    const timestamp = reportDate.getTime() / 1000;
    const entries = await RosterHistory.createQueryBuilder('roster')
      .leftJoinAndSelect('roster.unit', 'unit')
      .leftJoinAndSelect('unit.org', 'org')
      .where('roster.edipi = :edipi', { edipi: req.params.edipi })
      .andWhere('roster.timestamp <= to_timestamp(:timestamp)', { timestamp })
      .select()
      .distinctOn(['roster.unit_id'])
      .orderBy('roster.unit_id')
      .addOrderBy('roster.timestamp', 'DESC')
      .getMany();

    const responseData: RosterInfo[] = [];
    for (const roster of entries) {
      if (roster.changeType === ChangeType.Deleted) {
        continue;
      }

      const columns = (await Roster.getColumns(roster.unit.org!.id)).map(column => ({
        ...column,
        value: roster.getColumnValue(column),
      } as RosterColumnWithValue));

      const rosterInfo: RosterInfo = {
        unit: roster.unit,
        columns,
      };
      responseData.push(rosterInfo);
    }

    res.json({
      rosters: responseData,
    });
  }

  async addRosterEntry(req: ApiRequest<OrgParam, RosterEntryData>, res: Response) {
    const edipi = req.body.edipi as string;

    if (!req.body.unit) {
      throw new BadRequestError('A unit must be supplied when adding a roster entry.');
    }

    const unit = await req.appUserRole?.getUnit(req.body.unit);
    if (!unit) {
      throw new NotFoundError(`Unit with ID ${req.body.unit} could not be found.`);
    }

    const rosterEntry = await Roster.findOne({
      where: {
        edipi,
        unit: unit.id,
      },
    });

    if (rosterEntry) {
      throw new BadRequestError('The individual is already in the roster.');
    }

    const entry = new Roster();
    entry.unit = unit;
    const columns = await Roster.getAllowedColumns(req.appOrg!, req.appUserRole!.role);
    await setRosterParamsFromBody(req.appOrg!, entry, req.body, columns, true);
    const newRosterEntry = await entry.save();

    res.status(201).json(newRosterEntry);
  }

  async getRosterEntry(req: ApiRequest<OrgRosterParams>, res: Response) {
    const rosterId = req.params.rosterId;

    const queryBuilder = await Roster.queryAllowedRoster(req.appOrg!, req.appUserRole!);
    const rosterEntry = await queryBuilder
      .andWhere('roster.id=\':id\'', {
        id: rosterId,
      })
      .getRawOne<RosterEntryData>();

    if (!rosterEntry) {
      throw new NotFoundError('User could not be found.');
    }

    res.json(rosterEntry);
  }

  async deleteRosterEntry(req: ApiRequest<OrgRosterParams>, res: Response) {
    const rosterId = req.params.rosterId;

    const rosterEntry = await Roster.findOne({
      relations: ['unit'],
      where: {
        id: rosterId,
      },
    });

    if (!rosterEntry) {
      throw new NotFoundError('User could not be found.');
    }

    const deletedEntry = await rosterEntry.remove();

    res.json(deletedEntry);
  }

  async updateRosterEntry(req: ApiRequest<OrgRosterParams, RosterEntryData>, res: Response) {
    const rosterId = req.params.rosterId;

    let entry = await Roster.findOne({
      relations: ['unit'],
      where: {
        id: rosterId,
      },
    });

    await getConnection().transaction(async manager => {
      if (!entry) {
        throw new NotFoundError('User could not be found.');
      }

      if (req.body.unit && req.body.unit !== entry.unit!.id) {
        // If the unit changed, delete the individual from the old unit's roster.
        const unit = await req.appUserRole?.getUnit(req.body.unit);
        if (!unit) {
          throw new NotFoundError(`Unit with ID ${req.body.unit} could not be found.`);
        }
        const newEntry = copyRosterEntry(entry);
        await manager.delete(Roster, entry.id);
        entry = newEntry;
        entry.unit = unit;
      }

      const columns = await Roster.getAllowedColumns(req.appOrg!, req.appUserRole!.role);
      await setRosterParamsFromBody(req.appOrg!, entry, req.body, columns);
      const updatedRosterEntry = await manager.save(entry);
      res.json(updatedRosterEntry);
    });
  }

}

const formatValue = (val: CustomColumnValue, column: RosterColumnInfo) => {
  if (val === null) {
    return val;
  }
  switch (column.type) {
    case RosterColumnType.String:
      return val.toString().toLowerCase();
    case RosterColumnType.DateTime:
      return `'${moment.utc(val.toString()).format('YYYY-MM-DD HH:mm')}:00.000000'`;
    case RosterColumnType.Date:
      return `'${moment.utc(val.toString()).format('YYYY-MM-DD')} 00:00:00.000000'`;
    default:
      return val;
  }
};

const formatColumnName = (column: RosterColumnInfo) => {
  const columnName = Roster.getColumnSelect(column);

  switch (column.type) {
    case RosterColumnType.String:
      return `LOWER(${columnName})`;
    case RosterColumnType.DateTime:
      return `date_trunc('minute', (${columnName})::TIMESTAMP)`;
    case RosterColumnType.Date:
      return `date_trunc('day', (${columnName})::TIMESTAMP)`;
    default:
      return columnName;
  }
};

function applyWhere(queryBuilder: SelectQueryBuilder<Roster>, column: RosterColumnInfo, { op, value }: SearchRosterBodyEntry) {
  const columnName = formatColumnName(column);

  if (op === 'in') {
    if (!Array.isArray(value)) {
      throw new BadRequestError(`Malformed search query. Expected array value for ${column.name}.`);
    }
    return queryBuilder.andWhere(`${columnName} ${op} (:...${column.name})`, {
      [column.name]: value.map(v => formatValue(v, column)),
    });
  }

  if (op === 'between') {
    const maxKey = `${column.name}Max`;
    const minKey = `${column.name}Min`;
    if (!Array.isArray(value)) {
      throw new BadRequestError(`Malformed search query. Expected array value for ${column.name}.`);
    }
    return queryBuilder.andWhere(`${columnName} BETWEEN (:${minKey}) AND (:${maxKey})`, {
      [minKey]: formatValue(value[0], column),
      [maxKey]: formatValue(value[1], column),
    });
  }

  if (op === '~' || op === 'startsWith' || op === 'endsWith') {
    if (column.type !== RosterColumnType.String) {
      throw new BadRequestError('Malformed search query. Expected string value.');
    }
    const prefix = op !== 'startsWith' ? '%' : '';
    const suffix = op !== 'endsWith' ? '%' : '';
    return queryBuilder.andWhere(`${columnName} LIKE :${column.name}`, {
      [column.name]: `${prefix}${value}${suffix}`.toLowerCase(),
    });
  }

  if (op === '=' || op === '<>' || op === '>' || op === '<') {
    if (Array.isArray(value)) {
      throw new BadRequestError(`Malformed search query. Expected scalar value for ${column.name}.`);
    }
    return queryBuilder.andWhere(`${columnName} ${op} :${column.name}`, {
      [column.name]: formatValue(value, column),
    });
  }

  throw new BadRequestError(`Malformed search query. Received unexpected parameters for '${column.name}', op: ${op}`);
}

function findColumnByName(name: string, columns: RosterColumnInfo[]) {
  if (name === 'unit') {
    return {
      name: 'unit',
      displayName: 'Unit',
      custom: false,
      phi: false,
      pii: false,
      type: RosterColumnType.String,
      updatable: false,
      required: false,
    };
  }
  const column = columns.find(col => col.name === name);
  if (!column) {
    throw new BadRequestError(`Malformed search query. Unknown column name: '${name}'.`);
  }
  return column;
}

async function internalSearchRoster(query: GetRosterQuery, org: Org, userRole: UserRole, searchParams?: SearchRosterBody) {
  const limit = parseInt(query.limit ?? '100');
  const page = parseInt(query.page ?? '0');
  const orderBy = query.orderBy || 'edipi';
  const sortDirection = query.sortDirection || 'ASC';
  const rosterColumns = await Roster.getAllowedColumns(org, userRole.role);
  let queryBuilder = await Roster.queryAllowedRoster(org, userRole);

  if (searchParams) {
    Object.keys(searchParams)
      .forEach(columnName => {
        queryBuilder = applyWhere(queryBuilder, findColumnByName(columnName, rosterColumns), searchParams[columnName]);
      });
  }

  const rosterQuery = queryBuilder
    .clone()
    .offset(page * limit)
    .limit(limit);
  const sortColumn = rosterColumns.find(column => column.name === orderBy);
  if (sortColumn) {
    const order: OrderByCondition = {};
    order[Roster.getColumnSelect(sortColumn)] = sortDirection;
    rosterQuery.orderBy(order);
  } else if (orderBy === 'unit') {
    const order: OrderByCondition = {};
    order['u.name'] = sortDirection;
    rosterQuery.orderBy(order);
  }
  const roster = await rosterQuery.getRawMany<RosterEntryData>();

  const totalRowsCount = await queryBuilder.getCount();

  return {
    rows: roster,
    totalRowsCount,
  };
}

function copyRosterEntry(roster: Roster) {
  const newEntry = new Roster();
  newEntry.edipi = roster.edipi;
  newEntry.unit = roster.unit;
  newEntry.firstName = roster.firstName;
  newEntry.lastName = roster.lastName;
  newEntry.customColumns = _.cloneDeep(roster.customColumns);
  return newEntry;
}

function setCustomColumnFromBody(column: CustomRosterColumn, body: CustomColumnData) {
  if (body.name) {
    column.name = body.name;
  }
  if (body.displayName) {
    column.display = body.displayName;
  }
  if (body.type) {
    column.type = body.type;
  }
  if (body.pii != null) {
    column.pii = body.pii;
  }
  if (body.phi != null) {
    column.phi = body.phi;
  }
  if (body.required != null) {
    column.required = body.required;
  }
  if (body.config != null) {
    column.config = body.config;
  }
}

async function setRosterParamsFromBody(org: Org, entry: Roster, body: RosterEntryData, columns: RosterColumnInfo[], newEntry: boolean = false) {
  for (const column of columns) {
    if (newEntry || column.updatable) {
      await getColumnFromBody(org, entry, body, column, newEntry);
    }
  }
}

async function getColumnFromBody(org: Org, roster: Roster, row: RosterEntryData, column: RosterColumnInfo, newEntry: boolean) {
  let objectValue: Date | CustomColumnValue | undefined;
  let paramType: BaseType;
  switch (column.type) {
    case RosterColumnType.Date:
    case RosterColumnType.DateTime:
    case RosterColumnType.Enum:
      paramType = 'string';
      break;
    default:
      paramType = column.type;
  }
  if (column.required && newEntry) {
    objectValue = getRequiredParam(column.name, row, paramType);
  } else {
    objectValue = getOptionalParam(column.name, row, paramType);
  }
  if (objectValue !== undefined) {
    if (objectValue === null && column.required) {
      throw new BadRequestError(`Required column '${column.name}' cannot be null.`);
    }
    if (column.custom) {
      if (!roster.customColumns) {
        roster.customColumns = {};
      }
      roster.customColumns[column.name] = objectValue;
    } else {
      if (objectValue !== null
        && (column.type === RosterColumnType.Date
          || column.type === RosterColumnType.DateTime)) {
        objectValue = dateFromString(`${objectValue}`);
      }
      Reflect.set(roster, column.name, objectValue !== null ? objectValue : undefined);
    }
  }
}

function setColumnFromCSV(roster: Roster, row: RosterFileRow, column: RosterColumnInfo) {
  let stringValue: string | undefined;
  if (column.required) {
    stringValue = getRequiredParam(column.name, row);
  } else {
    stringValue = getOptionalParam(column.name, row);
  }
  if (stringValue != null && stringValue.length > 0) {
    let value: any;
    switch (column.type) {
      case RosterColumnType.String:
        value = stringValue;
        break;
      case RosterColumnType.Number:
        if (stringValue.length > 0) {
          value = +stringValue;
        }
        break;
      case RosterColumnType.Date:
      case RosterColumnType.DateTime:
        value = dateFromString(stringValue);
        break;
      case RosterColumnType.Boolean:
        value = stringValue === 'true';
        break;
      default:
        break;
    }

    if (column.required && value === undefined) {
      throw new BadRequestError(`Invalid value (${stringValue}) for ${column.name}`);
    }

    if (value !== undefined) {
      if (column.custom) {
        if (!roster.customColumns) {
          roster.customColumns = {};
        }
        roster.customColumns[column.name] = value;
      } else {
        Reflect.set(roster, column.name, value);
      }
    }
  }
}


interface RosterColumnWithValue extends RosterColumnInfo {
  value: CustomColumnValue,
}

interface RosterInfo {
  unit: Unit,
  columns: RosterColumnInfo[],
}

type GetRosterQuery = {
  orderBy?: string
  sortDirection?: 'ASC' | 'DESC'
} & PagedQuery;

type QueryOp = '=' | '<>' | '~' | '>' | '<' | 'startsWith' | 'endsWith' | 'in' | 'between';

type SearchRosterBodyEntry = {
  op: QueryOp
  value: CustomColumnValue | CustomColumnValue[]
};

type SearchRosterBody = {
  [column: string]: SearchRosterBodyEntry
};

type ReportDateQuery = {
  reportDate: string
};

type RosterFileRow = {
  [key: string]: string
};

export type RosterEntryData = {
  unit?: number,
  [key: string]: CustomColumnValue | undefined
};

type CustomColumnData = {
  name?: string,
  displayName?: string,
  type?: RosterColumnType,
  pii?: boolean,
  phi?: boolean,
  required?: boolean,
  config?: CustomColumnConfig,
};

export default new RosterController();
