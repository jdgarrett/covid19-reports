import {
  Entity,
  Column,
  BaseEntity,
  JoinColumn,
  ManyToOne,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Org } from '../org/org.model';

@Entity()
@Index(['org', 'name'], { unique: true })
export class Unit extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Org, org => org.id, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'org_id',
  })
  org?: Org;

  @Column()
  name!: string;

  @Column('json', {
    nullable: true,
  })
  musterConfiguration?: MusterConfiguration[];
}

export interface MusterConfiguration {
  days: number,
  startTime: string,
  timezone: string,
  durationMinutes: number,
  reportId: string,
}
