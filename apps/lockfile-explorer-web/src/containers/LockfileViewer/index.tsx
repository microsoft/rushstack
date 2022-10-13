import React, { useCallback, useState } from 'react';
import appStyles from '../../appstyles.scss';
import styles from './styles.scss';
import { LockfileEntry, LockfileEntryFilter } from '../../parsing/LockfileEntry';
import { ReactNull } from '../../types/ReactNull';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  clearStackAndPush,
  popStack,
  selectFilteredEntries,
  setFilter as selectFilter
} from '../../store/slices/entrySlice';
import { Checkbox } from '@fluentui/react';

const LockfileEntryLi = ({ entry }: { entry: LockfileEntry }): JSX.Element => {
  const dispatch = useAppDispatch();
  const clear = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(clearStackAndPush(entry));
    },
    []
  );
  return (
    <div onClick={clear(entry)} className={styles.lockfileEntries}>
      <h5>{entry.displayText}</h5>
    </div>
  );
};

export const LockfileViewer = (): JSX.Element | ReactNull => {
  const [filter, setFilter] = useState('');
  const entries = useAppSelector(selectFilteredEntries);
  const updateFilter = useCallback((e) => setFilter(e.target.value), []);

  // const selectedEntry = useAppSelector(selectCurrentEntry);
  const entryStack = useAppSelector((state) => state.entry.selectedEntryStack);

  const dispatch = useAppDispatch();

  if (!entries) return ReactNull;

  const pop = useCallback(() => {
    dispatch(popStack());
  }, []);

  const getEntriesToShow = (): LockfileEntry[] => {
    if (filter) {
      return entries.filter((entry) => entry.entryId.indexOf(filter) !== -1);
    } else {
      return entries;
    }
  };

  const changeFilter = useCallback(
    (filter: LockfileEntryFilter) =>
      (ev?: React.FormEvent<HTMLElement | HTMLInputElement>, isChecked?: boolean): void => {
        dispatch(selectFilter({ filter, state: !!isChecked }));
      },
    []
  );

  return (
    <div className={appStyles.containerCard}>
      <div className={styles.LockfileFilterBar}>
        <h5>filter:</h5>
        <input type="text" value={filter} onChange={updateFilter} />
      </div>
      {entryStack.length > 1 ? <button onClick={pop}>back</button> : null}
      <div className={styles.lockfileEntriesWrapper}>
        {getEntriesToShow().map((lockfileEntry) => (
          <LockfileEntryLi entry={lockfileEntry} key={lockfileEntry.displayText} />
        ))}
      </div>
      <div className={styles.filterSection}>
        <h5>Filter</h5>
        <Checkbox label="Show Workspace Projects" onChange={changeFilter(LockfileEntryFilter.Project)} />
        <Checkbox label="Show Workspace Packages" onChange={changeFilter(LockfileEntryFilter.Package)} />
        <Checkbox
          label="Must have side-by-side versions"
          onChange={changeFilter(LockfileEntryFilter.SideBySide)}
        />
        <Checkbox label="Must have doppelgangers" onChange={changeFilter(LockfileEntryFilter.Doppelganger)} />
      </div>
    </div>
  );
};
