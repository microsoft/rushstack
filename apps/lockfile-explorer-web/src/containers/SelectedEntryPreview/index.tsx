import React from 'react';
import styles from './styles.scss';
import { useAppSelector } from '../../store/hooks';
import { selectCurrentEntry } from '../../store/slices/entrySlice';

export const SelectedEntryPreview = (): JSX.Element => {
  const selectedEntry = useAppSelector(selectCurrentEntry);

  if (!selectedEntry) {
    return (
      <div className={styles.selectedEntryCard}>
        <h5>No Entry Selected</h5>
      </div>
    );
  }

  return (
    <div className={styles.selectedEntryCard}>
      <div className={styles.selectedEntryHeader}>
        <h5>Selected entry:</h5>
        <span>{selectedEntry.displayText}</span>
      </div>

      <p>{selectedEntry.packageJsonFolderPath}</p>
    </div>
  );
};
