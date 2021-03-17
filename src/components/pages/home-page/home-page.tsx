import React from 'react';
import { useSelector } from 'react-redux';
import {
  Card,
  CardContent,
  Container,
  Grid,
  Typography,
} from '@material-ui/core';
import { UserSelector } from '../../../selectors/user.selector';
import { Link } from '../../link/link';
import { UserState } from '../../../reducers/user.reducer';
import { AppState } from '../../../store';
import useStyles from './home-page.styles';
import welcomeImage from '../../../media/images/welcome-image.png';

export const HomePage = () => {
  const user = useSelector<AppState, UserState>(state => state.user);
  const orgId = useSelector(UserSelector.orgId);
  const classes = useStyles();

  return (
    <main className={classes.root}>
      <Container maxWidth="md">
        <Grid container spacing={3}>
          <Grid item xs={12}>
            {/* Welcome */}
            <Card className={classes.card}>
              <CardContent>
                <Grid container direction="row">
                  <Grid item xs={8}>
                    <Typography variant="h5" gutterBottom>
                      Welcome to Status Engine!
                    </Typography>

                    <Typography gutterBottom>
                      With Status Engine you can easily monitor COVID-19 cases across your entire organization. If you
                      have any questions, comments or concerns please reach out to us by email at&nbsp;
                      <Link href="mailto:covid19feedback@dds.mil" target="_blank">covid19feedback@dds.mil</Link>.
                    </Typography>

                    <iframe
                      title="kibana-embed"
                      src="/dashboard/embed?orgId=1&dashboardUuid=1c7a8120-f446-11ea-82b7-4bc5055cc562"
                      height="600"
                      width="800"
                    />
                    <iframe
                      title="kibana-embed"
                      src="/dashboard/embed?orgId=1&visualizationUuid=e292ffd0-2863-11eb-aa43-cf97fefcff0e"
                      height="600"
                      width="800"
                    />
                    <ul>
                      {user.activeRole?.role.canViewRoster && (
                        <li>
                          <Typography>
                            <strong><Link to="/roster">Roster Management</Link></strong><br />
                            Manage your organization&apos;s roster with the built-in suite of tools designed to allow for
                            quick and easy modifications.
                          </Typography>
                        </li>
                      )}
                      {user.activeRole?.role.canViewMuster && (
                        <li>
                          <Typography>
                            <strong><Link to="/muster">Muster Snapshot</Link></strong><br />
                            Track your group&apos;s daily muster compliance, view weekly and monthly trends, as well as
                            export data.
                          </Typography>
                        </li>
                      )}
                      {user.activeRole?.role.workspace && (
                        <li>
                          <Typography>
                            <strong><Link href={`/dashboard?orgId=${orgId}`}>Customizable Dashboards</Link></strong><br />
                            Protect sensitive data by creating and assigning role-based permissions across the entire
                            organization.
                          </Typography>
                        </li>
                      )}
                      <li>
                        <Typography>
                          <strong><Link to="/settings">Alerts &amp; Notifications</Link></strong><br />
                          Stay up-to-date on organization activity without overburdening your inbox or mobile device
                          with fully customizable alerts.
                        </Typography>
                      </li>
                    </ul>
                  </Grid>

                  <Grid item xs={4}>
                    <img src={welcomeImage} height="300" alt="Welcome" />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </main>
  );
};
