import express, { Request } from 'express';
import { KibanaApi } from '../kibana/kibana-api';
import orgRoutes from './org';
import userRoutes from './user';
import roleRoutes from './role';
import rosterRoutes from './roster';
import unitRoutes from './unit';
import reingestRoutes from './reingest';
import accessRequestRoutes from './access-request';
import workspaceRoutes from './workspace';
import notificationRoutes from './notification';
import musterRoutes from './muster';
import reportRoutes from './report-schema';
import exportRoutes from './export';
import { User } from './user/user.model';
import { Org } from './org/org.model';
import { UserRole } from './user/user-role.model';
import { Workspace } from './workspace/workspace.model';

const router = express.Router();

router.use('/org', orgRoutes);
router.use('/user', userRoutes);
router.use('/role', roleRoutes);
router.use('/roster', rosterRoutes);
router.use('/unit', unitRoutes);
router.use('/access-request', accessRequestRoutes);
router.use('/workspace', workspaceRoutes);
router.use('/notification', notificationRoutes);
router.use('/muster', musterRoutes);
router.use('/report', reportRoutes);
router.use('/export', exportRoutes);
router.use('/reingest', reingestRoutes);

export interface ApiRequest<ReqParams = object, ReqBody = object, ReqQuery = object, ResBody = object> extends Request<ReqParams, ResBody, ReqBody, ReqQuery> {
  appUser: User,
  appOrg?: Org,
  appUserRole?: UserRole,
  appWorkspace?: Workspace,
  kibanaApi?: KibanaApi,
}

export type OrgParam = {
  orgId: string
};

export type OrgPrefixParam = {
  orgPrefix: string
};

export type RoleParam = {
  roleId: string
};

export type ReportParam = {
  reportId: string
};

export type EdipiParam = {
  edipi: string
};

export type RosterParam = {
  rosterId: string
};

export type WorkspaceParam = {
  workspaceId: string
};

export type UnitParam = {
  unitId: string
};

export type SettingParam = {
  settingId: string
};

export type ColumnNameParam = {
  columnName: string
};

export type OrgRoleParams = OrgParam & RoleParam;
export type OrgReportParams = OrgParam & ReportParam;
export type OrgEdipiParams = OrgParam & EdipiParam;
export type OrgRosterParams = OrgParam & RosterParam;
export type OrgWorkspaceParams = OrgParam & WorkspaceParam;
export type OrgUnitParams = OrgParam & UnitParam;
export type OrgSettingParams = OrgParam & SettingParam;
export type OrgColumnNameParams = OrgParam & ColumnNameParam;

export type PagedQuery = {
  limit: string
  page: string
};

export default router;
