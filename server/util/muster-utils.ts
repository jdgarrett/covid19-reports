import {
  MSearchResponse,
  SearchResponse,
} from 'elasticsearch';
import moment from 'moment-timezone';
import { Org } from '../api/org/org.model';
import { UserRole } from '../api/user/user-role.model';
import { Roster } from '../api/roster/roster.model';
import {
  MusterConfiguration,
  Unit,
} from '../api/unit/unit.model';
import elasticsearch from '../elasticsearch/elasticsearch';
import { InternalServerError } from './error-types';
import { Log } from './log';
import {
  getElasticsearchDateFormat,
  getElasticsearchTimeInterval,
  getMomentDateFormat,
  TimeInterval,
} from './util';

/**
 * Get muster stats for each individual on the roster, given a time range and optional unit to filter by. The returned
 * data will include each individual's muster stats merged with their roster data.
 */
export async function getRosterMusterStats(args: {
  org: Org
  userRole: UserRole
  interval: TimeInterval
  intervalCount: number
  unitId?: number
}) {
  const { org, userRole, interval, intervalCount, unitId } = args;

  // Send ES request.
  let response: SearchResponse<never>;
  try {
    response = await elasticsearch.search({
      index: userRole.getKibanaIndicesForMuster(unitId),
      body: buildIndividualsMusterBody({
        interval,
        intervalCount,
      }),
    });
  } catch (err) {
    Log.error(err);
    throw new InternalServerError(`Elasticsearch: ${err.message}`);
  }

  // Get allowed roster data for the individuals returned from ES.
  let rosterEntries: Roster[];
  if (unitId) {
    rosterEntries = await Roster.createQueryBuilder('roster')
      .leftJoinAndSelect('roster.unit', 'unit')
      .leftJoinAndSelect('unit.org', 'org')
      .where('unit.id = :unitId', { unitId })
      .getMany();
  } else {
    rosterEntries = await Roster.createQueryBuilder('roster')
      .leftJoinAndSelect('roster.unit', 'unit')
      .leftJoinAndSelect('unit.org', 'org')
      .where('org.id = :orgId', { orgId: org.id })
      .getMany();
  }

  const rosterEntriesByEdipi: { [edipi: string]: Roster } = {};
  rosterEntries.forEach(e => {
    rosterEntriesByEdipi[e.edipi] = e;
  });

  const allowedRosterColumns = await Roster.getAllowedColumns(org, userRole.role);

  // Collect reports and reports missed.
  const individualStats: IndividualStats = {};

  const aggs = response.aggregations as IndividualsMusterAggregations | undefined;
  const buckets = aggs?.muster.buckets ?? [];
  for (const bucket of buckets) {
    const { edipi, reported } = bucket.key;

    if (!individualStats[edipi]) {
      individualStats[edipi] = {
        mustersReported: 0,
        mustersNotReported: 0,
        nonMusterPercent: 0,
      };
    }

    if (reported) {
      individualStats[edipi].mustersReported = bucket.doc_count;
    } else {
      individualStats[edipi].mustersNotReported = bucket.doc_count;
    }
  }

  // Calculate non-muster percents.
  for (const edipi of Object.keys(individualStats)) {
    const data = individualStats[edipi];
    individualStats[edipi].nonMusterPercent = calcNonMusterPercent(data.mustersReported, data.mustersNotReported);
  }

  // Build a sorted array of the individuals' stats merged with their roster data.
  const individuals = Object.keys(individualStats)
    .filter(edipi => {
      return (
        rosterEntriesByEdipi[edipi]
        && individualStats[edipi].nonMusterPercent > 0
      );
    })
    .sort((edipiA, edipiB) => {
      const entryA = rosterEntriesByEdipi[edipiA];
      const entryB = rosterEntriesByEdipi[edipiB];
      const individualA = individualStats[edipiA];
      const individualB = individualStats[edipiB];

      let diff = individualB.nonMusterPercent - individualA.nonMusterPercent;
      if (diff === 0) {
        diff = entryA.unit?.name.localeCompare(entryB.unit!.name) ?? 0;
      }
      if (diff === 0) {
        diff = entryA.lastName?.localeCompare(entryB.lastName!) ?? 0;
      }
      if (diff === 0) {
        diff = entryA.firstName?.localeCompare(entryB.firstName!) ?? 0;
      }
      return diff;
    })
    .map(edipi => {
      const rosterEntryCleaned: Partial<Roster> = {};
      const rosterEntry = rosterEntriesByEdipi[edipi];
      const individual = individualStats[edipi];
      for (const columnInfo of allowedRosterColumns) {
        const columnValue = rosterEntry.getColumnValue(columnInfo);
        Reflect.set(rosterEntryCleaned, columnInfo.name, columnValue);
      }
      return {
        ...individual,
        ...rosterEntryCleaned,
        unitId: rosterEntry.unit.id,
      } as IndividualStats[string] & Partial<Roster>;
    });

  return individuals;
}

/**
 * Get aggregated unit muster stats over the given weeks/months.
 */
export async function getUnitMusterStats(args: {
  userRole: UserRole
  weeksCount: number
  monthsCount: number
}) {
  const { userRole, weeksCount, monthsCount } = args;

  const unitNames = (await userRole.getUnits()).map(u => u.name);

  //
  // Build elastcisearch multisearch queries.
  //
  const index = userRole.getKibanaIndicesForMuster();
  const esBody = [
    { index },
    buildMusterEsBody({
      interval: 'week',
      intervalCount: weeksCount,
    }),

    { index },
    buildMusterEsBody({
      interval: 'month',
      intervalCount: monthsCount,
    }),
  ] as any[];

  // Send ES request.
  let response: MSearchResponse<unknown>;
  try {
    response = await elasticsearch.msearch({ body: esBody });
  } catch (err) {
    Log.error(err);
    throw new InternalServerError(`Elasticsearch: ${err.message}`);
  }

  //
  // Organize and return data.
  //
  const weeklyAggs = response.responses![0].aggregations as MusterAggregation | undefined;
  const monthlyAggs = response.responses![1].aggregations as MusterAggregation | undefined;

  return {
    weekly: buildUnitStats({
      aggregations: weeklyAggs,
      unitNames,
      interval: 'week',
      intervalCount: weeksCount,
    }),
    monthly: buildUnitStats({
      aggregations: monthlyAggs,
      unitNames,
      interval: 'month',
      intervalCount: monthsCount,
    }),
  };
}

export function calcNonMusterPercent(mustersReported: number, mustersNotReported: number) {
  const totalReports = mustersReported + mustersNotReported;
  if (totalReports === 0) {
    return 0;
  }

  const nonMusterPercent = (mustersNotReported / totalReports) * 100;

  if (nonMusterPercent < 0 || nonMusterPercent > 100) {
    Log.warn(`Invalid non-muster percent (${nonMusterPercent}). It should be between 0 and 100.`);
  }

  return nonMusterPercent;
}

export function getEarliestMusterWindowTime(muster: MusterConfiguration, referenceTime: number) {
  const musterTime = moment(muster.startTime, 'HH:mm');
  return moment
    .unix(referenceTime)
    .tz(muster.timezone)
    .startOf('week')
    .add(musterTime.hour(), 'hours')
    .add(musterTime.minutes(), 'minutes')
    .unix();
}

export function buildMusterWindow(unit: Unit, startTimestamp: number, endTimestamp: number, muster: MusterConfiguration): MusterWindow {
  return {
    id: `${unit.org!.id}-${unit.id}-${moment.unix(startTimestamp).utc().format('Y-M-D-HH-mm')}`,
    orgId: unit.org!.id,
    unitId: unit.id,
    unitName: unit.name,
    reportingGroup: unit.org!.reportingGroup,
    startTimestamp,
    endTimestamp,
    startTime: muster.startTime,
    timezone: muster.timezone,
    durationMinutes: muster.durationMinutes,
  };
}

export function getDistanceToWindow(start: number, end: number, time: number) {
  if (time > end) {
    return time - end;
  }
  if (time < start) {
    return time - start;
  }
  return 0;
}

export function getMusterConfig(unit: Unit): MusterConfiguration[] | undefined {
  return unit.musterConfiguration === null ? unit.org!.defaultMusterConfiguration : unit.musterConfiguration;
}

function buildIndividualsMusterBody({
  interval,
  intervalCount,
}: {
  interval: TimeInterval,
  intervalCount: number
}) {
  /*
    Example ES Response:
    {
      ...
      "aggregations": {
        "muster": {
          "after_key": {
            "edipi": "0000000001",
            "reported": false
          },
          "buckets": [
            {
              "key": {
                "edipi": "0000000001",
                "reported": false
              },
              "doc_count": 1
            },
            {
              "key": {
                "edipi": "0000000001",
                "reported": true
              },
              "doc_count": 4
            },
            ...
          ]
        }
      }
    }
  */

  const esInterval = getElasticsearchTimeInterval(interval);

  return {
    size: 0,
    query: {
      bool: {
        filter: [
          {
            range: {
              Timestamp: {
                gte: `now-${intervalCount}${esInterval}/${esInterval}`,
                lte: `now/${esInterval}`,
              },
            },
          },
        ],
      },
    },
    aggs: {
      muster: {
        composite: {
          size: 10000,
          sources: [
            {
              edipi: {
                terms: {
                  field: 'Roster.edipi.keyword',
                },
              },
            },
            {
              reported: {
                terms: {
                  field: 'Muster.reported',
                  missing_bucket: true, // Prevent the request from failing if there are docs without Muster.reported.
                },
              },
            },
          ],
        },
      },
    },
  };
}

function buildMusterEsBody({
  interval,
  intervalCount,
}: {
  interval: TimeInterval,
  intervalCount: number
}) {
  /*
    Example ES Response:
    {
      ...
      "aggregations": {
        "muster": {
          "after_key": {
            "unit": "Steel Rain",
            "date": "2021-01-18",
            "reported": true
          },
          "buckets": [
            {
              "key": {
                "unit": "Airhawk",
                "date": "2020-12-28",
                "reported": false
              },
              "doc_count": 84
            },
            {
              "key": {
                "unit": "Airhawk",
                "date": "2020-12-28",
                "reported": true
              },
              "doc_count": 152
            },
            ...
          ]
        }
      }
    }
  */

  const esInterval = getElasticsearchTimeInterval(interval);

  return {
    size: 0,
    query: {
      bool: {
        filter: [
          {
            range: {
              Timestamp: {
                gte: `now-${intervalCount}${esInterval}/${esInterval}`,
                lt: `now/${esInterval}`,
              },
            },
          },
        ],
      },
    },
    aggs: {
      muster: {
        composite: {
          size: 10000,
          sources: [
            {
              date: {
                date_histogram: {
                  field: 'Timestamp',
                  interval: `1${esInterval}`,
                  format: getElasticsearchDateFormat(interval),
                },
              },
            },
            {
              unit: {
                terms: {
                  field: 'Roster.unit.keyword',
                },
              },
            },
            {
              reported: {
                terms: {
                  field: 'Muster.reported',
                  missing_bucket: true, // Prevent the request from failing if there are docs without Muster.reported.
                },
              },
            },
          ],
        },
      },
    },
  };
}

function buildUnitStats(args: {
  aggregations: MusterAggregation | undefined,
  unitNames: string[]
  interval: TimeInterval
  intervalCount: number
}) {
  const { aggregations, unitNames, interval, intervalCount } = args;

  // For week intervals, start on Mondays like ES does.
  const momentStartOf = (interval === 'week') ? 'isoWeek' : interval;

  // Initialize unit stats. Use our own set of dates and unit names, since ES may be missing some due to composite
  // aggregations not being able to return empty buckets.
  const unitStats = {} as UnitStatsByDate;
  for (let i = 0; i < intervalCount; i++) {
    const dateStr = moment.utc()
      .subtract(i + 1, interval)
      .startOf(momentStartOf)
      .format(getMomentDateFormat(interval));

    unitStats[dateStr] = {};
    for (const unitName of unitNames) {
      unitStats[dateStr][unitName] = {
        mustersReported: 0,
        mustersNotReported: 0,
        nonMusterPercent: 0,
      };
    }
  }

  // Collect reports and reports missed.
  const buckets = aggregations?.muster.buckets ?? [];
  for (const bucket of buckets) {
    const { date, unit, reported } = bucket.key;

    if (unitStats[date][unit] == null) {
      // Unit was in aggregation but not in the sql database, so skip it.
      continue;
    }

    if (reported) {
      unitStats[date][unit].mustersReported = bucket.doc_count;
    } else {
      unitStats[date][unit].mustersNotReported = bucket.doc_count;
    }
  }

  // Calculate non-muster percents.
  for (const date of Object.keys(unitStats)) {
    for (const unit of Object.keys(unitStats[date])) {
      const data = unitStats[date][unit];
      unitStats[date][unit].nonMusterPercent = calcNonMusterPercent(data.mustersReported, data.mustersNotReported);
    }
  }

  return unitStats;
}

type IndividualsMusterAggregations = {
  muster: {
    buckets: Array<{
      key: {
        edipi: string
        reported: boolean
      }
      doc_count: number
    }>
  }
};

type IndividualStats = {
  [edipi: string]: {
    mustersReported: number
    mustersNotReported: number
    nonMusterPercent: number
    unitId?: number
  }
};

type UnitStatsByDate = {
  [date: string]: {
    [unitName: string]: {
      mustersReported: number
      mustersNotReported: number
      nonMusterPercent: number
    }
  }
};

type MusterAggregation = {
  muster: {
    buckets: Array<{
      key: {
        date: string
        unit: string
        reported: boolean
      }
      doc_count: number
    }>
  }
};

export interface MusterWindow {
  id: string,
  unitId: number,
  unitName: string,
  reportingGroup?: string,
  orgId: number,
  startTimestamp: number,
  endTimestamp: number,
  startTime: string,
  timezone: string,
  durationMinutes: number,
}
