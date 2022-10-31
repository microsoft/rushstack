import React, { Dispatch, useCallback } from 'react';
import { LockfileEntry } from '../../../parsing/LockfileEntry';
import styles from './styles.scss';
import { LockfileDependency } from '../../../parsing/LockfileDependency';

export const LockfileEntryDetailsView = ({
  entry,
  selectEntry
}: {
  entry: LockfileEntry;
  selectEntry: Dispatch<LockfileEntry>;
}): JSX.Element => {
  const selectResolvedEntry = useCallback(
    (dependency) => () => {
      if (dependency.resolvedEntry) {
        selectEntry(dependency.resolvedEntry);
      } else {
        console.error('No resolved entry for dependency: ', dependency);
      }
    },
    [entry]
  );

  return (
    <div className={styles.LockfileEntryListView}>
      <h4>{entry.entryId}</h4>
      <h5>Dependencies</h5>
      {entry.dependencies?.map((dependency: LockfileDependency) => (
        <div
          className={styles.DependencyItem}
          key={dependency.entryId}
          onClick={selectResolvedEntry(dependency)}
        >
          <h5>Name: {dependency.name}</h5>
          <p>Version: {dependency.version}</p>
          <p>Entry ID: {dependency.entryId}</p>
        </div>
      ))}
    </div>
  );
};
