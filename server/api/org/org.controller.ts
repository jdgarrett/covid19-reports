import { Response } from 'express';
import { getConnection, Like } from 'typeorm';
import {
  ApiRequest,
  OrgParam,
  OrgPrefixParam,
} from '../index';
import { User } from '../user/user.model';
import { Org } from './org.model';
import {
  BadRequestError,
  NotFoundError,
} from '../../util/error-types';
import { MusterConfiguration } from '../unit/unit.model';
import { defaultReportScehmas, ReportSchema } from '../report-schema/report-schema.model';

class OrgController {

  async getOrgList(req: ApiRequest<Partial<OrgPrefixParam>>, res: Response) {
    if (!req.appUser.isRegistered) {
      throw new BadRequestError('User is not registered');
    }

    const orgs = await Org.find({
      relations: ['contact'],
      ...(req.params.orgPrefix && {
        where: {
          name: Like(`${req.params.orgPrefix}%`),
        },
      }),
    });

    res.json(orgs);
  }

  async getOrg(req: ApiRequest, res: Response) {
    if (!req.appOrg) {
      throw new NotFoundError('Organization was not found');
    }

    res.json(req.appOrg);
  }

  async addOrg(req: ApiRequest<null, AddOrgBody>, res: Response) {
    if (!req.body.name) {
      throw new BadRequestError('An organization name must be supplied when adding an organization.');
    }

    if (!req.body.description) {
      throw new BadRequestError('An organization description must be supplied when adding an organization.');
    }

    const contact = await User.findOne(req.body.contactEdipi);
    if (!contact) {
      throw new NotFoundError('Contact user was not found.');
    }

    const org = new Org();
    org.name = req.body.name;
    org.description = req.body.description;
    org.contact = contact;
    org.reportingGroup = req.body.reportingGroup;

    let newOrg = undefined as Org | undefined;
    await getConnection().transaction(async manager => {
      newOrg = await manager.save(org);

      // Write default report schemas
      for (const schema of defaultReportScehmas) {
        const reportSchema = ReportSchema.create({
          ...schema,
          org: newOrg,
        });
        await manager.save(reportSchema);
      }
    });

    await res.status(201).json(newOrg);
  }

  async deleteOrg(req: ApiRequest, res: Response) {
    if (!req.appOrg) {
      throw new NotFoundError('Organization could not be found.');
    }

    const removedOrg = await req.appOrg.remove();

    res.json(removedOrg);
  }

  async updateOrg(req: ApiRequest<OrgParam, OrgBody>, res: Response) {
    const name = req.body.name;
    const description = req.body.description;
    const reportingGroup = req.body.reportingGroup;

    if (!req.appOrg) {
      throw new NotFoundError('Organization could not be found.');
    }

    if (name) {
      req.appOrg.name = name;
    }

    if (description) {
      req.appOrg.description = description;
    }

    if (reportingGroup) {
      req.appOrg.reportingGroup = reportingGroup;
    }

    const updatedOrg = await req.appOrg.save();

    res.json(updatedOrg);
  }

  async updateOrgDefaultMuster(req: ApiRequest<OrgParam, UpdateOrgDefaultMusterBody>, res: Response) {
    const defaultMusterConfiguration = req.body.defaultMusterConfiguration;

    req.appOrg!.defaultMusterConfiguration = defaultMusterConfiguration ?? [];

    const updatedOrg = await req.appOrg!.save();

    res.json(updatedOrg);
  }

}

type OrgBody = {
  name?: string
  description?: string
  reportingGroup?: string
};

type AddOrgBody = OrgBody & {
  contactEdipi: string
};

type UpdateOrgDefaultMusterBody = {
  defaultMusterConfiguration: MusterConfiguration[]
};

export default new OrgController();
