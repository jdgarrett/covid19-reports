import bodyParser from 'body-parser';
import express from 'express';
import controller from './report-schema.controller';
import {
  requireOrgAccess,
  requireRolePermission,
} from '../../auth';

const router = express.Router() as any;

router.get(
  '/:orgId',
  requireOrgAccess,
  requireRolePermission(role => role.canManageGroup),
  controller.getOrgReports,
);

router.post(
  '/:orgId',
  bodyParser.json(),
  requireOrgAccess,
  requireRolePermission(role => role.canManageGroup),
  controller.addReport,
);

router.get(
  '/:orgId/:reportId',
  requireOrgAccess,
  requireRolePermission(role => role.canManageGroup),
  controller.getReport,
);

router.delete(
  '/:orgId/:reportId',
  requireOrgAccess,
  requireRolePermission(role => role.canManageGroup),
  controller.deleteReport,
);

router.put(
  '/:orgId/:reportId',
  bodyParser.json(),
  requireOrgAccess,
  requireRolePermission(role => role.canManageGroup),
  controller.updateReport,
);

export default router;
