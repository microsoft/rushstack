import React, { useCallback, useEffect, useState } from 'react';
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

  const [inspectDep, setInspectDep] = useState<LockfileDependency | null>(null);
  const [influencers, setInfluencers] = useState([]);

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
      if (inspectDep && inspectDep.name === dependency.name) {
        if (dependency.resolvedEntry) {
          dispatch(pushToStack(dependency.resolvedEntry));
        } else {
          console.error('No resolved entry for dependency: ', dependency);
        }
      } else {
        setInspectDep(dependency);
        console.log('current selected entry: ', selectedEntry);
        console.log('inspecting dependency: ', dependency);
        // calculate influencers
        const stack = [selectedEntry];
        const determinants = new Set();
        const transitiveReferrers = new Set();
        const visitedNodes = new Set();
        visitedNodes.add(selectedEntry);
        while (stack.length) {
          const currEntry = stack.pop();
          if (currEntry) {
            let flag = false;
            for (const referrer of currEntry.referencers) {
              for (const dep of referrer.dependencies) {
                if (dep.name === dependency.name) {
                  determinants.add(referrer);
                  flag = true;
                  break;
                } else if (!flag) {
                  transitiveReferrers.add(referrer);
                }
              }
            }
            if (!flag) {
              for (const referencer of currEntry.referencers) {
                if (!visitedNodes.has(referencer)) {
                  stack.push(referencer);
                  visitedNodes.add(referencer);
                }
              }
            }
          }
        }
        console.log('determinants: ', determinants);
        console.log('transitive referrers: ', transitiveReferrers);
      }
    },
    [selectedEntry, inspectDep]
  );

  const selectResolvedReferencer = useCallback(
    (referencer) => () => {
      dispatch(pushToStack(referencer));
    },
    [selectedEntry]
  );

  const renderPeerDependencies = () => {
    if (!selectedEntry) return null;
    const peerDeps = selectedEntry.dependencies.filter(
      (d) => d.dependencyType === IDependencyType.PEER_DEPENDENCY
    );
    console.log('peer deps: ', peerDeps);
    if (!peerDeps.length) {
      return (
        <div className={appStyles.containerCard}>
          <h5>No peer dependencies.</h5>
        </div>
      );
    }
    if (!inspectDep || inspectDep.dependencyType !== IDependencyType.PEER_DEPENDENCY) {
      return (
        <div>
          <h5>Select a peer dependency to view influencers</h5>
        </div>
      );
    }
    // Calculate determinants and transitive referrers

    return (
      <div className={appStyles.containerCard}>
        <h5>Influencers:</h5>
      </div>
    );
  };

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
                className={`${styles.DependencyItem} ${
                  inspectDep?.name === dependency.name && styles.SelectedDependencyItem
                }`}
                key={dependency.entryId}
                onClick={selectResolvedEntry(dependency)}
              >
                <h5>
                  Name: {dependency.name}{' '}
                  {dependency.dependencyType === IDependencyType.PEER_DEPENDENCY
                    ? `${
                        dependency.peerDependencyMeta.optional ? '(Optional)' : '(Non-Optional)'
                      } Peer Dependency`
                    : ''}
                </h5>
                <div>
                  <p>Version: {dependency.version}</p>
                  <p>Entry ID: {dependency.entryId}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {renderPeerDependencies()}
    </>
  );
};
