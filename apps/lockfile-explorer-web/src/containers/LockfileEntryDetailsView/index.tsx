import React, { useCallback, useEffect, useState } from 'react';
import styles from './styles.scss';
import appStyles from '../../appstyles.scss';
import { IDependencyType, LockfileDependency } from '../../parsing/LockfileDependency';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { pushToStack, selectCurrentEntry } from '../../store/slices/entrySlice';
import { ReactNull } from '../../types/ReactNull';
import { LockfileEntry } from '../../parsing/LockfileEntry';

enum InfluencerTypes {
  DETERMINANT,
  TRANSITIVE_REFERRER
}

interface IInfluencerType {
  entry: LockfileEntry;
  type: InfluencerTypes;
}

export const LockfileEntryDetailsView = (): JSX.Element | ReactNull => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const dispatch = useAppDispatch();

  const [inspectDep, setInspectDep] = useState<LockfileDependency | null>(null);
  const [influencers, setInfluencers] = useState<IInfluencerType[]>([]);

  useEffect(() => {
    if (selectedEntry) {
      setInspectDep(null);
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
      } else if (selectedEntry) {
        setInspectDep(dependency);
        // calculate influencers
        const stack = [selectedEntry];
        const determinants = new Set<LockfileEntry>();
        const transitiveReferrers = new Set<LockfileEntry>();
        const visitedNodes = new Set<LockfileEntry>();
        visitedNodes.add(selectedEntry);
        while (stack.length) {
          const currEntry = stack.pop();
          if (currEntry) {
            for (const referrer of currEntry.referencers) {
              let flag = false;
              for (const dep of referrer.dependencies) {
                if (dep.name === dependency.name) {
                  determinants.add(referrer);
                  flag = true;
                  break;
                }
              }
              if (!flag) {
                if (referrer.transitivePeerDependencies.has(dependency.name)) {
                  transitiveReferrers.add(referrer);
                } else {
                  console.error('Found referrer that does not correctly state tpd: ', referrer);
                }
                for (const referencer of currEntry.referencers) {
                  if (!visitedNodes.has(referencer)) {
                    stack.push(referencer);
                    visitedNodes.add(referencer);
                  }
                }
              }
            }
          }
        }
        const influencers: IInfluencerType[] = [];
        for (const det of determinants.values()) {
          influencers.push({
            entry: det,
            type: InfluencerTypes.DETERMINANT
          });
        }
        for (const ref of transitiveReferrers.values()) {
          influencers.push({
            entry: ref,
            type: InfluencerTypes.TRANSITIVE_REFERRER
          });
        }
        setInfluencers(influencers);
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

  const renderPeerDependencies = (): JSX.Element | ReactNull => {
    if (!selectedEntry) return ReactNull;
    const peerDeps = selectedEntry.dependencies.filter(
      (d) => d.dependencyType === IDependencyType.PEER_DEPENDENCY
    );
    if (!peerDeps.length) {
      return (
        <div className={appStyles.ContainerCard}>
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

    return (
      <div className={appStyles.ContainerCard}>
        <h5>Influencers:</h5>
        {influencers
          .filter((inf) => inf.type === InfluencerTypes.DETERMINANT)
          .map(({ entry }) => (
            <div key={entry.rawEntryId}>{entry.displayText}</div>
          ))}
        <h5>Transitive Referencers:</h5>
        {influencers
          .filter((inf) => inf.type === InfluencerTypes.TRANSITIVE_REFERRER)
          .map(({ entry }) => (
            <div key={entry.rawEntryId}>{entry.displayText}</div>
          ))}
      </div>
    );
  };

  if (!selectedEntry) {
    return (
      <div className={appStyles.ContainerCard}>
        <h5>Please select an entry to view details</h5>
      </div>
    );
  }

  return (
    <>
      <div className={styles.LockfileEntryListView}>
        <div className={appStyles.ContainerCard}>
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
        <div className={appStyles.ContainerCard}>
          <h5>Direct Dependencies</h5>
          <div className={styles.DependencyListWrapper}>
            {selectedEntry.dependencies?.map((dependency: LockfileDependency) => (
              <div
                className={`${styles.DependencyItem} ${
                  inspectDep?.name === dependency.name && styles.SelectedDependencyItem
                }`}
                key={dependency.entryId || dependency.name}
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
