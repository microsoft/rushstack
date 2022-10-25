import React, { useCallback, useEffect } from 'react';
import styles from './styles.scss';
import appStyles from '../../appstyles.scss';
import { IDependencyType, LockfileDependency } from '../../parsing/LockfileDependency';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { pushToStack, selectCurrentEntry } from '../../store/slices/entrySlice';
import { ReactNull } from '../../types/ReactNull';
import { LockfileEntry } from '../../parsing/LockfileEntry';
import { findPeerDependencies } from '../../parsing/findPeerDependencies';

export const LockfileEntryDetailsView = (): JSX.Element | ReactNull => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (selectedEntry) {
      findPeerDependencies(selectedEntry);
      console.log(
        'peers',
        selectedEntry.dependencies.filter((d) => d.dependencyType === IDependencyType.PEER_DEPENDENCY)
      );
    }
  }, [selectedEntry]);

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

  const selectResolvedReferencer = useCallback(
    (referencer) => () => {
      dispatch(pushToStack(referencer));
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
    <>
      <div className={styles.LockfileEntryListView}>
        <div className={appStyles.containerCard}>
          <h5>Direct Referrers</h5>
          <div className={styles.DependencyListWrapper}>
            {selectedEntry.referencers?.map((referencer: LockfileEntry) => (
              <div
                className={styles.DependencyItem}
                key={referencer.rawEntryId}
                onClick={selectResolvedReferencer(referencer)}
              >
                <h5>Name: {referencer.displayText}</h5>
                <div>
                  <p>Entry ID: {referencer.rawEntryId}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={appStyles.containerCard}>
          <h5>Direct Dependencies</h5>
          <div className={styles.DependencyListWrapper}>
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
      </div>
      <div>
        <h5>Peer dependencies:</h5>
        {selectedEntry.dependencies
          .filter((d) => d.dependencyType === IDependencyType.PEER_DEPENDENCY)
          .map((dep) => (
            <div className={styles.DependencyItem} key={dep.name} onClick={selectResolvedEntry(dep)}>
              <h5>Name: {dep.peerDependencyMeta.name}</h5>
              <div>
                <p>Version: {dep.peerDependencyMeta.version}</p>
                <p>optional: {`${dep.peerDependencyMeta.optional}`}</p>
              </div>
            </div>
          ))}
      </div>
    </>
  );
};
