import { DaysOfTheWeek } from '../utility/days';

export interface ApiArrayPaginated {
  rows: any[],
  totalRowsCount: number,
}

export interface ApiOrg {
  id: number,
  name: string,
  description: string,
  indexPrefix: string,
  contact?: ApiUser,
  defaultMusterConfiguration: MusterConfiguration[],
}

export interface ApiRole {
  id: number,
  org?: ApiOrg,
  workspace?: ApiWorkspace,
  name: string,
  description: string,
  allowedRosterColumns: string[],
  allowedNotificationEvents: string[],
  canManageGroup: boolean,
  canManageRoster: boolean,
  canManageWorkspace: boolean,
  canViewRoster: boolean,
  canViewMuster: boolean,
  canViewPII: boolean,
  canViewPHI: boolean,
}

export interface ApiUserRole {
  id: number,
  role: ApiRole,
  user: ApiUser,
  units: ApiUnit[],
  allUnits: boolean,
}

export interface ApiUser {
  edipi: string,
  firstName: string,
  lastName: string,
  service: string,
  phone: string,
  email: string,
  userRoles?: ApiUserRole[],
  rootAdmin: boolean,
  isRegistered: boolean,
}

export interface ApiAccessRequest {
  id: number,
  org: ApiOrg,
  requestDate: Date,
  user: ApiUser,
  status: 'approved' | 'pending' | 'denied',
}

export interface ApiRosterPaginated extends ApiArrayPaginated {
  rows: ApiRosterEntry[],
}

export enum ApiRosterColumnType {
  String = 'string',
  Number = 'number',
  Date = 'date',
  DateTime = 'datetime',
  Boolean = 'boolean',
  Enum = 'enum',
}

export function rosterColumnTypeDisplayName(type: ApiRosterColumnType) {
  switch (type) {
    case ApiRosterColumnType.Boolean:
      return 'Yes/No';
    case ApiRosterColumnType.Number:
      return 'Number';
    case ApiRosterColumnType.String:
      return 'Text';
    case ApiRosterColumnType.Enum:
      return 'Option';
    case ApiRosterColumnType.Date:
      return 'Date';
    case ApiRosterColumnType.DateTime:
      return 'Date and Time';
    default:
      return 'Unknown';
  }
}

export interface ApiNotification {
  id: string;
  name: string;
  description: string;
  settingsTemplate: string;
  defaultThreshold: number;
  defaultMaxDailyCount: number;
  defaultMinMinutesBetweenAlerts: number;
}

export interface ApiUserNotificationSetting {
  id: number;
  notificationId: string;
  threshold: number;
  minMinutesBetweenAlerts: number;
  maxDailyCount: number;
  smsEnabled: boolean;
  emailEnabled: boolean;
}

export interface ColumnInfo {
  name: string
  displayName: string
}

export interface ApiRosterCustomColumnConfig {}

export interface ApiRosterStringColumnConfig extends ApiRosterCustomColumnConfig {
  multiline?: boolean
}

export type ApiRosterEnumColumnConfigOption = { id: string, label: string };

export interface ApiRosterEnumColumnConfig extends ApiRosterCustomColumnConfig {
  options?: ApiRosterEnumColumnConfigOption[]
}

export interface ApiRosterColumnInfo extends ColumnInfo {
  type: ApiRosterColumnType,
  pii: boolean,
  phi: boolean,
  custom: boolean,
  required: boolean,
  updatable: boolean,
  config: ApiRosterCustomColumnConfig,
}

export interface ApiRosterEntry {
  id: number,
  unit: number,
  [key: string]: string | boolean | number | null,
}

export interface ApiWorkspaceTemplate {
  id: number,
  name: string,
  description: string,
  pii: boolean,
  phi: boolean,
}

export interface ApiWorkspace {
  id: number,
  name: string,
  description: string,
  org?: ApiOrg,
  workspaceTemplate?: ApiWorkspaceTemplate,
  pii: boolean,
  phi: boolean,
}

export interface ApiUnitStatsByDate {
  [date: string]: {
    [unitName: string]: {
      mustersReported: number
      mustersNotReported: number
      nonMusterPercent: number
    }
  }
}

export interface ApiMusterIndividuals extends ApiArrayPaginated {
  rows: ApiRosterEntry[]
}

export interface ApiMusterTrends {
  weekly: ApiUnitStatsByDate
  monthly: ApiUnitStatsByDate
}

export interface MusterConfiguration {
  days: DaysOfTheWeek,
  startTime: string,
  timezone: string,
  durationMinutes: number,
}

export interface ApiUnit {
  id: number,
  name: string,
  org?: ApiOrg,
  musterConfiguration?: MusterConfiguration[],
}

export interface ApiError {
  errors: {
    message: string
    type: string
  }[]
}
