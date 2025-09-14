// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './styles.scss';
import { type LockfileEntry, LockfileEntryFilter } from '../../packlets/lfx-shared';
import { ReactNull } from '../../types/ReactNull';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  pushToStack,
  selectCurrentEntry,
  selectFilteredEntries,
  setFilter as selectFilter
} from '../../store/slices/entrySlice';
import { getFilterFromLocalStorage, saveFilterToLocalStorage } from '../../helpers/localStorage';
import { Tabs, Checkbox, ScrollArea, Input, Text } from '@rushstack/rush-themed-ui';

interface ILockfileEntryGroup {
  entryName: string;
  versions: LockfileEntry[];
}

const LockfileEntryLi = ({ group }: { group: ILockfileEntryGroup }): JSX.Element => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const activeFilters = useAppSelector((state) => state.entry.filters);
  const dispatch = useAppDispatch();
  const fieldRef = useRef() as React.MutableRefObject<HTMLDivElement>;
  const clear = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(pushToStack(entry));
    },
    [dispatch]
  );

  useEffect(() => {
    if (selectedEntry && selectedEntry.entryPackageName === group.entryName) {
      fieldRef.current.scrollIntoView({
        behavior: 'smooth'
      });
    }
  }, [selectedEntry, group]);

  if (activeFilters[LockfileEntryFilter.Project]) {
    return (
      <div className={styles.packageGroup} ref={fieldRef}>
        {group.versions.map((entry) => (
          <div
            key={entry.rawEntryId}
            onClick={clear(entry)}
            className={`${styles.lockfileEntries} ${
              selectedEntry?.rawEntryId === entry.rawEntryId ? styles.lockfileSelectedEntry : ''
            }`}
          >
            <Text type="h5">{entry.entryPackageName}</Text>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.packageGroup} ref={fieldRef}>
      <Text type="h5" bold>
        {group.entryName}
      </Text>
      {group.versions.map((entry) => (
        <div
          key={entry.rawEntryId}
          onClick={clear(entry)}
          className={`${styles.lockfileEntries} ${
            selectedEntry?.rawEntryId === entry.rawEntryId ? styles.lockfileSelectedEntry : ''
          }`}
        >
          <Text type="p">
            {entry.entryPackageVersion} {entry.entrySuffix && `[${entry.entrySuffix}]`}
          </Text>
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

  const getEntriesToShow = (): ILockfileEntryGroup[] => {
    let filteredEntries: LockfileEntry[] = entries;
    if (projectFilter && activeFilters[LockfileEntryFilter.Project]) {
      filteredEntries = entries.filter((entry) => entry.entryPackageName.indexOf(projectFilter) !== -1);
    } else if (packageFilter && activeFilters[LockfileEntryFilter.Package]) {
      filteredEntries = entries.filter((entry) => entry.entryPackageName.indexOf(packageFilter) !== -1);
    }

    const reducedEntries = filteredEntries.reduce((groups: { [key: string]: LockfileEntry[] }, item) => {
      const group = groups[item.entryPackageName] || [];
      group.push(item);
      groups[item.entryPackageName] = group;
      return groups;
    }, {});
    let groupedEntries: ILockfileEntryGroup[] = [];
    for (const [packageName, versions] of Object.entries(reducedEntries)) {
      groupedEntries.push({
        entryName: packageName,
        versions
      });
    }

    if (activeFilters[LockfileEntryFilter.SideBySide]) {
      groupedEntries = groupedEntries.filter((entry) => entry.versions.length > 1);
    }
    if (activeFilters[LockfileEntryFilter.Doppelganger]) {
      groupedEntries = groupedEntries.filter((entry) => multipleVersions(entry.versions));
    }

    if (activeFilters[LockfileEntryFilter.Project]) {
      groupedEntries = groupedEntries.sort((a, b) =>
        a.entryName > b.entryName ? 1 : b.entryName > a.entryName ? -1 : 0
      );
    }

    return groupedEntries;
  };

  const changeFilter = useCallback(
    (filter: LockfileEntryFilter, enabled: boolean) => (): void => {
      dispatch(selectFilter({ filter, state: enabled }));
    },
    [dispatch]
  );

  const togglePackageView = useCallback(
    (selected: string) => {
      if (selected === 'Projects') {
        dispatch(selectFilter({ filter: LockfileEntryFilter.Project, state: true }));
        dispatch(selectFilter({ filter: LockfileEntryFilter.Package, state: false }));
      } else {
        dispatch(selectFilter({ filter: LockfileEntryFilter.Package, state: true }));
        dispatch(selectFilter({ filter: LockfileEntryFilter.Project, state: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, activeFilters]
  );

  if (!entries) {
    return ReactNull;
  } else {
    return (
      <div className={styles.ViewWrapper}>
        <div className={`${styles.ViewContents}`}>
          <Tabs
            items={[
              {
                header: 'Projects'
              },
              {
                header: 'Packages'
              }
            ]}
            value={activeFilters[LockfileEntryFilter.Project] ? 'Projects' : 'Packages'}
            onChange={togglePackageView}
          />
          <Input
            type="search"
            placeholder="Filter..."
            value={activeFilters[LockfileEntryFilter.Project] ? projectFilter : packageFilter}
            onChange={updateFilter(
              activeFilters[LockfileEntryFilter.Project]
                ? LockfileEntryFilter.Project
                : LockfileEntryFilter.Package
            )}
          />
          <ScrollArea>
            {getEntriesToShow().map((lockfileEntryGroup) => (
              <LockfileEntryLi group={lockfileEntryGroup} key={lockfileEntryGroup.entryName} />
            ))}
          </ScrollArea>
          {activeFilters[LockfileEntryFilter.Package] ? (
            <div className={styles.filterSection}>
              <Text type="h5" bold>
                Filters
              </Text>
              <Checkbox
                label="Must have side-by-side versions"
                isChecked={activeFilters[LockfileEntryFilter.SideBySide]}
                onChecked={changeFilter(
                  LockfileEntryFilter.SideBySide,
                  !activeFilters[LockfileEntryFilter.SideBySide]
                )}
              />
              <Checkbox
                label="Must have doppelgangers"
                isChecked={activeFilters[LockfileEntryFilter.Doppelganger]}
                onChecked={changeFilter(
                  LockfileEntryFilter.Doppelganger,
                  !activeFilters[LockfileEntryFilter.Doppelganger]
                )}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }
};
