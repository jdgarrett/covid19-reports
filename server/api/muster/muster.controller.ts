import { Response } from 'express';
import { Brackets } from 'typeorm';
import { NotFoundError } from '../../util/error-types';
import {
  buildMusterWindow,
  getDistanceToWindow,
  getEarliestMusterWindowTime,
  getMusterConfig,
  getRosterMusterStats,
  getUnitMusterStats,
  MusterWindow,
} from '../../util/muster-utils';
import {
  ApiRequest,
  OrgRoleParams,
  OrgUnitParams,
  PagedQuery,
} from '../index';
import {
  MusterConfiguration,
  Unit,
} from '../unit/unit.model';
import {
  dayIsIn,
  DaysOfTheWeek,
  nextDay,
  oneDaySeconds,
  assertRequestQuery,
  TimeInterval,
} from '../../util/util';

class MusterController {

  async getIndividuals(req: ApiRequest<OrgRoleParams, null, GetIndividualsQuery>, res: Response) {
    assertRequestQuery(req, [
      'interval',
      'intervalCount',
      'limit',
      'page',
    ]);

    const interval = req.query.interval;
    const intervalCount = parseInt(req.query.intervalCount);
    const limit = parseInt(req.query.limit);
    const page = parseInt(req.query.page);

    const individuals = await getRosterMusterStats({
      org: req.appOrg!,
      userRole: req.appUserRole!,
      interval,
      intervalCount,
      unitId: req.query.unitId || undefined,
    });

    const offset = page * limit;

    return res.json({
      rows: individuals.slice(offset, offset + limit),
      totalRowsCount: individuals.length,
    });
  }

  async getTrends(req: ApiRequest<null, null, GetTrendsQuery>, res: Response) {
    assertRequestQuery(req, [
      'weeksCount',
      'monthsCount',
    ]);

    const weeksCount = parseInt(req.query.weeksCount ?? '6');
    const monthsCount = parseInt(req.query.monthsCount ?? '6');

    const unitTrends = await getUnitMusterStats({
      userRole: req.appUserRole!,
      weeksCount,
      monthsCount,
    });

    res.json(unitTrends);
  }

  async getClosedMusterWindows(req: ApiRequest<null, null, GetClosedMusterWindowsQuery>, res: Response) {
    const since = parseInt(req.query.since);
    const until = parseInt(req.query.until);
    // Get all units with muster configurations
    const unitsWithMusterConfigs = await Unit
      .createQueryBuilder('unit')
      .leftJoinAndSelect('unit.org', 'org')
      .where(new Brackets(sqb => {
        sqb.where('unit.muster_configuration IS NOT NULL');
        sqb.andWhere('json_array_length(unit.muster_configuration) > 0');
      }))
      .orWhere(new Brackets(sqb => {
        sqb.where('unit.muster_configuration IS NULL');
        sqb.andWhere('json_array_length(org.default_muster_configuration) > 0');
      }))
      .getMany();

    const musterWindows: MusterWindow[] = [];

    for (const unit of unitsWithMusterConfigs) {
      const musterConfig = getMusterConfig(unit)!;
      for (const muster of musterConfig) {
        // Get the unix timestamp of the earliest possible muster window, it could be in the previous week if the
        // muster window spans the week boundary.
        let current = getEarliestMusterWindowTime(muster, since - muster.durationMinutes * 60);
        const durationSeconds = muster.durationMinutes * 60;
        // Loop through each week
        while (current < until) {
          // Loop through each day of week to see if any of the windows ended in the query window
          for (let day = DaysOfTheWeek.Sunday; day <= DaysOfTheWeek.Saturday && current < until; day = nextDay(day)) {
            const end = current + durationSeconds;
            // If the window ended in the query window, add it to the list
            if (end > since && end <= until && dayIsIn(day, muster.days)) {
              musterWindows.push(buildMusterWindow(unit, current, end, muster));
            }
            current += oneDaySeconds;
          }
        }
      }
    }

    res.json(musterWindows);
  }

  async getNearestMusterWindow(req: ApiRequest<OrgUnitParams, null, GetNearestMusterWindowQuery>, res: Response) {
    const timestamp = parseInt(req.query.timestamp);

    const unit = await Unit.findOne({
      relations: ['org'],
      where: {
        id: req.params.unitId,
        org: req.appOrg!.id,
      },
    });

    if (!unit) {
      throw new NotFoundError('The unit could not be found.');
    }

    const musterConfig = getMusterConfig(unit) ?? [];
    let minDistance: number | null = null;
    let closestMuster: MusterConfiguration | undefined;
    let closestStart = 0;
    let closestEnd = 0;

    for (const muster of musterConfig) {
      if (muster.days === DaysOfTheWeek.None) {
        continue;
      }
      // Get the unix timestamp of the earliest possible muster window in the week of the timestamp
      let current = getEarliestMusterWindowTime(muster, timestamp);
      const durationSeconds = muster.durationMinutes * 60;
      // Loop through each day of the week
      let firstWindowStart: number = 0;
      let lastWindowStart: number = 0;
      for (let day = DaysOfTheWeek.Sunday; day <= DaysOfTheWeek.Saturday; day = nextDay(day)) {
        const end = current + durationSeconds;
        if (dayIsIn(day, muster.days)) {
          if (firstWindowStart === 0) {
            firstWindowStart = current;
          }
          lastWindowStart = current;
          const distanceToWindow = getDistanceToWindow(current, end, timestamp);
          // Pick the closest window, if one window ends and another starts on the same second as the timestamp, prefer
          // the window that is starting
          if (minDistance == null || timestamp === current || Math.abs(minDistance) > Math.abs(distanceToWindow)) {
            minDistance = distanceToWindow;
            closestMuster = muster;
            closestStart = current;
            closestEnd = end;
          }
        }
        current += oneDaySeconds;
      }
      if (firstWindowStart > timestamp || lastWindowStart! + durationSeconds < timestamp) {
        // If the timestamp is before the first window or after the last window, we need to compare with the
        // nearest window in the adjacent week
        const windowStart = firstWindowStart > timestamp ? lastWindowStart - oneDaySeconds * 7 : firstWindowStart + oneDaySeconds * 7;
        const windowEnd = windowStart + durationSeconds;
        const distanceToWindow = getDistanceToWindow(windowStart, windowEnd, timestamp);
        if (Math.abs(minDistance!) > Math.abs(distanceToWindow)) {
          closestMuster = muster;
          closestStart = windowStart;
          closestEnd = windowEnd;
        }
      }
    }

    res.json(closestMuster ? buildMusterWindow(unit, closestStart, closestEnd, closestMuster) : null);
  }

}

type GetIndividualsQuery = {
  interval: TimeInterval
  intervalCount: string
  unitId: number | null
} & PagedQuery;

type GetTrendsQuery = {
  weeksCount?: string
  monthsCount?: string
};

type GetClosedMusterWindowsQuery = {
  since: string
  until: string
};

type GetNearestMusterWindowQuery = {
  timestamp: string
};

export default new MusterController();
