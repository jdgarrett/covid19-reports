import { Response } from 'express';
import { ApiRequest, OrgParam, OrgReportParams } from '../index';
import { BadRequestError, NotFoundError } from '../../util/error-types';
import { ReportSchema, SchemaColumn } from './report-schema.model';

class ReportSchemaController {

  async getOrgReports(req: ApiRequest, res: Response) {
    if (!req.appOrg || !req.appUserRole) {
      throw new NotFoundError('Organization was not found.');
    }

    const reports = await ReportSchema.find({
      where: {
        org: req.appOrg.id,
      },
      order: {
        id: 'ASC',
      },
    });

    res.json(reports);
  }

  async addReport(req: ApiRequest<OrgParam, ReportBody>, res: Response) {
    if (!req.appOrg) {
      throw new NotFoundError('Organization was not found.');
    }

    if (!req.body.id) {
      throw new BadRequestError('An ID must be supplied when adding a report type.');
    }

    if (!req.body.name) {
      throw new BadRequestError('A name must be supplied when adding a report type.');
    }

    if (!req.body.columns) {
      throw new BadRequestError('A schema must be supplied when adding a report type.');
    }

    const report = new ReportSchema();
    report.id = req.body.id;
    report.org = req.appOrg;
    await setReportFromBody(report, req.body);

    const newReport = await report.save();

    res.status(201).json(newReport);
  }

  async getReport(req: ApiRequest<OrgReportParams>, res: Response) {
    if (!req.appOrg) {
      throw new NotFoundError('Organization was not found.');
    }

    const report = await ReportSchema.findOne({
      relations: ['org'],
      where: {
        id: req.params.reportId,
        org: req.appOrg.id,
      },
    });

    if (!report) {
      throw new NotFoundError('Report could not be found.');
    }

    res.json(report);
  }

  async deleteReport(req: ApiRequest<OrgReportParams>, res: Response) {
    if (!req.appOrg) {
      throw new NotFoundError('Organization was not found.');
    }

    const report = await ReportSchema.findOne({
      where: {
        id: req.params.reportId,
        org: req.appOrg.id,
      },
    });

    if (!report) {
      throw new NotFoundError('Report could not be found.');
    }

    const removedReport = await report.remove();
    res.json(removedReport);
  }

  async updateReport(req: ApiRequest<OrgReportParams, ReportBody>, res: Response) {
    if (!req.appOrg) {
      throw new NotFoundError('Organization was not found.');
    }

    const report = await ReportSchema.findOne({
      where: {
        id: req.params.reportId,
        org: req.appOrg.id,
      },
    });

    if (!report) {
      throw new NotFoundError('Report could not be found.');
    }

    await setReportFromBody(report, req.body);

    const updatedReport = await report.save();

    res.json(updatedReport);
  }

}

async function setReportFromBody(report: ReportSchema, body: ReportBody) {
  if (body.name != null) {
    report.name = body.name;
  }

  if (body.columns != null) {
    report.columns = body.columns;
  }
}

type ReportBody = {
  id?: string
  name?: string
  columns?: SchemaColumn[]
};

export default new ReportSchemaController();
