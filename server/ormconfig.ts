import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AccessRequest } from './api/access-request/access-request.model';
import { Org } from './api/org/org.model';
import { Role } from './api/role/role.model';
import { RosterHistory } from './api/roster/roster-history.model';
import { Roster } from './api/roster/roster.model';
import { User } from './api/user/user.model';
import { Unit } from './api/unit/unit.model';
import { Workspace } from './api/workspace/workspace.model';
import { ReportSchema } from './api/report-schema/report-schema.model';
import { WorkspaceTemplate } from './api/workspace/workspace-template.model';
import { CustomRosterColumn } from './api/roster/custom-roster-column.model';
import { Notification } from './api/notification/notification.model';
import { UserNotificationSetting } from './api/notification/user-notification-setting.model';
import { UserRole } from './api/user/user-role.model';
import { env } from './util/env';

export const ormConfig: PostgresConnectionOptions = {
  type: 'postgres',
  host: process.env.SQL_HOST || 'localhost',
  port: parseInt(process.env.SQL_PORT || '5432'),
  username: process.env.SQL_USER || 'postgres',
  password: process.env.SQL_PASSWORD || 'postgres',
  database: process.env.SQL_DATABASE || 'dds',
  entities: [
    UserRole,
    User,
    Role,
    Org,
    RosterHistory,
    Roster,
    AccessRequest,
    Unit,
    Workspace,
    ReportSchema,
    WorkspaceTemplate,
    CustomRosterColumn,
    Notification,
    UserNotificationSetting,
  ],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: (env.isDev && process.env.SYNC_DATABASE === 'true'),
  logging: false,
  cache: (process.env.TYPEORM_CACHE)
    ? (process.env.TYPEORM_CACHE === 'true')
    : true,
};
