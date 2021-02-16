import {
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  MenuItem,
  Paper,
  Select,
  Table,
  TableContainer,
  TableFooter,
  TableRow,
  Typography,
} from '@material-ui/core';
import ToggleButtonGroup from '@material-ui/lab/ToggleButtonGroup';
import ToggleButton from '@material-ui/lab/ToggleButton';
import * as Plotly from 'plotly.js';
import React, {
  ChangeEvent, MouseEvent, useCallback, useEffect, useState,
} from 'react';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import Plot from 'react-plotly.js';
import _ from 'lodash';
import moment from 'moment';
import { AppFrame } from '../../../actions/app-frame.actions';
import { downloadFile } from '../../../utility/download';
import { getMaxPageIndex, getNewPageIndex, columnInfosOrdered } from '../../../utility/table';
import PageHeader from '../../page-header/page-header';
import { TableCustomColumnsContent } from '../../tables/table-custom-columns-content';
import { TablePagination } from '../../tables/table-pagination/table-pagination';
import { MusterPageHelp } from './muster-page-help';
import useStyles from './muster-page.styles';
import { UserState } from '../../../reducers/user.reducer';
import { AppState } from '../../../store';
import {
  ApiMusterIndividuals,
  ApiMusterTrends,
  ApiRosterColumnInfo,
  ApiRosterColumnType,
  ApiUnitStatsByDate,
} from '../../../models/api-response';
import { ButtonWithSpinner } from '../../buttons/button-with-spinner';
import { UnitSelector } from '../../../selectors/unit.selector';
import { Unit } from '../../../actions/unit.actions';
import { DataExportIcon } from '../../icons/data-export-icon';
import { Modal } from '../../../actions/modal.actions';
import { formatMessage } from '../../../utility/errors';
import { UserSelector } from '../../../selectors/user.selector';

interface TimeRange {
  interval: 'day' | 'hour'
  intervalCount: number
}

const timeRangeToString = (timeRange: TimeRange) => {
  return `${timeRange.interval}-${timeRange.intervalCount}`;
};

const stringToTimeRange = (str: string) => {
  const parts = str.split('-');
  return {
    interval: parts[0],
    intervalCount: parseInt(parts[1]),
  } as TimeRange;
};

export const MusterPage = () => {
  const classes = useStyles();
  const dispatch = useDispatch();
  const units = useSelector(UnitSelector.all);
  const user = useSelector<AppState, UserState>(state => state.user);

  const maxNumColumnsToShow = 6;
  const maxTopUnitsCount = 5;
  const trendChart = {
    layout: {
      height: 320,
      autosize: true,
      barmode: 'stack',
      yaxis: {
        title: 'Non-Muster Rate %',
        color: '#A9AEB1',
        hoverformat: '.0f%',
        showticklabels: false,
      },
      xaxis: {
        color: '#A9AEB1',
        hoverformat: '',
      },
      hovermode: 'closest',
      showlegend: false,
      colorway: ['#7776AF', '#54BEA5', '#E87779', '#EACC73', '#81B2DA'],
      margin: {
        l: 40,
        r: 20,
        b: 20,
        t: 20,
      },
    } as Partial<Plotly.Layout>,
    config: {
      displayModeBar: false,
    } as Partial<Plotly.Config>,
  };

  const weeklyTrendChart = {
    ...trendChart,
  };

  const monthlyTrendChart = {
    ...trendChart,
  };

  const [individualsTimeRangeString, setIndividualsTimeRangeString] = useState(timeRangeToString({ interval: 'day', intervalCount: 1 }));
  const [individualsUnitId, setIndividualsUnitId] = useState<number | null>(null);
  const [individualsPage, setIndividualsPage] = useState(0);
  const [individualsRowsPerPage, setIndividualsRowsPerPage] = useState(10);
  const [exportLoading, setExportLoading] = useState(false);
  const [rosterColumnInfos, setRosterColumnInfos] = useState<ApiRosterColumnInfo[]>([]);
  const [rawTrendData, setRawTrendData] = useState<ApiMusterTrends>({ weekly: {}, monthly: {} });
  const [weeklyTrendTopUnitCount, setWeeklyTrendTopUnitCount] = useState(5);
  const [monthlyTrendTopUnitCount, setMonthlyTrendTopUnitCount] = useState(5);
  const [weeklyTrendData, setWeeklyTrendData] = useState<Plotly.Data[]>([]);
  const [monthlyTrendData, setMonthlyTrendData] = useState<Plotly.Data[]>([]);
  const [individualsData, setIndividualsData] = useState<ApiMusterIndividuals>({ rows: [], totalRowsCount: 0 });

  const org = useSelector(UserSelector.org);
  const orgId = org?.id;
  const orgName = org?.name;
  const isPageLoading = useSelector<AppState, boolean>(state => state.appFrame.isPageLoading);

  //
  // Effects
  //

  const getUnits = useCallback(async () => {
    if (orgId) {
      await dispatch(Unit.fetch(orgId));
    }
  }, [orgId, dispatch]);

  const showErrorDialog = useCallback((title: string, error: Error) => {
    dispatch(Modal.alert(`Error: ${title}`, formatMessage(error)));
  }, [dispatch]);

  const reloadTable = useCallback(async () => {
    const { interval, intervalCount } = stringToTimeRange(individualsTimeRangeString);
    let data: ApiMusterIndividuals;
    try {
      data = (await axios.get(`api/muster/${orgId}/individuals`, {
        params: {
          interval,
          intervalCount,
          unitId: individualsUnitId,
          page: individualsPage,
          limit: individualsRowsPerPage,
        },
      })).data as ApiMusterIndividuals;
    } catch (error) {
      showErrorDialog('Get Individuals', error);
      throw error;
    }

    // Convert percents to strings for better display.
    for (const individual of data.rows) {
      const percent = (individual.nonMusterPercent! as number).toFixed(1);
      individual.nonMusterPercent = `${percent}%`;
    }

    // If our current page is now out of range, put us on the last page for this new data.
    // Switching pages will force a reload of the table data, and we don't want to show anything in the meantime,
    // so only set the new individuals data here if our page is valid.
    const maxPageIndex = getMaxPageIndex(individualsRowsPerPage, data.totalRowsCount);
    if (individualsPage > maxPageIndex) {
      setIndividualsPage(maxPageIndex);
    } else {
      setIndividualsData(data);
    }
  }, [individualsTimeRangeString, individualsRowsPerPage, individualsPage, orgId, individualsUnitId, showErrorDialog]);

  const reloadTrendData = useCallback(async () => {
    try {
      const data = (await axios.get(`api/muster/${orgId}/trends`, {
        params: {
          weeksCount: 6,
          monthsCount: 6,
        },
      })).data as ApiMusterTrends;
      setRawTrendData(data);
    } catch (error) {
      showErrorDialog('Get Trends', error);
    }
  }, [orgId, showErrorDialog]);

  const initializeRosterColumnInfo = useCallback(async () => {
    try {
      const infos = (await axios.get(`api/roster/${orgId}/info`)).data as ApiRosterColumnInfo[];
      setRosterColumnInfos(infos);
    } catch (error) {
      showErrorDialog('Get Roster Info', error);
    }
  }, [orgId, showErrorDialog]);

  const initialize = useCallback(async () => {
    dispatch(AppFrame.setPageLoading(true));
    await Promise.all([
      initializeRosterColumnInfo(),
      getUnits(),
    ]);
    await Promise.all([
      reloadTable(),
      reloadTrendData(),
    ]);
    dispatch(AppFrame.setPageLoading(false));
  }, [dispatch, initializeRosterColumnInfo, reloadTable, reloadTrendData, getUnits]);

  const getTrendData = useCallback((unitStatsByDate: ApiUnitStatsByDate, topUnitCount: number) => {
    // Sum up each unit's non-muster percent to figure out who's performing worst overall.
    const nonMusterPercentSumByUnit = {} as {[unitName: string]: number};
    for (const date of Object.keys(unitStatsByDate)) {
      for (const unitName of Object.keys(unitStatsByDate[date])) {
        if (nonMusterPercentSumByUnit[unitName] == null) {
          nonMusterPercentSumByUnit[unitName] = 0;
        }
        nonMusterPercentSumByUnit[unitName] += unitStatsByDate[date][unitName].nonMusterPercent;
      }
    }

    // Exclude compliant units and sort with worst performing units first.
    const unitsSorted = Object.keys(nonMusterPercentSumByUnit)
      .filter(unitName => nonMusterPercentSumByUnit[unitName] > 0)
      .sort(unitName => nonMusterPercentSumByUnit[unitName])
      .reverse()
      .slice(0, topUnitCount);

    // Build chart data.
    const datesSorted = Object.keys(unitStatsByDate).sort();
    const trendChartData = [] as Plotly.Data[];
    for (const unitName of unitsSorted) {
      const chartData = {
        type: 'bar',
        x: datesSorted,
        y: [] as number[],
        name: unitName,
        hovertemplate: `%{y:.1f}%`,
      };

      for (const date of datesSorted) {
        const nonMusterPercent = unitStatsByDate[date][unitName].nonMusterPercent;
        chartData.y.push(nonMusterPercent);
      }

      trendChartData.push(chartData as Plotly.Data);
    }

    return trendChartData;
  }, []);

  useEffect(() => {
    initialize().then();
  }, [initialize]);

  useEffect(() => {
    // Rebuild weekly chart data.
    const weeklyTrendDataNew = getTrendData(rawTrendData.weekly, weeklyTrendTopUnitCount);
    setWeeklyTrendData(weeklyTrendDataNew);
  }, [rawTrendData, weeklyTrendTopUnitCount, getTrendData]);

  useEffect(() => {
    // Rebuild monthly chart data.
    const monthlyTrendDataNew = getTrendData(rawTrendData.monthly, monthlyTrendTopUnitCount);
    setMonthlyTrendData(monthlyTrendDataNew);
  }, [rawTrendData, monthlyTrendTopUnitCount, getTrendData]);

  //
  // Functions
  //

  const handleIndividualsChangePage = (event: MouseEvent<HTMLButtonElement> | null, pageNew: number) => {
    setIndividualsPage(pageNew);
  };

  const handleIndividualsChangeRowsPerPage = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const individualsRowsPerPageNew = parseInt(event.target.value);
    const individualsPageNew = getNewPageIndex(individualsRowsPerPage, individualsPage, individualsRowsPerPageNew);
    setIndividualsRowsPerPage(individualsRowsPerPageNew);
    setIndividualsPage(individualsPageNew);
  };

  const downloadCSVExport = async () => {
    const { interval, intervalCount } = stringToTimeRange(individualsTimeRangeString);

    try {
      setExportLoading(true);
      const response = await axios({
        url: `api/export/${orgId}/muster/individuals`,
        params: {
          interval,
          intervalCount,
          unitId: individualsUnitId,
        },
        method: 'GET',
        responseType: 'blob',
      });

      const startDate = moment().startOf('day').subtract(intervalCount, 'days').format('YYYY-MM-DD');
      const endDate = moment().startOf('day').format('YYYY-MM-DD');
      const unitId = individualsUnitId !== null ? `${individualsUnitId}` : 'all-units';
      const filename = `${_.kebabCase(orgName)}_${unitId}_muster-noncompliance_${startDate}_to_${endDate}`;
      downloadFile(response.data, filename, 'csv');
    } catch (error) {
      dispatch(Modal.alert('Export to CSV', formatMessage(error, 'Unable to export')));
    } finally {
      setExportLoading(false);
    }
  };

  const getVisibleColumns = () => {
    const customRosterColumnInfos = [
      ...rosterColumnInfos,
      {
        name: 'unitId',
        displayName: 'Unit',
        type: ApiRosterColumnType.String,
        pii: false,
        phi: false,
        custom: false,
        required: false,
        updatable: false,
      },
      {
        name: 'nonMusterPercent',
        displayName: 'Non-Muster Rate',
        type: ApiRosterColumnType.String,
        pii: false,
        phi: false,
        custom: false,
        required: false,
        updatable: false,
      },
    ];

    return columnInfosOrdered(customRosterColumnInfos, [
      'edipi',
      'firstName',
      'lastName',
      'unitId',
      'nonMusterPercent',
    ]).slice(0, maxNumColumnsToShow);
  };

  const handleIndividualsTimeRangeChange = (event: MouseEvent<HTMLElement>, individualsTimeRangeStringNew: string | null) => {
    if (individualsTimeRangeStringNew == null) {
      return;
    }

    setIndividualsTimeRangeString(individualsTimeRangeStringNew);
  };

  const handleIndividualsUnitChange = (event: ChangeEvent<{ name?: string, value: unknown }>) => {
    const unitId = event.target.value as number;
    setIndividualsUnitId(unitId >= 0 ? unitId : null);
  };

  const timeRangeToggleButton = (timeRange: TimeRange) => {
    const intervalStr = (timeRange.intervalCount === 1) ? timeRange.interval : `${timeRange.interval}s`;

    return (
      <ToggleButton value={timeRangeToString(timeRange)}>
        {`${timeRange.intervalCount} ${_.startCase(intervalStr)}`}
      </ToggleButton>
    );
  };

  //
  // Render
  //

  return (
    <main className={classes.root}>
      <Container maxWidth="md">
        <PageHeader
          title="Muster Non-Compliance"
          help={{
            contentComponent: MusterPageHelp,
            cardId: 'musterPage',
          }}
        />

        <Grid container spacing={3}>
          {/* Table */}
          {user.activeRole?.role.canViewPII && (
            <Grid item xs={12}>
              <Paper>
                <TableContainer>
                  <div className={classes.tableOptions}>
                    <ToggleButtonGroup
                      value={individualsTimeRangeString}
                      exclusive
                      onChange={handleIndividualsTimeRangeChange}
                      aria-label="table time range"
                    >
                      {timeRangeToggleButton({ intervalCount: 1, interval: 'day' })}
                      {timeRangeToggleButton({ intervalCount: 2, interval: 'day' })}
                      {timeRangeToggleButton({ intervalCount: 3, interval: 'day' })}
                      {timeRangeToggleButton({ intervalCount: 4, interval: 'day' })}
                      {timeRangeToggleButton({ intervalCount: 5, interval: 'day' })}
                    </ToggleButtonGroup>

                    <Select
                      value={individualsUnitId}
                      displayEmpty
                      onChange={handleIndividualsUnitChange}
                    >
                      <MenuItem value={-1}>
                        <em>All Units</em>
                      </MenuItem>

                      {units.map(unit => (
                        <MenuItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </MenuItem>
                      ))}
                    </Select>

                    <Box flex={1} />

                    <ButtonWithSpinner
                      size="large"
                      variant="text"
                      color="primary"
                      startIcon={<DataExportIcon />}
                      onClick={() => downloadCSVExport()}
                      loading={exportLoading}
                    >
                      Export to CSV
                    </ButtonWithSpinner>
                  </div>

                  <Table aria-label="muster table">
                    <TableCustomColumnsContent
                      rows={individualsData.rows}
                      columns={getVisibleColumns()}
                      idColumn="id"
                      noDataText={isPageLoading ? 'Loading...' : 'All Individuals Compliant'}
                      rowOptions={{
                        renderCell: (row, column) => {
                          const value = row[column.name];
                          if (column.name === 'unitId') {
                            return units.find(unit => unit.id === value)?.name || value;
                          }
                          return value;
                        },
                      }}
                    />

                    <TableFooter>
                      <TableRow>
                        <TablePagination
                          count={individualsData.totalRowsCount}
                          page={individualsPage}
                          rowsPerPage={individualsRowsPerPage}
                          rowsPerPageOptions={[10, 25, 50]}
                          onChangePage={handleIndividualsChangePage}
                          onChangeRowsPerPage={handleIndividualsChangeRowsPerPage}
                        />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>
          )}

          {/* Weekly Trend */}
          <Grid item xs={6}>
            <Card>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  Weekly Trend
                </Typography>

                <div>
                  <span>Viewing the top </span>
                  <Select
                    className={classes.trendCountSelect}
                    value={weeklyTrendTopUnitCount}
                    onChange={e => setWeeklyTrendTopUnitCount(parseInt(e.target.value as string))}
                  >
                    {Array.from(Array(maxTopUnitsCount).keys()).map(value => (
                      <MenuItem key={value} value={value + 1}>{value + 1}</MenuItem>
                    ))}
                  </Select>
                  <span> offending units.</span>
                </div>

                <Plot
                  style={{ width: '100%' }}
                  data={weeklyTrendData}
                  layout={weeklyTrendChart.layout}
                  config={weeklyTrendChart.config}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Monthly Trend */}
          <Grid item xs={6}>
            <Card>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  Monthly Trend
                </Typography>

                <div>
                  <span>Viewing the top </span>
                  <Select
                    className={classes.trendCountSelect}
                    value={monthlyTrendTopUnitCount}
                    onChange={e => setMonthlyTrendTopUnitCount(parseInt(e.target.value as string))}
                  >
                    {Array.from(Array(maxTopUnitsCount).keys()).map(value => (
                      <MenuItem key={value} value={value + 1}>{value + 1}</MenuItem>
                    ))}
                  </Select>
                  <span> offending units.</span>
                </div>

                <Plot
                  style={{ width: '100%' }}
                  data={monthlyTrendData}
                  layout={monthlyTrendChart.layout}
                  config={monthlyTrendChart.config}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </main>
  );
};
