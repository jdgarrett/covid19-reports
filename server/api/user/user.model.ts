import {
  BeforeInsert, BeforeUpdate, Entity, PrimaryColumn, Column, BaseEntity, OneToMany, EntityManager,
} from 'typeorm';
import { NotFoundError } from '../../util/error-types';
import { Role } from '../role/role.model';
import { UserRole } from './user-role.model';
import { Unit } from '../unit/unit.model';

@Entity()
export class User extends BaseEntity {
  static internalUserEdipi = 'internal';

  @PrimaryColumn({
    length: 10,
  })
  edipi!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column()
  phone!: string;

  @Column()
  email!: string;

  @Column()
  service!: string;

  @Column({
    default: true,
  })
  enabled?: boolean;

  @Column({
    default: false,
  })
  rootAdmin?: boolean;

  @Column({
    default: false,
  })
  isRegistered?: boolean;

  @OneToMany(() => UserRole, userRole => userRole.user)
  userRoles!: UserRole[];

  @BeforeInsert()
  @BeforeUpdate()
  formatPhoneNumber() {
    const phone = this.phone.replace(/\D/g, '');
    if (phone.length === 10) {
      this.phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
    }
  }

  async addRole(manager: EntityManager, role: Role, units: Unit[], allUnits: boolean): Promise<User> {
    let userRole = await this.findUserRole(role);
    if (!userRole) {
      userRole = manager.create<UserRole>('UserRole', {
        user: this,
        role,
        units,
        allUnits,
      });
      this.userRoles.push(userRole);
      if (this.edipi !== User.internalUserEdipi) {
        await manager.save(userRole);
      }
    }
    return this;
  }

  async removeRole(manager: EntityManager, role?: Role, userRole?: UserRole): Promise<User> {
    if (role || userRole) {
      const found = userRole ?? await this.findUserRole(role!);
      if (found) {
        const index = this.userRoles.indexOf(found);
        this.userRoles.splice(index, 1);
        await manager.remove(found);
      } else if (role) {
        throw new NotFoundError(`Error removing role. User ${this.edipi} does not have role ${role.name}`);
      }
    }
    return this;
  }

  async changeRole(manager: EntityManager, orgId: number, role: Role, units: Unit[], allUnits: boolean): Promise<User> {
    if (!this.userRoles) {
      await this.refreshUserRoles();
    }
    const orgRole = this.userRoles.find(userRole => userRole.role.org!.id === orgId);
    if (!orgRole) {
      throw new NotFoundError('The user does not have a role in the given group.');
    }
    orgRole.role = role;
    orgRole.units = units;
    orgRole.allUnits = allUnits;
    await manager.save(orgRole);
    return this;
  }

  protected async refreshUserRoles() {
    if (!this.hasId()) {
      this.userRoles = [];
    } else {
      this.userRoles = await UserRole.find({
        relations: ['role', 'role.org'],
        where: {
          user: this,
        },
      });
    }
  }

  protected async findUserRole(role: Role): Promise<UserRole | undefined> {
    if (!this.userRoles) {
      await this.refreshUserRoles();
    }
    return this.userRoles.find(userRole => {
      return userRole.role.id === role.id;
    });
  }

  public isInternal() {
    return this.edipi === User.internalUserEdipi;
  }

  static internal() {
    const internalUser = new User();
    internalUser.edipi = User.internalUserEdipi;
    internalUser.firstName = 'Internal';
    internalUser.lastName = 'User';
    internalUser.email = 'internal@statusengine.com';
    internalUser.phone = '000-000-0000';
    internalUser.service = 'Space Force';
    internalUser.enabled = true;
    internalUser.isRegistered = true;
    internalUser.rootAdmin = true;
    internalUser.userRoles = [];

    return internalUser;
  }
}
