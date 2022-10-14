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

type LockfileEntryGroup = {
  entryName: string;
  versions: LockfileEntry[];
};

const LockfileEntryLi = ({ group }: { group: LockfileEntryGroup }): JSX.Element => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const dispatch = useAppDispatch();
  const clear = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(clearStackAndPush(entry));
    },
    []
  );
  return (
    <div className={styles.packageGroup}>
      <h5>{group.entryName}</h5>
      {group.versions.map((entry) => (
        <div
          onClick={clear(entry)}
          className={`${styles.lockfileEntries} ${
            selectedEntry?.rawEntryId === entry.rawEntryId ? styles.lockfileSelectedEntry : ''
          }`}
        >
          <p>{entry.entryPackageVersion}</p>
        </div>
      ))}
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

  const getEntriesToShow = (): LockfileEntryGroup[] => {
    let filteredEntries: LockfileEntry[] = [];
    if (filter) {
      filteredEntries = entries.filter((entry) => entry.entryId.indexOf(filter) !== -1);
    } else {
      filteredEntries = entries;
    }
    const reducedEntries = filteredEntries.reduce((groups: { [key in string]: LockfileEntry[] }, item) => {
      const group = groups[item.entryPackageName] || [];
      group.push(item);
      groups[item.entryPackageName] = group;
      return groups;
    }, {});
    const groupedEntries: LockfileEntryGroup[] = [];
    for (const [packageName, entries] of Object.entries(reducedEntries)) {
      groupedEntries.push({
        entryName: packageName,
        versions: entries
      });
    }
    return groupedEntries;
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
        {getEntriesToShow().map((lockfileEntryGroup) => (
          <LockfileEntryLi group={lockfileEntryGroup} key={lockfileEntryGroup.entryName} />
        ))}
      </div>
      <div className={styles.filterSection}>
        <div className={styles.filterOption}></div>
        <h5>Filter</h5>
        <input
          type="checkbox"
          checked={activeFilters[LockfileEntryFilter.Project]}
          onChange={changeFilter(LockfileEntryFilter.Project)}
        />
        <h5>Show Workspace Projects</h5>
        <input
          type="checkbox"
          checked={activeFilters[LockfileEntryFilter.Package]}
          onChange={changeFilter(LockfileEntryFilter.Package)}
        />
        <h5>Show Workspace Packages</h5>
        <input
          type="checkbox"
          checked={activeFilters[LockfileEntryFilter.SideBySide]}
          onChange={changeFilter(LockfileEntryFilter.SideBySide)}
        />
        <h5>Must have side-by-side versions</h5>
        <input
          type="checkbox"
          checked={activeFilters[LockfileEntryFilter.Doppelganger]}
          onChange={changeFilter(LockfileEntryFilter.Doppelganger)}
        />
        <h5>Must have doppelgangers</h5>
      </div>
    </div>
  );
};
