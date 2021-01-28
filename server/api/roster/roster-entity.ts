import {
  BaseEntity, Column, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { CustomColumns, RosterColumnInfo, RosterColumnType } from './roster.types';
import { Unit } from '../unit/unit.model';

export class RosterEntity extends BaseEntity {

  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Unit, unit => unit.id, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  unit!: Unit;

  @Column({
    length: 10,
  })
  edipi!: string;

  @Column({
    length: 100,
  })
  firstName!: string;

  @Column({
    length: 100,
  })
  lastName!: string;

  @Column('json', {
    nullable: false,
    default: '{}',
  })
  customColumns!: CustomColumns;

  getColumnValue(column: RosterColumnInfo) {
    if (column.custom) {
      return this.customColumns[column.name] || null;
    }
    return Reflect.get(this, column.name) || null;
  }
}

export const baseRosterColumns: RosterColumnInfo[] = [
  {
    name: 'edipi',
    displayName: 'EDIPI',
    type: RosterColumnType.String,
    pii: true,
    phi: false,
    custom: false,
    required: true,
    updatable: false,
  }, {
    name: 'firstName',
    displayName: 'First Name',
    type: RosterColumnType.String,
    pii: true,
    phi: false,
    custom: false,
    required: true,
    updatable: true,
  }, {
    name: 'lastName',
    displayName: 'Last Name',
    type: RosterColumnType.String,
    pii: true,
    phi: false,
    custom: false,
    required: true,
    updatable: true,
  },
];
