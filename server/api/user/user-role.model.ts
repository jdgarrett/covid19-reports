import {
  Entity,
  BaseEntity,
  ManyToOne,
  PrimaryGeneratedColumn,
  ManyToMany,
  JoinTable,
  Column,
} from 'typeorm';
import { Org } from '../org/org.model';
import { Role } from '../role/role.model';
import { User } from './user.model';
import { Unit } from '../unit/unit.model';

@Entity()
export class UserRole extends BaseEntity {

  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, user => user.userRoles, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  user!: User;

  @ManyToOne(() => Role, role => role.userRoles, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  role!: Role;

  @ManyToMany(() => Unit, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'user_role_unit',
    joinColumn: {
      name: 'user_role',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'unit',
      referencedColumnName: 'id',
    },
  })
  units!: Unit[];

  @Column({
    default: false,
  })
  allUnits: boolean = false;

  async getUnits() {
    if (this.allUnits) {
      return Unit.find({
        relations: ['org'],
        where: {
          org: this.role.org!.id,
        },
      });
    }
    return this.units;
  }

  async getUnit(unitId: number) {
    if (this.allUnits) {
      return Unit.findOne({
        relations: ['org'],
        where: {
          id: unitId,
          org: this.role.org!.id,
        },
      });
    }
    return this.units.find(unit => unit.id === unitId);
  }

  getKibanaIndices() {
    if (this.user.rootAdmin) {
      return ['*'];
    }
    const suffix = this.role.canViewPHI ? 'phi' : (this.role.canViewPII ? 'pii' : 'base');
    if (this.allUnits) {
      return [this.buildIndexPattern('*', suffix)];
    }
    return this.units.map(unit => this.buildIndexPattern(`${unit.id}`, suffix));
  }

  getKibanaIndicesForMuster(unitId?: number) {
    if (unitId) {
      return [this.buildIndexPattern(`${unitId}`, 'phi')];
    }
    if (this.allUnits) {
      return [this.buildIndexPattern('*', 'phi')];
    }
    return this.units.map(unit => this.buildIndexPattern(`${unit.id}`, 'phi'));
  }

  buildIndexPattern(unitId: string, suffix: string) {
    return `${this.role.org!.indexPrefix}-${unitId}-${suffix}-*`;
  }

  getKibanaRoles() {
    if (this.role.canManageWorkspace) {
      return 'kibana_admin';
    }
    return 'kibana_ro_strict';
  }

  static admin(org: Org, user: User) {
    const userRole = new UserRole();
    userRole.id = 0;
    userRole.user = user;
    userRole.role = Role.admin(org);
    userRole.allUnits = true;
    return userRole;
  }

}
