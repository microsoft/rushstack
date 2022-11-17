// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import appStyles from '../../App.scss';
import styles from './styles.scss';
import { LockfileEntry, LockfileEntryFilter } from '../../parsing/LockfileEntry';
import { ReactNull } from '../../types/ReactNull';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  forwardStack,
  popStack,
  pushToStack,
  selectCurrentEntry,
  selectFilteredEntries,
  setFilter as selectFilter
} from '../../store/slices/entrySlice';
import { FilterBar } from '../../components/FilterBar';
import { getFilterFromLocalStorage, saveFilterToLocalStorage } from '../../helpers/localStorage';

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
      dispatch(pushToStack(entry));
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
  const dispatch = useAppDispatch();
  const [projectFilter, setProjectFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const entries = useAppSelector(selectFilteredEntries);
  const activeFilters = useAppSelector((state) => state.entry.filters);
  const updateFilter = useCallback(
    (type: LockfileEntryFilter) => (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === LockfileEntryFilter.Project) {
        setProjectFilter(e.target.value);
      } else {
        setPackageFilter(e.target.value);
      }
      saveFilterToLocalStorage(e.target.value, type);
    },
    []
  );

  useEffect(() => {
    setProjectFilter(getFilterFromLocalStorage(LockfileEntryFilter.Project));
    setPackageFilter(getFilterFromLocalStorage(LockfileEntryFilter.Package));
  }, []);

  if (!entries) return ReactNull;

  const getEntriesToShow = (): ILockfileEntryGroup[] => {
    let filteredEntries: LockfileEntry[] = entries;
    if (projectFilter && activeFilters[LockfileEntryFilter.Project]) {
      filteredEntries = entries.filter((entry) => entry.entryPackageName.indexOf(projectFilter) !== -1);
    } else if (packageFilter && activeFilters[LockfileEntryFilter.Package]) {
      filteredEntries = entries.filter((entry) => entry.entryPackageName.indexOf(packageFilter) !== -1);
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
    (filter: LockfileEntryFilter, enabled: boolean) => (): void => {
      dispatch(selectFilter({ filter, state: enabled }));
    },
    []
  );

  const togglePackageView = useCallback(
    (selected: LockfileEntryFilter) => () => {
      if (selected === LockfileEntryFilter.Project) {
        dispatch(selectFilter({ filter: LockfileEntryFilter.Project, state: true }));
        dispatch(selectFilter({ filter: LockfileEntryFilter.Package, state: false }));
      } else {
        dispatch(selectFilter({ filter: LockfileEntryFilter.Package, state: true }));
        dispatch(selectFilter({ filter: LockfileEntryFilter.Project, state: false }));
      }
    },
    [activeFilters]
  );

  return (
    <div className={styles.ViewWrapper}>
      <FilterBar
        options={[
          {
            text: 'Projects',
            active: activeFilters[LockfileEntryFilter.Project],
            onClick: togglePackageView(LockfileEntryFilter.Project)
          },
          {
            text: 'Packages',
            active: activeFilters[LockfileEntryFilter.Package],
            onClick: togglePackageView(LockfileEntryFilter.Package)
          }
        ]}
      />
      <div className={`${styles.ViewContents} ${appStyles.ContainerCard}`}>
        <div className={styles.LockfileFilterBar}>
          <h5>Filter:</h5>
          <input
            type="text"
            value={activeFilters[LockfileEntryFilter.Project] ? projectFilter : packageFilter}
            onChange={updateFilter(
              activeFilters[LockfileEntryFilter.Project]
                ? LockfileEntryFilter.Project
                : LockfileEntryFilter.Package
            )}
          />
        </div>
        <div className={styles.lockfileEntriesWrapper}>
          {getEntriesToShow().map((lockfileEntryGroup) => (
            <LockfileEntryLi group={lockfileEntryGroup} key={lockfileEntryGroup.entryName} />
          ))}
        </div>
        {activeFilters[LockfileEntryFilter.Package] ? (
          <div className={styles.filterSection}>
            <h5>Filters</h5>
            <div
              className={styles.filterOption}
              onClick={changeFilter(
                LockfileEntryFilter.SideBySide,
                !activeFilters[LockfileEntryFilter.SideBySide]
              )}
            >
              <input type="checkbox" checked={activeFilters[LockfileEntryFilter.SideBySide]} readOnly />
              <h5>Must have side-by-side versions</h5>
            </div>
            <div
              className={styles.filterOption}
              onClick={changeFilter(
                LockfileEntryFilter.Doppelganger,
                !activeFilters[LockfileEntryFilter.Doppelganger]
              )}
            >
              <input type="checkbox" checked={activeFilters[LockfileEntryFilter.Doppelganger]} readOnly />
              <h5>Must have doppelgangers</h5>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
