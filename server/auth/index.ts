import { Request, Response, NextFunction } from 'express';
import {
  ApiRequest,
  OrgParam,
} from '../api';
import { UserRole } from '../api/user/user-role.model';
import { User } from '../api/user/user.model';
import { Role } from '../api/role/role.model';
import { env } from '../util/env';
import {
  BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError,
} from '../util/error-types';
import { Org } from '../api/org/org.model';
import { TestRequest } from '../util/test-utils/test-request';

const sslHeader = 'ssl-client-subject-dn';
const internalAccessHeader = 'status-engine-internal-access-key';

export async function requireUserAuth(req: AuthRequest, res: Response, next: NextFunction) {
  let id: string | undefined;

  if (req.header(sslHeader)) {
    const certificateContents = req.header(sslHeader);
    const commonName = certificateContents ? certificateContents.match(/CN=.+\.[0-9]{10}\b/ig) : null;
    if (commonName && commonName.length > 0) {
      id = commonName[0].substr(commonName[0].lastIndexOf('.') + 1, commonName[0].length);
    }
  } else if (req.header(internalAccessHeader)
    && process.env.INTERNAL_ACCESS_KEY === req.header(internalAccessHeader)) {
    id = User.internalUserEdipi;
  } else if (env.isDev) {
    id = process.env.USER_EDIPI;
  } else if (env.isTest) {
    id = req.header(TestRequest.edipiHeader);
  }

  if (!id) {
    throw new UnauthorizedError('Client not authorized.', true);
  }

  let user: User | undefined;

  if (id === User.internalUserEdipi) {
    user = User.internal();
  } else {
    user = await User.findOne({
      relations: [
        'userRoles',
        'userRoles.role',
        'userRoles.role.org',
        'userRoles.role.workspace',
        'userRoles.role.org.contact',
        'userRoles.units',
        'userRoles.units.org',
        'userRoles.user',
      ],
      where: {
        edipi: id,
      },
      cache: {
        id: 'user_auth',
        milliseconds: 30000,
      },
    });
  }

  if (user?.rootAdmin) {
    user.userRoles = (await Org.find()).map(org => UserRole.admin(org, user!));
  }

  if (!user) {
    user = User.create({
      edipi: id,
    });
  }

  req.appUser = user;

  next();
}

export async function requireInternalUser(req: ApiRequest, res: Response, next: NextFunction) {
  if (req.appUser.isInternal()) {
    return next();
  }
  throw new ForbiddenError('User does not have sufficient privileges to perform this action.');
}

export async function requireRegisteredUser(req: ApiRequest, res: Response, next: NextFunction) {
  if (req.appUser.isRegistered) {
    return next();
  }
  throw new ForbiddenError('User is not registered.');
}

export async function requireRootAdmin(req: ApiRequest, res: Response, next: NextFunction) {
  if (req.appUser.rootAdmin) {
    return next();
  }
  throw new ForbiddenError('User does not have sufficient privileges to perform this action.');
}

export async function requireOrgAccess(reqAny: any, res: Response, next: NextFunction) {
  // HACK: For some reason express won't let us use ApiRequest here, so just cast it afterward for now. We should make
  //       another pass on the core express types to get this working properly.
  const req = reqAny as ApiRequest<OrgParam, null, { orgId?: string }>;

  let orgId: number | undefined;
  if (req.params.orgId) {
    orgId = parseInt(req.params.orgId);
  } else if (req.query.orgId) {
    orgId = parseInt(req.query.orgId);
  } else if (req.cookies.orgId) {
    orgId = parseInt(req.cookies.orgId);
  }
  if (orgId == null) {
    throw new BadRequestError('Missing organization id.');
  }
  if (Number.isNaN(orgId) || orgId < 0) {
    throw new BadRequestError(`Invalid organization id: ${orgId}`);
  }
  const user: User = req.appUser;
  if (orgId && user) {
    const orgUserRole = user.userRoles.find(userRole => userRole.role.org!.id === orgId);
    if (orgUserRole) {
      req.appOrg = orgUserRole.role.org;
      req.appUserRole = orgUserRole;
      req.appWorkspace = orgUserRole.role.workspace || undefined;
    } else if (user.rootAdmin) {
      const org = await Org.findOne({
        where: {
          id: orgId,
        },
      });
      if (org) {
        req.appOrg = org;
        req.appUserRole = UserRole.admin(org, user);
      } else {
        throw new NotFoundError('Organization was not found.');
      }
    }
  }
  if (req.appOrg) {
    return next();
  }
  throw new ForbiddenError('User does not have sufficient privileges to perform this action.');
}

export function requireWorkspaceAccess(reqAny: any, res: Response, next: NextFunction) {
  // HACK: For some reason express won't let us use ApiRequest here, so just cast it afterward for now. We should make
  //       another pass on the core express types to get this working properly.
  const req = reqAny as ApiRequest;

  if (req.appWorkspace) {
    return next();
  }
  throw new ForbiddenError('User does not have sufficient privileges to perform this action.');
}

export function requireRolePermission(action: (role: Role) => boolean) {
  return async (req: ApiRequest, res: Response, next: NextFunction) => {
    if (req.appUserRole && action(req.appUserRole.role)) {
      return next();
    }
    throw new ForbiddenError('User does not have sufficient privileges to perform this action.');
  };
}

type AuthRequest = {
  appUser?: User
} & Request;
