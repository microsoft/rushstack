import React, { useCallback, useEffect, useRef, useState } from 'react';
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

interface ILockfileEntryGroup {
  entryName: string;
  versions: LockfileEntry[];
}

const LockfileEntryLi = ({ group }: { group: ILockfileEntryGroup }): JSX.Element => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const dispatch = useAppDispatch();
  const fieldRef = useRef() as React.MutableRefObject<HTMLDivElement>;
  const clear = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(clearStackAndPush(entry));
    },
    []
  );

  useEffect(() => {
    if (selectedEntry && selectedEntry.entryPackageName === group.entryName) {
      fieldRef.current.scrollIntoView({
        behavior: 'smooth'
      });
    }
  }, [selectedEntry, group]);

  return (
    <div className={styles.packageGroup} ref={fieldRef}>
      <h5>{group.entryName}</h5>
      {group.versions.map((entry) => (
        <div
          key={entry.rawEntryId}
          onClick={clear(entry)}
          className={`${styles.lockfileEntries} ${
            selectedEntry?.rawEntryId === entry.rawEntryId ? styles.lockfileSelectedEntry : ''
          }`}
        >
          <p>
            {entry.entryPackageVersion || entry.entryPackageName}{' '}
            {entry.entrySuffix && `[${entry.entrySuffix}]`}
          </p>
        </div>
      ))}
    </div>
  );
};

const multipleVersions = (entries: LockfileEntry[]): boolean => {
  const set = new Set();
  for (const entry of entries) {
    if (set.has(entry.entryPackageVersion)) return true;
    set.add(entry.entryPackageVersion);
  }
  return false;
};

export const LockfileViewer = (): JSX.Element | ReactNull => {
  const [filter, setFilter] = useState('test');
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

  const getEntriesToShow = (): ILockfileEntryGroup[] => {
    let filteredEntries: LockfileEntry[] = [];
    if (filter) {
      filteredEntries = entries.filter((entry) => entry.entryPackageName.indexOf(filter) !== -1);
    } else {
      filteredEntries = entries;
    }
    const reducedEntries = filteredEntries.reduce((groups: { [key in string]: LockfileEntry[] }, item) => {
      const group = groups[item.entryPackageName] || [];
      group.push(item);
      groups[item.entryPackageName] = group;
      return groups;
    }, {});
    let groupedEntries: ILockfileEntryGroup[] = [];
    for (const [packageName, entries] of Object.entries(reducedEntries)) {
      groupedEntries.push({
        entryName: packageName,
        versions: entries
      });
    }

    if (activeFilters[LockfileEntryFilter.SideBySide]) {
      groupedEntries = groupedEntries.filter((entry) => entry.versions.length > 1);
    }
    if (activeFilters[LockfileEntryFilter.Doppelganger]) {
      groupedEntries = groupedEntries.filter((entry) => multipleVersions(entry.versions));
    }

    return groupedEntries;
  };

  const changeFilter = useCallback(
    (filter: LockfileEntryFilter) =>
      (ev: React.ChangeEvent<HTMLInputElement>): void => {
        dispatch(selectFilter({ filter, state: ev.target.checked }));
      },
    []
  );

  return (
    <div className={`${appStyles.containerCard} ${styles.ViewWrapper}`}>
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
        <h5>Filters</h5>
        <div className={styles.filterOption}>
          <input
            type="checkbox"
            checked={activeFilters[LockfileEntryFilter.Project]}
            onChange={changeFilter(LockfileEntryFilter.Project)}
          />
          <h5>Show Workspace Projects</h5>
        </div>
        <div className={styles.filterOption}>
          <input
            type="checkbox"
            checked={activeFilters[LockfileEntryFilter.Package]}
            onChange={changeFilter(LockfileEntryFilter.Package)}
          />
          <h5>Show Workspace Packages</h5>
        </div>
        <div className={styles.filterOption}>
          <input
            type="checkbox"
            checked={activeFilters[LockfileEntryFilter.SideBySide]}
            onChange={changeFilter(LockfileEntryFilter.SideBySide)}
          />
          <h5>Must have side-by-side versions</h5>
        </div>
        <div className={styles.filterOption}>
          <input
            type="checkbox"
            checked={activeFilters[LockfileEntryFilter.Doppelganger]}
            onChange={changeFilter(LockfileEntryFilter.Doppelganger)}
          />
          <h5>Must have doppelgangers</h5>
        </div>
      </div>
    </div>
  );
};
