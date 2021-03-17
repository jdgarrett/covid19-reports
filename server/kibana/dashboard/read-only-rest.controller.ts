import { Response, NextFunction } from 'express';
import { ApiRequest } from '../../api';
import { User } from '../../api/user/user.model';
import { UserRole } from '../../api/user/user-role.model';
import { Workspace } from '../../api/workspace/workspace.model';
import config from '../../config';
import { Log } from '../../util/log';

const nJwt = require('njwt');

class ReadOnlyRestController {

  // Redirects user to Kibana login page. By attaching the rorJWT this will effectively log in the user seamlessly,
  // and store rorCookie in the browser.
  login(req: ApiRequest<null, null, LoginQuery>, res: Response) {
    Log.info('ror login()');

    const rorJwt = buildJWT(req.appUser, req.appUserRole!, req.appWorkspace!);
    Log.info('ror jwt', rorJwt);

    res.cookie('orgId', req.appOrg!.id, { httpOnly: true });
    res.cookie('dashboard', true, { httpOnly: true });

    let url = `${config.kibana.basePath}/login?jwt=${rorJwt}`;
    if (req.query.dashboardUuid) {
      url += `#/dashboard/${req.query.dashboardUuid}`;
    }

    return res.redirect(url);
  }

  // Logs out of a Kibana session by clearing the rorCookie.
  logout(req: ApiRequest, res: Response, next: NextFunction) {
    Log.info('ror logout()');
    clearCookies(res);
    next();
  }

  embed(req: ApiRequest<null, null, EmbedQuery>, res: Response) {
    if (req.cookies.dashboard) {
      clearCookies(res);
    }
    let url;
    if (req.cookies.rorCookie == null) {
      const rorJwt = buildJWT(req.appUser, req.appUserRole!, req.appWorkspace!);
      res.cookie('orgId', req.appOrg!.id, { httpOnly: true });
      if (req.query.visualizationUuid) {
        url = `${config.kibana.basePath}/login?jwt=${rorJwt}#/visualize/edit/${req.query.visualizationUuid}?embed=true`;
      } else {
        url = `${config.kibana.basePath}/login?jwt=${rorJwt}#/dashboard/${req.query.dashboardUuid}?embed=true`;
      }
    } else if (req.query.visualizationUuid) {
      url = `${config.kibana.basePath}/app/kibana#/visualize/edit/${req.query.visualizationUuid}?embed=true`;
    } else {
      url = `${config.kibana.basePath}/app/kibana#/dashboard/${req.query.dashboardUuid}?embed=true`;
    }
    return res.redirect(url);
  }

}

function clearCookies(res: Response) {
  res.clearCookie('rorCookie');
  res.clearCookie('dashboard');
  res.clearCookie('orgId');
}

// Builds ReadOnlyRest JWT token.
export function buildJWT(user: User, userRole: UserRole, workspace: Workspace) {
  Log.info('ror buildJWT()');

  const claims = {
    sub: user.edipi,
    iss: 'https://statusengine.mysymptoms.mil',
    roles: userRole.getKibanaRoles(),
    workspace_id: `${workspace!.id}`,
  };

  Log.info('ror claims', claims);

  const jwt = nJwt.create(claims, config.ror.secret);
  jwt.setExpiration(new Date().getTime() + (86400 * 1000 * 30)); // 30d

  return jwt.compact();
}

type LoginQuery = {
  dashboardUuid?: string
};

type EmbedQuery = {
  dashboardUuid?: string
  visualizationUuid?: string
};

export default new ReadOnlyRestController();
