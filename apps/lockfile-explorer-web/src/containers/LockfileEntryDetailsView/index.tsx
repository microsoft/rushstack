// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollArea, Text } from '@rushstack/rush-themed-ui';

import styles from './styles.scss';
import appStyles from '../../App.scss';

import { LfxDependencyKind, type LfxGraphDependency, type LfxGraphEntry } from '../../packlets/lfx-shared';
import { readPackageJsonAsync } from '../../helpers/lfxApiClient';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { pushToStack, selectCurrentEntry } from '../../store/slices/entrySlice';
import { ReactNull } from '../../types/ReactNull';
import { logDiagnosticInfo } from '../../helpers/logDiagnosticInfo';
import { displaySpecChanges } from '../../helpers/displaySpecChanges';
import type { IPackageJson } from '../../types/IPackageJson';

enum DependencyType {
  Determinant,
  TransitiveReferrer
}

enum DependencyKey {
  Regular = 'dependencies',
  Dev = 'devDependencies',
  Peer = 'peerDependencies'
}

interface IInfluencerType {
  entry: LfxGraphEntry;
  type: DependencyType;
}

export const LockfileEntryDetailsView = (): JSX.Element | ReactNull => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const specChanges = useAppSelector((state) => state.workspace.specChanges);
  const dispatch = useAppDispatch();

  const [inspectDependency, setInspectDependency] = useState<LfxGraphDependency | null>(null);
  const [influencers, setInfluencers] = useState<IInfluencerType[]>([]);
  const [directRefsPackageJSON, setDirectRefsPackageJSON] = useState<Map<string, IPackageJson | undefined>>(
    new Map()
  );

  useEffect(() => {
    async function loadPackageJson(referrers: LfxGraphEntry[]): Promise<void> {
      const referrersJsonMap = new Map<string, IPackageJson | undefined>();
      await Promise.all(
        referrers.map(async (ref) => {
          const packageJson = await readPackageJsonAsync(ref.packageJsonFolderPath);
          referrersJsonMap.set(ref.rawEntryId, packageJson);
          return packageJson;
        })
      );

      setDirectRefsPackageJSON(referrersJsonMap);
    }

    loadPackageJson(selectedEntry?.referrers || []).catch((e) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to load referrers package.json: ${e}`);
    });
    if (selectedEntry) {
      setInspectDependency(null);
    }
  }, [selectedEntry]);

  const selectResolvedEntry = useCallback(
    (dependencyToTrace) => () => {
      if (inspectDependency && inspectDependency.entryId === dependencyToTrace.entryId) {
        if (dependencyToTrace.resolvedEntry) {
          dispatch(pushToStack(dependencyToTrace.resolvedEntry));
        } else {
          logDiagnosticInfo('No resolved entry for dependency:', dependencyToTrace);
        }
      } else if (selectedEntry) {
        // eslint-disable-next-line no-console
        console.log('dependency to trace: ', dependencyToTrace);
        setInspectDependency(dependencyToTrace);

        // Check if we need to calculate influencers.
        // If the current dependencyToTrace is a peer dependency then we do
        if (dependencyToTrace.dependencyType !== LfxDependencyKind.Peer) {
          return;
        }

        // calculate influencers
        const stack = [selectedEntry];
        const determinants = new Set<LfxGraphEntry>();
        const transitiveReferrers = new Set<LfxGraphEntry>();
        const visitedNodes = new Set<LfxGraphEntry>();
        visitedNodes.add(selectedEntry);
        while (stack.length) {
          const currEntry = stack.pop();
          if (currEntry) {
            for (const referrer1 of currEntry.referrers) {
              let hasDependency = false;
              for (const dependency of referrer1.dependencies) {
                if (dependency.name === dependencyToTrace.name) {
                  determinants.add(referrer1);
                  hasDependency = true;
                  break;
                }
              }
              if (!hasDependency) {
                if (referrer1.transitivePeerDependencies.has(dependencyToTrace.name)) {
                  transitiveReferrers.add(referrer1);
                } else {
                  // Since this referrer does not declare "dependency", it is a
                  // transitive peer dependency, and we call the referrer a "transitive referrer".
                  // PNPM should have added it to the "transitivePeerDependencies" list in the
                  // YAML file.  If not, either something is wrong with our algorithm, or else
                  // something has changed about how PNPM manages its "transitivePeerDependencies"
                  // field.
                  // eslint-disable-next-line no-console
                  console.error(
                    'Error analyzing influencers: A referrer appears to be missing its "transitivePeerDependencies" field in the YAML file: ',
                    dependencyToTrace,
                    referrer1,
                    currEntry
                  );
                }

                for (const referrer2 of currEntry.referrers) {
                  if (!visitedNodes.has(referrer2)) {
                    stack.push(referrer2);
                    visitedNodes.add(referrer2);
                  }
                }
              }
            }
          }
        }
        const newInfluencers: IInfluencerType[] = [];
        for (const determinant of determinants.values()) {
          newInfluencers.push({
            entry: determinant,
            type: DependencyType.Determinant
          });
        }
        for (const referrer of transitiveReferrers.values()) {
          newInfluencers.push({
            entry: referrer,
            type: DependencyType.TransitiveReferrer
          });
        }
        setInfluencers(newInfluencers);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedEntry, inspectDependency]
  );

  const selectResolvedReferencer = useCallback(
    (referrer) => () => {
      dispatch(pushToStack(referrer));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedEntry]
  );

  const renderDependencyMetadata = (): JSX.Element | ReactNull => {
    if (!inspectDependency) {
      return ReactNull;
    }
    return (
      <div className={`${styles.DependencyDetails}`}>
        <ScrollArea>
          <div className={styles.DependencyDetailInfo}>
            <Text type="h5" bold>
              Selected&nbsp;Dependency:{' '}
            </Text>
            <Text type="span">
              {inspectDependency.name}: {inspectDependency.version}
            </Text>
          </div>
          <div className={styles.DependencyDetailInfo}>
            <Text type="h5" bold>
              package.json spec:{' '}
            </Text>
            <Text type="span">
              {inspectDependency.dependencyType === LfxDependencyKind.Peer
                ? `"${inspectDependency.peerDependencyMeta.version}" ${
                    inspectDependency.peerDependencyMeta.optional ? 'Optional' : 'Required'
                  } Peer`
                : inspectDependency.version}
            </Text>
          </div>
          <div className={styles.DependencyDetailInfo}>
            <Text type="h5" bold>
              .pnpmfile.cjs:{' '}
            </Text>
            <Text type="span">
              {specChanges.has(inspectDependency.name)
                ? displaySpecChanges(specChanges, inspectDependency.name)
                : 'No Effect'}
            </Text>
          </div>
        </ScrollArea>
      </div>
    );
  };

  const renderPeerDependencies = (): JSX.Element | ReactNull => {
    if (!selectedEntry) return ReactNull;
    const peerDeps = selectedEntry.dependencies.filter((d) => d.dependencyType === LfxDependencyKind.Peer);
    if (!peerDeps.length) {
      return (
        <div className={`${appStyles.ContainerCard} ${styles.InfluencerList}`}>
          <Text type="h5">No peer dependencies.</Text>
        </div>
      );
    }
    if (!inspectDependency || inspectDependency.dependencyType !== LfxDependencyKind.Peer) {
      return (
        <div className={`${appStyles.ContainerCard} ${styles.InfluencerList}`}>
          <Text type="h5">Select a peer dependency to view its influencers</Text>
        </div>
      );
    }

    const determinants = influencers.filter((inf) => inf.type === DependencyType.Determinant);
    const transitiveReferrers = influencers.filter((inf) => inf.type === DependencyType.TransitiveReferrer);

    return (
      <div className={`${appStyles.ContainerCard} ${styles.InfluencerList}`}>
        <ScrollArea>
          <Text type="h5" bold>
            Determinants:
          </Text>
          {determinants.length ? (
            determinants.map(({ entry }) => (
              <a
                className={styles.InfluencerEntry}
                key={entry.rawEntryId}
                onClick={selectResolvedReferencer(entry)}
              >
                {entry.displayText}
              </a>
            ))
          ) : (
            <Text type="p">(none)</Text>
          )}
          <Text type="h5" bold className={styles.TransitiveReferencersHeader}>
            Transitive Referencers:
          </Text>
          {transitiveReferrers.length ? (
            transitiveReferrers.map(({ entry }) => (
              <a
                className={styles.InfluencerEntry}
                key={entry.rawEntryId}
                onClick={selectResolvedReferencer(entry)}
              >
                {entry.displayText}
              </a>
            ))
          ) : (
            <Text type="p">(none)</Text>
          )}
        </ScrollArea>
      </div>
    );
  };

  const getDependencyInfo = (
    rawEntryId: string,
    entryPackageName: string
  ): { type: DependencyKey; version: string } | undefined => {
    const packageJson = directRefsPackageJSON.get(rawEntryId);
    if (!packageJson) return undefined;

    const dependencyTypes = [DependencyKey.Regular, DependencyKey.Dev, DependencyKey.Peer];

    for (const type of dependencyTypes) {
      const version = packageJson[type]?.[entryPackageName];
      if (version) {
        return { type, version };
      }
    }
    return undefined;
  };

  if (!selectedEntry) {
    return (
      <div className={`${appStyles.ContainerCard} ${styles.InfluencerList}`}>
        <Text type="h5" bold>
          Select an entry to view its details
        </Text>
      </div>
    );
  }

  return (
    <>
      <div className={styles.LockfileEntryListView}>
        <div className={appStyles.ContainerCard}>
          <Text type="h4" bold>
            Direct Referrers
          </Text>
          <div className={styles.DependencyListWrapper}>
            <ScrollArea>
              {selectedEntry.referrers?.map((referrer: LfxGraphEntry) => (
                <div
                  className={styles.DependencyItem}
                  key={referrer.rawEntryId}
                  onClick={selectResolvedReferencer(referrer)}
                >
                  <Text type="h5" bold>
                    Name: {referrer.displayText}
                  </Text>
                  <div>
                    <Text type="p">Entry ID: {referrer.rawEntryId}</Text>
                    <Text type="p">
                      {'Dependency version: '}
                      {getDependencyInfo(referrer.rawEntryId, selectedEntry.entryPackageName)?.version}
                    </Text>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>
        <div className={appStyles.ContainerCard}>
          <Text type="h4" bold>
            Direct Dependencies
          </Text>
          <div className={styles.DependencyListWrapper}>
            <ScrollArea>
              {selectedEntry.dependencies?.map((dependency: LfxGraphDependency) => (
                <div
                  className={`${styles.DependencyItem} ${
                    inspectDependency?.entryId === dependency.entryId && styles.SelectedDependencyItem
                  }`}
                  key={dependency.entryId || dependency.name}
                  onClick={selectResolvedEntry(dependency)}
                >
                  <Text type="h5" bold>
                    Name: {dependency.name}{' '}
                    {dependency.dependencyType === LfxDependencyKind.Peer
                      ? `${
                          dependency.peerDependencyMeta.optional ? '(Optional)' : '(Non-optional)'
                        } Peer Dependency`
                      : ''}
                  </Text>
                  <div>
                    <Text type="p">Version: {dependency.version}</Text>
                    <Text type="p">Entry ID: {dependency.entryId}</Text>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>
      </div>
      {renderDependencyMetadata()}
      {renderPeerDependencies()}
    </>
  );
};
