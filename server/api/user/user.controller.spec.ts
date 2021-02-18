import { expect } from 'chai';
import { expectNoErrors } from '../../util/test-utils/expect';
import {
  seedOrgContactRoles,
  seedOrgContact,
} from '../../util/test-utils/seed';
import { TestRequest } from '../../util/test-utils/test-request';
import {
  uniqueEdipi,
  uniqueEmail,
  uniqueString,
} from '../../util/test-utils/unique';
import { seedAccessRequest } from '../access-request/access-request.mock';
import { AccessRequest } from '../access-request/access-request.model';
import { addUserToOrg } from '../org/org.model.mock';
import { seedUnit } from '../unit/unit.model.mock';
import { User } from './user.model';
import { seedUser } from './user.model.mock';

describe(`User Controller`, () => {

  const basePath = '/api/user';
  let req: TestRequest;

  beforeEach(() => {
    req = new TestRequest(basePath);
  });

  describe(`${basePath}/current : get`, () => {

    it(`gets the user whose edipi was in request`, async () => {
      const user = await seedUser();

      req.setUser(user);
      const res = await req.get('/current');

      expectNoErrors(res);
      expect(res.data).to.containSubset(user);
    });

  });

  describe(`${basePath} : post`, () => {

    it(`creates new user with supplied data`, async () => {
      const usersCountBefore = await User.count();

      const edipi = uniqueEdipi();
      req.setUser(edipi);
      const body = {
        firstName: uniqueString(),
        lastName: uniqueString(),
        phone: '1234567890',
        email: uniqueEmail(),
        service: 'Space Force',
      };
      const res = await req.post('/', body);

      expectNoErrors(res);
      expect(res.data.edipi).to.equal(edipi);
      const userEdipi = res.data.edipi;

      const userAfter = (await User.findOne(userEdipi))!;
      expect(userAfter).to.containSubset({
        ...body,
        edipi,
        phone: '123-456-7890',
      });

      expect(await User.count()).to.equal(usersCountBefore + 1);
    });

  });

  describe(`${basePath}/access-requests : get`, () => {

    it(`gets access requests that the user has issued`, async () => {
      const { org } = await seedOrgContact();
      const user = await seedUser();
      const accessRequest = await seedAccessRequest(user, org);

      const accessRequests = await AccessRequest.find({
        where: {
          user,
        },
      });
      expect(accessRequests).to.have.lengthOf(1);

      req.setUser(user);
      const res = await req.get('/access-requests');

      expectNoErrors(res);
      expect(res.data).to.be.array();
      expect(res.data).to.have.lengthOf(1);
      expect(res.data[0]).to.containSubset({
        id: accessRequest.id,
        org,
        requestDate: accessRequest.requestDate.toISOString(),
        status: accessRequest.status,
      });
    });

  });

  describe(`${basePath}/:orgId : post`, () => {

    it(`updates user role and name`, async () => {
      const { org, contact, roleUser, roleAdmin } = await seedOrgContactRoles();
      const unit = await seedUnit(org);
      const user = await seedUser();
      await addUserToOrg(user, roleUser);

      const userBefore = (await User.findOne(user.edipi, {
        relations: [
          'userRoles',
          'userRoles.role',
        ],
      }))!;
      expect(userBefore.userRoles).to.have.lengthOf(1);
      expect(userBefore.userRoles[0].role.id).to.equal(roleUser.id);

      const userCountBefore = await User.count();

      req.setUser(contact);
      const body = {
        edipi: user.edipi,
        role: roleAdmin.id,
        firstName: uniqueString(),
        lastName: uniqueString(),
        unitFilter: unit.id,
      };
      const res = await req.post(`/${org.id}`, body);

      expectNoErrors(res);

      const userAfter = (await User.findOne(user.edipi, {
        relations: [
          'userRoles',
          'userRoles.role',
        ],
      }))!;
      expect(userAfter.userRoles).to.have.lengthOf(1);
      expect(userAfter.userRoles[0].role.id).to.equal(roleAdmin.id);
      expect(userAfter.firstName).to.equal(body.firstName);
      expect(userAfter.lastName).to.equal(body.lastName);

      const units = await userAfter.userRoles[0].getUnits();
      expect(units).to.have.lengthOf(1);
      expect(units[0].id).to.equal(unit.id);

      expect(await User.count()).to.equal(userCountBefore);
    });

  });

  describe(`${basePath}/:orgId : get`, () => {

    it(`gets the users in the org`, async () => {
      const { contact, org, roleUser } = await seedOrgContactRoles();
      const user = await seedUser();
      await addUserToOrg(user, roleUser);

      req.setUser(contact);
      const res = await req.get(`/${org.id}`);

      expectNoErrors(res);
      expect(res.data).to.be.array();
      expect(res.data).to.have.lengthOf(2);
      const dataEdipis = res.data.map((x: User) => x.edipi);
      expect(dataEdipis).to.include.members([contact.edipi, user.edipi]);
    });

  });

  describe(`${basePath}/:orgId/:edipi : delete`, () => {

    it(`removed the user from the org`, async () => {
      const { contact, org, roleUser } = await seedOrgContactRoles();
      const user = await seedUser();
      await addUserToOrg(user, roleUser);

      let orgUsers = await org.getUsers();
      expect(orgUsers).to.have.lengthOf(2);
      let orgUsersEdipis = orgUsers.map((x: User) => x.edipi);
      expect(orgUsersEdipis).to.include(user.edipi);

      req.setUser(contact);
      const res = await req.delete(`/${org.id}/${user.edipi}`);

      expectNoErrors(res);

      orgUsers = await org.getUsers();
      expect(orgUsers).to.have.lengthOf(1);
      orgUsersEdipis = orgUsers.map((x: User) => x.edipi);
      expect(orgUsersEdipis).not.to.include(user.edipi);
    });

  });

});
