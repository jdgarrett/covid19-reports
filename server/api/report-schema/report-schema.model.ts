import {
  Entity,
  Column,
  BaseEntity,
  PrimaryColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Org } from '../org/org.model';

@Entity()
export class ReportSchema extends BaseEntity {

  @PrimaryColumn()
  id!: string;

  @ManyToOne(() => Org, {
    primary: true,
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({
    name: 'org_id',
  })
  org?: Org;

  @Column({
    length: 256,
  })
  name!: string;

  @Column('json', {
    nullable: false,
    default: '[]',
  })
  columns: SchemaColumn[] = [];
}

export interface SchemaColumn {
  keyPath: string[]
  type: string
  otherField?: boolean
  pii: boolean
  phi: boolean
}

export const defaultReportScehmas: Partial<ReportSchema>[] = [{
  id: 'es6ddssymptomobs',
  name: 'Symptom Observation Report',
  columns: [
    {
      keyPath: ['EDIPI'],
      type: 'string',
      pii: true,
      phi: false,
    }, {
      keyPath: ['ID'],
      type: 'string',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Timestamp'],
      type: 'date',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Score'],
      type: 'long',
      pii: true,
      phi: true,
    }, {
      keyPath: ['API', 'Stage'],
      type: 'string',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Browser', 'TimeZone'],
      type: 'string',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Category'],
      type: 'string',
      pii: true,
      phi: true,
    }, {
      keyPath: ['Client', 'Application'],
      type: 'string',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Client', 'Environment'],
      type: 'string',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Client', 'GitCommit'],
      type: 'string',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Client', 'Origin'],
      type: 'string',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Details', 'Affiliation'],
      type: 'string',
      pii: false,
      phi: false,
      otherField: true,
    }, {
      keyPath: ['Details', 'City'],
      type: 'string',
      pii: true,
      phi: false,
      otherField: true,
    }, {
      keyPath: ['Details', 'ConditionState'],
      type: 'string',
      pii: true,
      phi: true,
    }, {
      keyPath: ['Details', 'Conditions'],
      type: 'string',
      pii: true,
      phi: true,
    }, {
      keyPath: ['Details', 'Confirmed'],
      type: 'long',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Details', 'Exposures'],
      type: 'string',
      pii: true,
      phi: true,
    }, {
      keyPath: ['Details', 'Installation'],
      type: 'string',
      pii: true,
      phi: false,
      otherField: true,
    }, {
      keyPath: ['Details', 'Location'],
      type: 'string',
      pii: true,
      phi: false,
      otherField: true,
    }, {
      keyPath: ['Details', 'Lodging'],
      type: 'string',
      pii: true,
      phi: false,
      otherField: true,
    }, {
      keyPath: ['Details', 'Medications'],
      type: 'string',
      pii: true,
      phi: true,
    }, {
      keyPath: ['Details', 'PhoneNumber'],
      type: 'string',
      pii: true,
      phi: false,
    }, {
      keyPath: ['Details', 'ROM'],
      type: 'long',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Details', 'ROMContact'],
      type: 'string',
      pii: true,
      phi: false,
    }, {
      keyPath: ['Details', 'ROMStartDate'],
      type: 'string',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Details', 'ROMSupport'],
      type: 'long',
      pii: false,
      phi: false,
    }, {
      keyPath: ['Details', 'RoomNumber'],
      type: 'string',
      pii: true,
      phi: false,
    }, {
      keyPath: ['Details', 'Ship'],
      type: 'string',
      pii: true,
      phi: false,
      otherField: true,
    }, {
      keyPath: ['Details', 'SpO2Percent'],
      type: 'float',
      pii: true,
      phi: true,
    }, {
      keyPath: ['Details', 'Symptoms'],
      type: 'string',
      pii: true,
      phi: true,
    }, {
      keyPath: ['Details', 'TalkToSomeone'],
      type: 'long',
      pii: true,
      phi: true,
    }, {
      keyPath: ['Details', 'TemperatureFahrenheit'],
      type: 'float',
      pii: true,
      phi: true,
    }, {
      keyPath: ['Details', 'TentOrBillet'],
      type: 'string',
      pii: true,
      phi: false,
    }, {
      keyPath: ['Details', 'Unit'],
      type: 'string',
      pii: true,
      phi: false,
      otherField: true,
    }, {
      keyPath: ['Model', 'Version'],
      type: 'string',
      pii: false,
      phi: false,
    }],
}];
