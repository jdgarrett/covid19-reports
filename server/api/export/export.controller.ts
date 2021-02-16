import { SearchResponse } from 'elasticsearch';
import { Response } from 'express';
import { json2csvAsync } from 'json-2-csv';
import moment from 'moment';
import elasticsearch from '../../elasticsearch/elasticsearch';
import {
  ForbiddenError,
  InternalServerError,
} from '../../util/error-types';
import { Log } from '../../util/log';
import { getRosterMusterStats } from '../../util/muster-utils';
import {
  assertRequestQuery,
  TimeInterval,
} from '../../util/util';
import {
  ApiRequest,
  OrgParam,
  PagedQuery,
} from '../index';
import { RosterEntryData } from '../roster/roster.controller';
import { Roster } from '../roster/roster.model';

class ExportController {

  async exportOrgToCsv(req: ApiRequest<null, null, ExportOrgQuery>, res: Response) {
    if (!req.appWorkspace) {
      throw new ForbiddenError('You must be assigned to a workspace to export data.');
    }

    const startDate = moment(req.query.startDate ?? 0);
    const endDate = moment(req.query.endDate);

    //
    // Get ES data and stream to client.
    //
    const index = req.appUserRole!.getKibanaIndices();
    const scrollQueue = [] as SearchResponse<any>[];
    try {
      scrollQueue.push(await elasticsearch.search({
        index,
        size: 10000,
        body: {
          query: {
            bool: {
              must: [{
                range: {
                  Timestamp: {
                    gte: startDate.toISOString(),
                    lt: endDate.toISOString(),
                  },
                },
              }],
            },
          },
        },
        scroll: '30s', // Keep the results "scrollable" for 30 seconds (this will be reset on every scroll).
      }));
    } catch (err) {
      throw new InternalServerError(`Elasticsearch: ${err.message}`);
    }

    // Keep scrolling until we've sent all of the hits.
    let hitsSent = 0;
    while (scrollQueue.length) {
      const chunk = scrollQueue.shift()!;

      // Send the total hits before the first chunk so the client can calculate progress.
      const isFirstChunk = (hitsSent === 0);
      if (isFirstChunk) {
        res.header('total-hits', `${chunk.hits.total}`);
      }

      const sourceArray = chunk.hits.hits.map(hit => hit._source);

      const csvChunk = await json2csvAsync(sourceArray, {
        prependHeader: isFirstChunk,
        emptyFieldValue: '',
      });

      res.write(Buffer.from(csvChunk));

      hitsSent += chunk.hits.hits.length;
      if (hitsSent >= chunk.hits.total) {
        break;
      }

      // Get the next response.
      try {
        scrollQueue.push(await elasticsearch.scroll({
          scrollId: chunk._scroll_id!,
          scroll: '30s',
        }));
      } catch (err) {
        throw new Error(`Elasticsearch: ${err.message}`);
      }
    }

    res.end();
  }

  async exportRosterToCsv(req: ApiRequest, res: Response) {

    const orgId = req.appOrg!.id;

    const queryBuilder = await Roster.queryAllowedRoster(req.appOrg!, req.appUserRole!);
    const rosterData = await queryBuilder
      .orderBy({
        edipi: 'ASC',
      })
      .getRawMany<RosterEntryData>();

    // convert data to csv format and download
    let csv: string;
    try {
      csv = await json2csvAsync(rosterData);
    } catch (err) {
      Log.error('Failed to convert roster json data to CSV string.');
      throw new InternalServerError('Failed to export Roster data to CSV.');
    }

    const date = new Date().toISOString();
    const filename = `org_${orgId}_roster_export_${date}.csv`;
    res.header('Content-Type', 'text/csv');
    res.attachment(filename);
    res.send(csv);
  }

  async exportMusterIndividualsToCsv(req: ApiRequest<OrgParam, null, ExportMusterIndividualsQuery>, res: Response) {
    assertRequestQuery(req, [
      'interval',
      'intervalCount',
    ]);

    const interval = req.query.interval;
    const intervalCount = parseInt(req.query.intervalCount);

    const individuals = await getRosterMusterStats({
      org: req.appOrg!,
      userRole: req.appUserRole!,
      interval,
      intervalCount,
      unitId: req.query.unitId,
    });

    // Delete roster ids since they're meaningless to the user.
    for (const individual of individuals) {
      delete (individual as any).id;
    }

    const csv = await json2csvAsync(individuals);

    res.header('Content-Type', 'text/csv');
    res.attachment('muster-noncompliance.csv');
    res.send(csv);
  }

}

type ExportOrgQuery = {
  startDate?: string
  endDate?: string
};

type ExportMusterIndividualsQuery = {
  interval: TimeInterval
  intervalCount: string
  unitId?: number
} & PagedQuery;

export default new ExportController();
