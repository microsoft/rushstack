import React, { useCallback, useState } from 'react';
import appStyles from '../../appstyles.scss';
import styles from './styles.scss';
import { LockfileEntry, LockfileEntryKind } from '../../parsing/LockfileEntry';
import { ReactNull } from '../../types/ReactNull';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearStackAndPush, popStack, setSelection } from '../../store/slices/entrySlice';

const LockfileEntryLi = ({ entry }: { entry: LockfileEntry }): JSX.Element => {
  const dispatch = useAppDispatch();
  const clear = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(clearStackAndPush(entry));
    },
    []
  );
  return (
    <div onClick={clear(entry)} className={styles.lockfileEntries}>
      <h5>{entry.displayText}</h5>
    </div>
  );
};

export const LockfileViewer = (): JSX.Element | ReactNull => {
  const [filter, setFilter] = useState('');
  const entries = useAppSelector((state) =>
    state.entry.selection === LockfileEntryKind.Package
      ? state.entry.packageEntries
      : state.entry.projectEntries
  );
  const updateFilter = useCallback((e) => setFilter(e.target.value), []);

  // const selectedEntry = useAppSelector(selectCurrentEntry);
  const entryStack = useAppSelector((state) => state.entry.selectedEntryStack);

  const dispatch = useAppDispatch();
  const selectPackage = useCallback((type: LockfileEntryKind) => () => dispatch(setSelection(type)), []);

  if (!entries) return ReactNull;

  const pop = useCallback(() => {
    dispatch(popStack());
  }, []);

  const getEntriesToShow = (): LockfileEntry[] => {
    if (filter) {
      return entries.filter((entry) => entry.entryId.indexOf(filter) !== -1);
    } else {
      return entries;
    }
  };

  return (
    <div className={appStyles.containerCard}>
      <button onClick={selectPackage(LockfileEntryKind.Project)}>View Projects</button>
      <button onClick={selectPackage(LockfileEntryKind.Package)}>View Packages</button>
      <div className={styles.LockfileFilterBar}>
        <h5>filter:</h5>
        <input type="text" value={filter} onChange={updateFilter} />
      </div>
      {entryStack.length > 1 ? <button onClick={pop}>back</button> : null}
      <div>
        {getEntriesToShow().map((lockfileEntry) => (
          <LockfileEntryLi entry={lockfileEntry} key={lockfileEntry.displayText} />
        ))}
      </div>
    </div>
  );
};
