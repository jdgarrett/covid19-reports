import React, { useEffect, useState } from 'react';
import {
  Button, Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl, Grid, ListItemText, MenuItem,
  Select,
  Typography,
} from '@material-ui/core';
import { useDispatch, useSelector } from 'react-redux';
import _ from 'lodash';
import { ButtonWithSpinner } from '../../buttons/button-with-spinner';
import {
  ApiRole, ApiUnit, ApiUser,
} from '../../../models/api-response';
import useStyles from './select-role-dialog.styles';
import { Notification } from '../../../actions/notification.actions';
import { Role } from '../../../actions/role.actions';
import { RoleSelector } from '../../../selectors/role.selector';
import { UserSelector } from '../../../selectors/user.selector';
import { Roster } from '../../../actions/roster.actions';
import RoleInfoPanel from '../../role-info-panel/role-info-panel';

export type SelectRoleDialogProps = {
  confirmButtonText: string
  loading: boolean
  units: ApiUnit[]
  onCancel?: () => void
  onChange: (selectedRole: ApiRole, units: number[] | null) => void
  open?: boolean
  user: ApiUser
};

const SelectRoleDialog: React.FunctionComponent<SelectRoleDialogProps> = (props: SelectRoleDialogProps) => {
  const classes = useStyles();
  const dispatch = useDispatch();
  const orgId = useSelector(UserSelector.orgId);
  const availableRoles = useSelector(RoleSelector.all);
  const [selectedUnits, setSelectedUnits] = useState<number[]>([]);
  const [selectedRoleIndex, setSelectedRoleIndex] = useState(-1);
  const {
    confirmButtonText, loading, onCancel, onChange, open, user,
  } = props;

  const unitIndexMap: { [key: number]: number } = {};

  for (let i = 0; i < props.units.length; i++) {
    unitIndexMap[props.units[i].id] = i;
  }

  useEffect(() => {
    if (availableRoles!.length > 0) {
      const userRole = user?.userRoles?.[0];
      const roleIndex = userRole ? availableRoles.findIndex(role => role.id === userRole.role.id) : 0;
      setSelectedRoleIndex(roleIndex >= 0 ? roleIndex : 0);
      setSelectedUnits(userRole?.units?.map(unit => unit.id) ?? [-1]);
    }
  }, [user, availableRoles]);

  const initializeTable = React.useCallback(async () => {
    if (orgId) {
      dispatch(Notification.fetch(orgId));
      dispatch(Roster.fetchColumns(orgId));
      dispatch(Role.fetch(orgId));
    }
  }, [dispatch, orgId]);

  useEffect(() => { initializeTable().then(); }, [initializeTable]);

  const selectedUnitChanged = (event: React.ChangeEvent<{ value: unknown }>) => {
    const selectedValues = event.target.value as number[];
    if (selectedValues.some(value => value === -1)) {
      setSelectedUnits([-1]);
    } else {
      setSelectedUnits(selectedValues);
    }
  };

  const allSelected = () => {
    return selectedUnits.length === 1 && selectedUnits[0] === -1;
  };

  const renderUnitValue = (selected: unknown) => {
    if (allSelected()) {
      return 'All Units';
    }
    return (selected as number[]).map(unitId => props.units[unitIndexMap[unitId]].name).join(', ');
  };

  function selectedRoleChanged(event: React.ChangeEvent<{ value: unknown }>) {
    setSelectedRoleIndex(event.target.value as number);
  }

  if (availableRoles.length <= selectedRoleIndex || selectedRoleIndex < 0) {
    return null;
  }

  function canSave() {
    const originalRole = user?.userRoles?.[0];
    if (selectedUnits != null && selectedUnits.length === 0) {
      return false;
    }
    if (!originalRole) {
      return true;
    }
    return !_.isEqual(originalRole.units, selectedUnits) || originalRole.role.id !== availableRoles[selectedRoleIndex].id;
  }

  const selectedRole = availableRoles[selectedRoleIndex];

  return (
    <Dialog onClose={onCancel} open={Boolean(open)} maxWidth="md" fullWidth>
      <DialogTitle>
        Role and Unit Assignment for <b>{`${user?.firstName} ${user?.lastName}`}</b>
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={3}>
          <Grid item xs={6}>
            <FormControl className={classes.roleSelect}>
              <Typography className={classes.roleHeader}>Role:</Typography>
              <Select
                disabled={loading}
                native
                autoFocus
                value={selectedRoleIndex}
                onChange={selectedRoleChanged}
                inputProps={{
                  name: 'role',
                  id: 'role-select',
                }}
              >
                {availableRoles.map((role, index) => (
                  <MenuItem key={role.id} value={index}>
                    <ListItemText primary={role.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl className={classes.roleSelect}>
              <Typography className={classes.roleHeader}>Unit:</Typography>
              <Select
                multiple
                disabled={loading}
                autoFocus
                value={selectedUnits}
                placeholder="None"
                onChange={selectedUnitChanged}
                renderValue={renderUnitValue}
                inputProps={{
                  name: 'unit',
                  id: 'unit-select',
                }}
              >
                <MenuItem key="all" value={-1}>
                  <Checkbox checked={allSelected()} />
                  <ListItemText primary="All Units" />
                </MenuItem>
                {props.units.map(unit => (
                  <MenuItem key={unit.id} value={unit.id} disabled={allSelected()}>
                    <Checkbox checked={allSelected() || selectedUnits.indexOf(unit.id) > -1} />
                    <ListItemText primary={unit.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        <RoleInfoPanel role={selectedRole} scrollFix />
      </DialogContent>
      <DialogActions className={classes.roleDialogActions}>
        <Button disabled={loading} variant="outlined" onClick={onCancel} color="primary">
          Cancel
        </Button>
        <ButtonWithSpinner
          onClick={() => onChange(selectedRole, allSelected() ? null : selectedUnits)}
          disabled={!canSave()}
          color="primary"
          loading={loading}
        >
          {confirmButtonText}
        </ButtonWithSpinner>
      </DialogActions>
    </Dialog>
  );
};
export default SelectRoleDialog;
