import React, { Dispatch, useCallback, useState } from 'react';
import { LockfileEntry, LockfileEntryKind } from '../../parsing/LockfileEntry';
import { LockfileEntryListView } from './LockfileEntryListView';
import styles from './styles.scss';
import { LockfileEntryDetailsView } from './LockfileEntryDetailsView';

export const LockfileViewer = ({
  lockfile,
  setSelection
}: {
  lockfile: LockfileEntry[];
  setSelection: Dispatch<LockfileEntryKind>;
}) => {
  const [selectedEntry, setSelectedEntry] = useState<LockfileEntry | undefined>();

  const [entryStack, setEntryStack] = useState<LockfileEntry[]>([]);

  const clearStackAndPush = useCallback((entry: LockfileEntry) => {
    setEntryStack([entry]);
    setSelectedEntry(entry);
  }, []);

  const pushToStack = useCallback((entry: LockfileEntry) => {
    if (!entry) return;
    const newStack = [...entryStack, entry];
    setEntryStack(newStack);
    setSelectedEntry(entry);
  }, []);

  const popStack = useCallback(() => {
    if (entryStack.length > 1) {
      entryStack.pop();
      setSelectedEntry(entryStack[entryStack.length - 1]);
    }
  }, []);

  return (
    <div className={styles.LockfileViewerWrapper}>
      <LockfileEntryListView entries={lockfile} selectEntry={clearStackAndPush} setSelection={setSelection} />
      {selectedEntry ? (
        <div className={styles.LockfileEntryListWrapper}>
          {entryStack.length > 1 ? <button onClick={popStack}>back</button> : null}
          <LockfileEntryDetailsView entry={selectedEntry} selectEntry={pushToStack} />
        </div>
      ) : (
        <div className={styles.LockfileEntryListWrapper}>Select an entry to view details</div>
      )}
    </div>
  );
};
