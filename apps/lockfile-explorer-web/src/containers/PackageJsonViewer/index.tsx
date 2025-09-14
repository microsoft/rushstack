// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useState } from 'react';
import { readPnpmfileAsync, readPackageSpecAsync, readPackageJsonAsync } from '../../helpers/lfxApiClient';
import styles from './styles.scss';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectCurrentEntry } from '../../store/slices/entrySlice';
import type { IPackageJson } from '../../types/IPackageJson';
import { compareSpec } from '../../parsing/compareSpec';
import { loadSpecChanges } from '../../store/slices/workspaceSlice';
import { displaySpecChanges } from '../../helpers/displaySpecChanges';
import { isEntryModified } from '../../helpers/isEntryModified';
import { ScrollArea, Tabs, Text } from '@rushstack/rush-themed-ui';
import { LfxGraphEntryKind } from '../../packlets/lfx-shared';

const PackageView: { [key: string]: string } = {
  PACKAGE_JSON: 'PACKAGE_JSON',
  PACKAGE_SPEC: 'PACKAGE_SPEC',
  PARSED_PACKAGE_JSON: 'PARSED_PACKAGE_JSON'
};

export const PackageJsonViewer = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const [packageJSON, setPackageJSON] = useState<IPackageJson | undefined>(undefined);
  const [parsedPackageJSON, setParsedPackageJSON] = useState<IPackageJson | undefined>(undefined);
  const [pnpmfile, setPnpmfile] = useState('');
  const selectedEntry = useAppSelector(selectCurrentEntry);

  const specChanges = useAppSelector((state) => state.workspace.specChanges);

  const [selection, setSelection] = useState<string>(PackageView.PARSED_PACKAGE_JSON);

  const cb = useCallback((s: string) => {
    setSelection(s);
  }, []);

  useEffect(() => {
    async function loadPnpmFileAsync(): Promise<void> {
      const repoPnpmfile = await readPnpmfileAsync();
      setPnpmfile(repoPnpmfile);
    }
    loadPnpmFileAsync().catch((e) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to load project's pnpm file: ${e}`);
    });
  }, []);

  useEffect(() => {
    async function loadPackageDetailsAsync(packageName: string): Promise<void> {
      const packageJSONFile = await readPackageJsonAsync(packageName);
      setPackageJSON(packageJSONFile);
      const parsedJSON = await readPackageSpecAsync(packageName);
      setParsedPackageJSON(parsedJSON);

      if (packageJSONFile && parsedJSON) {
        const diffDeps = compareSpec(packageJSONFile, parsedJSON);
        dispatch(loadSpecChanges(diffDeps));
      }
    }
    if (selectedEntry) {
      if (selectedEntry.entryPackageName) {
        loadPackageDetailsAsync(selectedEntry.packageJsonFolderPath).catch((e) => {
          // eslint-disable-next-line no-console
          console.error(`Failed to load project information: ${e}`);
        });
      } else {
        // This is used to develop the lockfile explorer application in case there is a mistake in our logic
        // eslint-disable-next-line no-console
        console.log('The selected entry has no entry name: ', selectedEntry.entryPackageName);
      }
    }
  }, [dispatch, selectedEntry]);

  const renderDep =
    (name: boolean): ((dependencyDetails: [string, string]) => JSX.Element) =>
    (dependencyDetails) => {
      const [dep, version] = dependencyDetails;
      if (specChanges.has(dep)) {
        switch (specChanges.get(dep)?.type) {
          case 'add':
            if (name) {
              return (
                <Text type="p" key={dep}>
                  <span className={styles.AddedSpec}>{dep}</span>
                </Text>
              );
            } else {
              return (
                <Text type="p" key={dep}>
                  {version} {displaySpecChanges(specChanges, dep)}
                </Text>
              );
            }
          case 'diff':
            if (name) {
              return (
                <Text type="p" key={dep}>
                  <span className={styles.ChangedSpec}>{dep}</span>
                </Text>
              );
            } else {
              return (
                <Text type="p" key={dep}>
                  {version} {displaySpecChanges(specChanges, dep)}
                </Text>
              );
            }
          case 'remove':
            if (name) {
              return (
                <Text type="p" key={dep}>
                  <span className={styles.DeletedSpec}>{dep}</span>
                </Text>
              );
            } else {
              return (
                <Text type="p" key={dep}>
                  {version} {displaySpecChanges(specChanges, dep)}
                </Text>
              );
            }
          default:
            if (name) {
              return (
                <Text type="p" key={dep}>
                  {dep}:
                </Text>
              );
            } else {
              return (
                <Text type="p" key={dep}>
                  {version}
                </Text>
              );
            }
        }
      } else {
        if (name) {
          return (
            <Text type="p" key={dep}>
              {dep}:
            </Text>
          );
        } else {
          return (
            <Text type="p" key={dep}>
              {version}
            </Text>
          );
        }
      }
    };

  const renderFile = (): JSX.Element | null => {
    switch (selection) {
      case PackageView.PACKAGE_JSON:
        if (!packageJSON)
          return (
            <Text type="h5" bold>
              Please select a Project or Package to view it&apos;s package.json
            </Text>
          );
        return <pre>{JSON.stringify(packageJSON, null, 2)}</pre>;
      case PackageView.PACKAGE_SPEC:
        if (!pnpmfile) {
          return (
            <Text type="h5" bold>
              Couldn&apos;t load the pnpmfile.cjs file - does it exist in the expected location?
              (/common/config/rush/.pnpmfile.cjs)
            </Text>
          );
        }
        return <pre>{pnpmfile}</pre>;
      case PackageView.PARSED_PACKAGE_JSON:
        if (!parsedPackageJSON)
          return (
            <Text type="h5" bold>
              Please select a Project or Package to view the parsed package.json
            </Text>
          );
        return (
          <div className={styles.PackageSpecWrapper}>
            <div className={styles.PackageSpecEntry}>
              <Text type="h5" bold>
                Package Name:
              </Text>
              <Text type="p">
                {selectedEntry?.kind === LfxGraphEntryKind.Project
                  ? parsedPackageJSON.name
                  : selectedEntry?.displayText}
              </Text>
            </div>
            <div className={styles.PackageSpecEntry}>
              <Text type="h5" bold>
                Version:
              </Text>
              <Text type="p">{selectedEntry?.entryPackageVersion || parsedPackageJSON.version}</Text>
            </div>
            <div className={styles.DependencyRows}>
              <div>
                <Text type="h5" bold>
                  Dependencies
                </Text>
                {parsedPackageJSON.dependencies &&
                  Object.entries(parsedPackageJSON.dependencies).map(renderDep(true))}

                <Text type="h5" bold>
                  Dev Dependencies
                </Text>
                {parsedPackageJSON.devDependencies &&
                  Object.entries(parsedPackageJSON.devDependencies).map(renderDep(true))}

                <Text type="h5" bold>
                  Peer Dependencies
                </Text>
                {parsedPackageJSON.peerDependencies &&
                  Object.entries(parsedPackageJSON.peerDependencies).map(renderDep(true))}
              </div>
              <div>
                <Text type="h5" bold>
                  &nbsp;
                </Text>
                {parsedPackageJSON.dependencies &&
                  Object.entries(parsedPackageJSON.dependencies).map(renderDep(false))}

                <Text type="h5" bold>
                  &nbsp;
                </Text>
                {parsedPackageJSON.devDependencies &&
                  Object.entries(parsedPackageJSON.devDependencies).map(renderDep(false))}

                <Text type="h5" bold>
                  &nbsp;
                </Text>
                {parsedPackageJSON.peerDependencies &&
                  Object.entries(parsedPackageJSON.peerDependencies).map(renderDep(false))}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.PackageJsonWrapper}>
      <Tabs
        items={[
          {
            header: `package spec ${isEntryModified(selectedEntry, specChanges) ? '*' : ''}`,
            value: PackageView.PARSED_PACKAGE_JSON
          },
          {
            header: 'package.json',
            value: PackageView.PACKAGE_JSON
          },
          {
            header: '.pnpmfile.cjs',
            value: PackageView.PACKAGE_SPEC
          }
        ]}
        value={selection}
        onChange={cb}
      />

      <div className={styles.FileContents}>
        <ScrollArea>
          <div className={styles.FileInnerContent}>{renderFile()}</div>
        </ScrollArea>
      </div>
    </div>
  );
};
