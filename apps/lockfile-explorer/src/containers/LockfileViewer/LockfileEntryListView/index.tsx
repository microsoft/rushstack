import React, { Dispatch, useState } from 'react';
import styles from './styles.scss';
import LockfileStyles from '../styles.scss';
import { LockfileEntry, LockfileEntryKind } from '../../../parsing/LockfileNode';

const LockfileEntryLi = ({
  entry,
  selectEntry
}: {
  entry: LockfileEntry;
  selectEntry: (entry: LockfileEntry) => void;
}) => {
  return (
    <div className={styles.LockfileEntryListViewWrapper} onClick={() => selectEntry(entry)}>
      <h5>{entry.displayText}</h5>
    </div>
  );
};

export const LockfileEntryListView = ({
  entries,
  selectEntry,
  setSelection
}: {
  entries: LockfileEntry[];
  selectEntry: (entry: LockfileEntry) => void;
  setSelection: Dispatch<LockfileEntryKind>;
}) => {
  const [filter, setFilter] = useState('');
  if (!entries) return null;

  const getEntriesToShow = () => {
    if (filter) {
      return entries.filter((entry) => entry.entryId.indexOf(filter) !== -1);
    } else {
      return entries;
    }
  };

  return (
    <div className={LockfileStyles.LockfileEntryListWrapper}>
      <button onClick={() => setSelection(LockfileEntryKind.Project)}>View Projects</button>
      <button onClick={() => setSelection(LockfileEntryKind.Package)}>View Packages</button>
      <div className={styles.LockfileFilterBar}>
        <h5>filter:</h5>
        <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="lockfileEntries">
        {getEntriesToShow().map((lockfileEntry) => (
          <LockfileEntryLi selectEntry={selectEntry} entry={lockfileEntry} key={lockfileEntry.displayText} />
        ))}
      </div>
    </div>
  );
};
