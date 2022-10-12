import React, { Dispatch, useCallback, useState } from 'react';
import styles from './styles.scss';
import LockfileStyles from '../styles.scss';
import { LockfileEntry, LockfileEntryKind } from '../../../parsing/LockfileEntry';
import { ReactNull } from '../../../types/ReactNull';
import { useAppDispatch } from '../../../store/hooks';
import { clearStackAndPush, setSelection } from '../../../store/slices/entrySlice';

const LockfileEntryLi = ({ entry }: { entry: LockfileEntry }): JSX.Element => {
  const dispatch = useAppDispatch();
  const clear = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(clearStackAndPush(entry));
    },
    []
  );
  return (
    <div className={styles.LockfileEntryListViewWrapper} onClick={clear(entry)}>
      <h5>{entry.displayText}</h5>
    </div>
  );
};

export const LockfileEntryListView = ({ entries }: { entries: LockfileEntry[] }): JSX.Element | ReactNull => {
  const [filter, setFilter] = useState('');
  const updateFilter = useCallback((e) => setFilter(e.target.value), []);

  const dispatch = useAppDispatch();
  const selectPackage = useCallback((type: LockfileEntryKind) => () => dispatch(setSelection(type)), []);

  if (!entries) return ReactNull;

  const getEntriesToShow = (): LockfileEntry[] => {
    if (filter) {
      return entries.filter((entry) => entry.entryId.indexOf(filter) !== -1);
    } else {
      return entries;
    }
  };

  return (
    <div className={LockfileStyles.LockfileEntryListWrapper}>
      <button onClick={selectPackage(LockfileEntryKind.Project)}>View Projects</button>
      <button onClick={selectPackage(LockfileEntryKind.Package)}>View Packages</button>
      <div className={styles.LockfileFilterBar}>
        <h5>filter:</h5>
        <input type="text" value={filter} onChange={updateFilter} />
      </div>
      <div className="lockfileEntries">
        {getEntriesToShow().map((lockfileEntry) => (
          <LockfileEntryLi entry={lockfileEntry} key={lockfileEntry.displayText} />
        ))}
      </div>
    </div>
  );
};
