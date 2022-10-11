import React, { Dispatch, useCallback } from 'react';
import { LockfileDependency, LockfileEntry } from '../../../parsing/LockfileNode';
import styles from './styles.scss';

export const LockfileEntryDetailsView = ({
  entry,
  selectEntry
}: {
  entry: LockfileEntry;
  selectEntry: Dispatch<LockfileEntry>;
}) => {
  const selectResolvedEntry = useCallback(
    (dependency) => () => dependency.resolvedEntry && selectEntry(dependency.resolvedEntry),
    []
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
