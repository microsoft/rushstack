import React, { Dispatch } from 'react';
import { LockfileDependency, LockfileEntry } from '../../../parsing/LockfileNode';
import styles from './styles.scss';

export const LockfileEntryDetailsView = ({
  entry,
  selectEntry
}: {
  entry: LockfileEntry;
  selectEntry: Dispatch<LockfileEntry>;
}) => {
  console.log('entry: ', entry);
  return (
    <div className={styles.LockfileEntryListView}>
      <h4>{entry.entryId}</h4>
      <h5>Dependencies</h5>
      {entry.dependencies?.map((dependency: LockfileDependency) => (
        <div
          className={styles.DependencyItem}
          key={dependency.entryId}
          onClick={() => dependency.resolvedEntry && selectEntry(dependency.resolvedEntry)}
        >
          <h5>Name: {dependency.name}</h5>
          <p>Version: {dependency.version}</p>
          <p>Entry ID: {dependency.entryId}</p>
        </div>
      ))}
    </div>
  );
};
