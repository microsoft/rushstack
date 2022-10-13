import React, { useCallback } from 'react';
import styles from './styles.scss';
import appStyles from '../../appstyles.scss';
import { LockfileDependency } from '../../parsing/LockfileDependency';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { pushToStack, selectCurrentEntry } from '../../store/slices/entrySlice';
import { ReactNull } from '../../types/ReactNull';

export const LockfileEntryDetailsView = (): JSX.Element | ReactNull => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const dispatch = useAppDispatch();

  console.log('selected entry: ', selectedEntry);

  const selectResolvedEntry = useCallback(
    (dependency) => () => {
      if (dependency.resolvedEntry) {
        dispatch(pushToStack(dependency.resolvedEntry));
      } else {
        console.error('No resolved entry for dependency: ', dependency);
      }
    },
    [selectedEntry]
  );

  if (!selectedEntry) {
    return (
      <div className={appStyles.containerCard}>
        <h5>Please select an entry to view details</h5>
      </div>
    );
  }

  return (
    <div className={styles.LockfileEntryListView}>
      <div className={appStyles.containerCard}>
        <h5>Direct Referrers</h5>
        {selectedEntry.referencers?.map((referencer: LockfileDependency) => (
          <div
            className={styles.DependencyItem}
            key={referencer.entryId}
            onClick={selectResolvedEntry(referencer)}
          >
            <h5>Name: {referencer.name}</h5>
            <div>
              <p>Version: {referencer.version}</p>
              <p>Entry ID: {referencer.entryId}</p>
            </div>
          </div>
        ))}
      </div>
      <div className={appStyles.containerCard}>
        <h5>Direct Dependencies</h5>
        {selectedEntry.dependencies?.map((dependency: LockfileDependency) => (
          <div
            className={styles.DependencyItem}
            key={dependency.entryId}
            onClick={selectResolvedEntry(dependency)}
          >
            <h5>Name: {dependency.name}</h5>
            <div>
              <p>Version: {dependency.version}</p>
              <p>Entry ID: {dependency.entryId}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
