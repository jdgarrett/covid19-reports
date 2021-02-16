import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MusterConfiguration } from '../unit/unit.model';
import { User } from '../user/user.model';

@Entity()
export class Org extends BaseEntity {

  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    length: 200,
  })
  name!: string;

  @Column({
    length: 2048,
  })
  description!: string;

  @Column({
    default: '',
  })
  indexPrefix!: string;

  @Column({
    nullable: true,
  })
  reportingGroup?: string;

  @ManyToOne(() => User, user => user.edipi, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({
    name: 'contact_id',
  })
  contact?: User;

  @Column('json', {
    nullable: false,
    default: '[]',
  })
  defaultMusterConfiguration: MusterConfiguration[] = [];

  getUsers() {
    return User.createQueryBuilder('user')
      .leftJoinAndSelect('user.userRoles', 'userRoles')
      .leftJoinAndSelect('userRoles.role', 'role')
      .leftJoinAndSelect('userRoles.units', 'units')
      .where('role.org_id = :orgId', {
        orgId: this.id,
      })
      .orderBy('edipi', 'ASC')
      .getMany();
  }

}
