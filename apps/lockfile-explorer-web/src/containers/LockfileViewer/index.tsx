import React, { useCallback, useState } from 'react';
import appStyles from '../../appstyles.scss';
import styles from './styles.scss';
import { LockfileEntry, LockfileEntryFilter } from '../../parsing/LockfileEntry';
import { ReactNull } from '../../types/ReactNull';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  clearStackAndPush,
  popStack,
  selectCurrentEntry,
  selectFilteredEntries,
  setFilter as selectFilter
} from '../../store/slices/entrySlice';
import { Checkbox } from '@fluentui/react';

const LockfileEntryLi = ({ entry }: { entry: LockfileEntry }): JSX.Element => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const dispatch = useAppDispatch();
  const clear = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(clearStackAndPush(entry));
    },
    []
  );
  return (
    <div
      onClick={clear(entry)}
      className={`${styles.lockfileEntries} ${
        selectedEntry?.rawEntryId === entry.rawEntryId ? styles.lockfileSelectedEntry : ''
      }`}
    >
      <h5>{entry.displayText}</h5>
    </div>
  );
};

export const LockfileViewer = (): JSX.Element | ReactNull => {
  const [filter, setFilter] = useState('');
  const entries = useAppSelector(selectFilteredEntries);
  const activeFilters = useAppSelector((state) => state.entry.filters);
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
        {entryStack.length > 1 ? <button onClick={pop}>back</button> : null}
        <h5>filter:</h5>
        <input type="text" value={filter} onChange={updateFilter} />
      </div>
      <div className={styles.lockfileEntriesWrapper}>
        {getEntriesToShow().map((lockfileEntry) => (
          <LockfileEntryLi entry={lockfileEntry} key={lockfileEntry.displayText} />
        ))}
      </div>
      <div className={styles.filterSection}>
        <h5>Filter</h5>
        <Checkbox
          label="Show Workspace Projects"
          checked={activeFilters[LockfileEntryFilter.Project]}
          onChange={changeFilter(LockfileEntryFilter.Project)}
        />
        <Checkbox
          label="Show Workspace Packages"
          checked={activeFilters[LockfileEntryFilter.Package]}
          onChange={changeFilter(LockfileEntryFilter.Package)}
        />
        <Checkbox
          label="Must have side-by-side versions"
          checked={activeFilters[LockfileEntryFilter.SideBySide]}
          onChange={changeFilter(LockfileEntryFilter.SideBySide)}
        />
        <Checkbox
          label="Must have doppelgangers"
          checked={activeFilters[LockfileEntryFilter.Doppelganger]}
          onChange={changeFilter(LockfileEntryFilter.Doppelganger)}
        />
      </div>
    </div>
  );
};
