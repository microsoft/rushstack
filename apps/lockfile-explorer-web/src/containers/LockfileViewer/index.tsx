import React, { Dispatch, useCallback, useState } from 'react';
import { LockfileEntry, LockfileEntryKind } from '../../parsing/LockfileEntry';
import { LockfileEntryListView } from './LockfileEntryListView';
import styles from './styles.scss';
import { LockfileEntryDetailsView } from './LockfileEntryDetailsView';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearStackAndPush, popStack, selectCurrentEntry } from '../../store/slices/entrySlice';

export const LockfileViewer = (): JSX.Element => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const entryStack = useAppSelector((state) => state.entry.selectedEntryStack);
  const entries = useAppSelector((state) =>
    state.entry.selection === LockfileEntryKind.Package
      ? state.entry.packageEntries
      : state.entry.projectEntries
  );
  const dispatch = useAppDispatch();

  const pop = useCallback(() => {
    dispatch(popStack());
  }, []);

  return (
    <div className={styles.LockfileViewerWrapper}>
      <LockfileEntryListView entries={entries} />
      {selectedEntry ? (
        <div className={styles.LockfileEntryListWrapper}>
          {entryStack.length > 1 ? <button onClick={pop}>back</button> : null}
          <LockfileEntryDetailsView />
        </div>
      ) : (
        <div className={styles.LockfileEntryListWrapper}>Select an entry to view details</div>
      )}
    </div>
  );
};
