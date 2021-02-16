import React, { useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle, FormControl,
  Grid, InputLabel, Select,
  TableCell,
  TableRow,
  TextField,
} from '@material-ui/core';
import { DatePicker, DateTimePicker, MuiPickersUtilsProvider } from '@material-ui/pickers';
import { MaterialUiPickersDate } from '@material-ui/pickers/typings/date';
import MomentUtils from '@date-io/moment';
import axios from 'axios';
import { useSelector } from 'react-redux';
import useStyles from './edit-roster-entry-dialog.style';
import {
  ApiRosterColumnInfo, ApiRosterColumnType, ApiRosterEntry, ApiRosterEnumColumnConfig, ApiRosterStringColumnConfig,
} from '../../../models/api-response';
import { ButtonWithSpinner } from '../../buttons/button-with-spinner';
import { EditableBooleanTable } from '../../tables/editable-boolean-table';
import { UnitSelector } from '../../../selectors/unit.selector';
import { formatMessage } from '../../../utility/errors';

export interface EditRosterEntryDialogProps {
  open: boolean,
  orgId?: number,
  rosterColumnInfos?: ApiRosterColumnInfo[],
  rosterEntry?: ApiRosterEntry,
  onClose?: () => void,
  onError?: (error: string) => void,
}

export const EditRosterEntryDialog = (props: EditRosterEntryDialogProps) => {
  const classes = useStyles();
  const units = useSelector(UnitSelector.all);
  const {
    open, orgId, rosterColumnInfos, onClose, onError,
  } = props;

  const hiddenEditFields = ['unit'];

  const existingRosterEntry: boolean = !!props.rosterEntry;
  const [formDisabled, setFormDisabled] = useState(false);
  const [saveRosterEntryLoading, setSaveRosterEntryLoading] = useState(false);
  const [unitChangedPromptOpen, setUnitChangedPromptOpen] = useState(false);
  const [rosterEntry, setRosterEntryProperties] = useState(existingRosterEntry ? props.rosterEntry as ApiRosterEntry : {} as ApiRosterEntry);
  const originalUnit = props.rosterEntry?.unit;

  if (!open) {
    return <></>;
  }

  function updateRosterEntryProperty(property: string, value: any) {
    setRosterEntryProperties({
      ...rosterEntry,
      [property]: value,
    });
  }

  const onTextFieldChanged = (columnName: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    updateRosterEntryProperty(columnName, event.target.value);
  };

  const onNumberFieldChanged = (columnName: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const number = parseFloat(event.target.value);
    updateRosterEntryProperty(columnName, Number.isNaN(number) ? null : number);
  };

  const onCheckboxChanged = (columnName: string) => (event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    updateRosterEntryProperty(columnName, checked);
  };

  const onDateFieldChanged = (columnName: string) => (date: MaterialUiPickersDate) => {
    updateRosterEntryProperty(columnName, date?.toISOString());
  };

  const onUnitChanged = (event: React.ChangeEvent<{ value: unknown }>) => {
    updateRosterEntryProperty('unit', event.target.value);
  };

  const getUnitName = (unitId: number) => {
    for (const unit of units) {
      if (unit.id === unitId) {
        return unit.name;
      }
    }
    return 'Unknown';
  };

  const checkSave = async () => {
    if (existingRosterEntry && rosterEntry.unit !== originalUnit) {
      setUnitChangedPromptOpen(true);
    } else {
      await onSave();
    }
  };

  const onSave = async () => {
    setFormDisabled(true);
    try {
      setSaveRosterEntryLoading(true);
      const data = {
        ...rosterEntry,
      };
      if (!data.unit) {
        data.unit = units[0].id;
      }
      if (existingRosterEntry) {
        await axios.put(`api/roster/${orgId}/${rosterEntry!.id}`, data);
      } else {
        await axios.post(`api/roster/${orgId}`, data);
      }
    } catch (error) {
      if (onError) {
        onError(formatMessage(error));
      }
      setFormDisabled(false);
      return;
    } finally {
      setSaveRosterEntryLoading(false);
    }
    if (onClose) {
      onClose();
    }
  };

  const cancelUnitChangedDialog = () => {
    setUnitChangedPromptOpen(false);
  };

  const canSave = () => {
    if (formDisabled || !rosterColumnInfos) {
      return false;
    }

    const requiredColumns = rosterColumnInfos.filter(columnInfo => columnInfo.required);
    if (requiredColumns) {
      for (const column of requiredColumns) {
        const value = rosterEntry[column.name] as string;
        if (value == null) {
          return false;
        }

        switch (column.type) {
          case ApiRosterColumnType.String:
          case ApiRosterColumnType.Date:
          case ApiRosterColumnType.DateTime:
            if (value.trim().length === 0) {
              return false;
            }
            if (column.name === 'edipi' && !/^[0-9]{10}$/g.test(value)) {
              return false;
            }
            break;
          default:
            break;
        }

      }
    }

    return true;
  };


  const buildCheckboxFields = () => {
    const columns = rosterColumnInfos?.filter(columnInfo => {
      return columnInfo.type === 'boolean' && hiddenEditFields.indexOf(columnInfo.name) < 0;
    });
    if (!columns || columns.length === 0) {
      return <></>;
    }
    return (
      <>
        <label className={classes.booleanTableLabel}>Other:</label>
        <EditableBooleanTable aria-label="Other Fields">
          {columns?.map(columnInfo => (
            <TableRow key={columnInfo.name}>
              <TableCell>
                {columnInfo.displayName}
              </TableCell>
              <TableCell>
                <Checkbox
                  color="primary"
                  id={columnInfo.name}
                  disabled={formDisabled || (existingRosterEntry && !columnInfo.updatable)}
                  checked={rosterEntry[columnInfo.name] as boolean || false}
                  onChange={onCheckboxChanged(columnInfo.name)}
                />
              </TableCell>
            </TableRow>
          ))}
        </EditableBooleanTable>
      </>
    );
  };

  const buildTextInput = (columnInfo: ApiRosterColumnInfo) => {
    const numberField = columnInfo.type === ApiRosterColumnType.Number;
    const multiline = columnInfo.type === ApiRosterColumnType.String && (columnInfo?.config as ApiRosterStringColumnConfig)?.multiline === true;
    return (
      <TextField
        className={classes.textField}
        id={columnInfo.name}
        label={columnInfo.displayName}
        disabled={formDisabled || (existingRosterEntry && !columnInfo.updatable)}
        required={columnInfo.required}
        multiline={multiline}
        rows={multiline ? 3 : 1}
        rowsMax={multiline ? 6 : 1}
        onChange={numberField ? onNumberFieldChanged(columnInfo.name) : onTextFieldChanged(columnInfo.name)}
        value={rosterEntry[columnInfo.name] || ''}
        type={numberField ? 'number' : 'text'}
      />
    );
  };

  const buildDateInput = (columnInfo: ApiRosterColumnInfo) => {
    return (
      <MuiPickersUtilsProvider utils={MomentUtils}>
        <DatePicker
          className={classes.textField}
          id={columnInfo.name}
          format="MM/DD/YYYY"
          label={columnInfo.displayName}
          disabled={formDisabled || (existingRosterEntry && !columnInfo.updatable)}
          required={columnInfo.required}
          placeholder="mm/dd/yy"
          value={rosterEntry[columnInfo.name] ? rosterEntry[columnInfo.name] as string : null}
          onChange={onDateFieldChanged(columnInfo.name)}
        />
      </MuiPickersUtilsProvider>
    );
  };

  const buildDateTimeInput = (columnInfo: ApiRosterColumnInfo) => {
    return (
      <MuiPickersUtilsProvider utils={MomentUtils}>
        <DateTimePicker
          className={classes.textField}
          id={columnInfo.name}
          format="MM/DD/YYYY hh:mm A"
          label={columnInfo.displayName}
          disabled={formDisabled || (existingRosterEntry && !columnInfo.updatable)}
          required={columnInfo.required}
          placeholder="mm/dd/yy hh:mm:ss"
          value={rosterEntry[columnInfo.name] ? rosterEntry[columnInfo.name] as string : null}
          onChange={onDateFieldChanged(columnInfo.name)}
        />
      </MuiPickersUtilsProvider>
    );
  };

  const buildEnumInput = (columnInfo: ApiRosterColumnInfo) => {
    const options = (columnInfo.config as ApiRosterEnumColumnConfig)?.options?.slice() ?? [];

    if (!columnInfo.required) {
      options.unshift({ id: '', label: '' });
    }

    return (
      <>
        <InputLabel id={`${columnInfo.name}-label`} className={classes.inputLabel} shrink>
          {columnInfo.displayName}
        </InputLabel>
        <Select
          className={classes.selectField}
          id={columnInfo.name}
          labelId={`${columnInfo.name}-label`}
          native
          disabled={formDisabled || (existingRosterEntry && !columnInfo.updatable)}
          label={columnInfo.displayName}
          value={rosterEntry[columnInfo.name] ?? ''}
          onChange={event => {
            updateRosterEntryProperty(columnInfo.name, event?.target.value as string);
          }}
          required={columnInfo.required}
          inputProps={{
            name: `${columnInfo.name}`,
            id: `${columnInfo.name}-select`,
          }}
        >
          {options.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </Select>
      </>
    );
  };

  const buildInputFields = () => {
    const columns = rosterColumnInfos?.filter(columnInfo => {
      return columnInfo.type !== 'boolean' && hiddenEditFields.indexOf(columnInfo.name) < 0;
    });
    return columns?.map(columnInfo => (
      <Grid key={columnInfo.name} item xs={6}>
        {buildInputFieldForColumnType(columnInfo)}
      </Grid>
    ));
  };

  const buildInputFieldForColumnType = (column: ApiRosterColumnInfo) => {
    switch (column.type) {
      case ApiRosterColumnType.String:
      case ApiRosterColumnType.Number:
        return buildTextInput(column);
      case ApiRosterColumnType.DateTime:
        return buildDateTimeInput(column);
      case ApiRosterColumnType.Date:
        return buildDateInput(column);
      case ApiRosterColumnType.Enum:
        return buildEnumInput(column);
      default:
        console.warn(`Unhandled column type found while creating input fields: ${column.type}`);
        return '';
    }
  };

  return (
    <>
      <Dialog className={classes.root} maxWidth="md" onClose={onClose} open={open}>
        <DialogTitle id="alert-dialog-title">{existingRosterEntry ? 'Edit Roster Entry' : 'New Roster Entry'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={3}>
            <Grid item xs={6}>
              <FormControl required className={classes.selectField}>
                <InputLabel id="unit-label">Unit</InputLabel>
                <Select
                  labelId="unit-label"
                  native
                  disabled={formDisabled}
                  value={rosterEntry.unit}
                  onChange={onUnitChanged}
                  inputProps={{
                    name: 'unit',
                    id: 'unit-select',
                  }}
                >
                  {units && units.map(unit => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {buildInputFields()}
          </Grid>
          {buildCheckboxFields()}
        </DialogContent>
        <DialogActions className={classes.editRosterEntryDialogActions}>
          <Button disabled={formDisabled} variant="outlined" onClick={onClose} color="primary">
            Cancel
          </Button>
          <ButtonWithSpinner disabled={!canSave()} onClick={checkSave} color="primary" loading={saveRosterEntryLoading}>
            Save
          </ButtonWithSpinner>
        </DialogActions>
      </Dialog>
      <Dialog maxWidth="md" open={unitChangedPromptOpen}>
        <DialogTitle id="unit-changed">Unit Changed</DialogTitle>
        <DialogContent>
          Are you sure you want to move the individual to {getUnitName(rosterEntry.unit)}?
        </DialogContent>
        <DialogActions className={classes.unitChangedDialogActions}>
          <Button onClick={() => onSave()} color="primary">
            Yes
          </Button>
          <Button variant="outlined" onClick={cancelUnitChangedDialog} color="primary">
            No
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
