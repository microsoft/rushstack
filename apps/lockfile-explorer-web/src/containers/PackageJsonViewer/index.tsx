// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useState } from 'react';
import { readPnpmfileAsync, readPackageSpecAsync, readPackageJsonAsync } from '../../parsing/getPackageFiles';
import styles from './styles.scss';
import appStyles from '../../App.scss';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectCurrentEntry } from '../../store/slices/entrySlice';
import { IPackageJson } from '../../types/IPackageJson';
import { compareSpec } from '../../parsing/compareSpec';
import { loadSpecChanges } from '../../store/slices/workspaceSlice';
import { displaySpecChanges } from '../../helpers/displaySpecChanges';
import { isEntryModified } from '../../helpers/isEntryModified';
import { Tabs } from '@rushstack/components';

enum PackageView {
  PACKAGE_JSON,
  PACKAGE_SPEC,
  PARSED_PACKAGE_JSON
}

export const PackageJsonViewer = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const [packageJSON, setPackageJSON] = useState<IPackageJson | undefined>(undefined);
  const [parsedPackageJSON, setParsedPackageJSON] = useState<IPackageJson | undefined>(undefined);
  const [pnpmfile, setPnpmfile] = useState('');
  const selectedEntry = useAppSelector(selectCurrentEntry);

  const specChanges = useAppSelector((state) => state.workspace.specChanges);

  const [selection, setSelection] = useState<PackageView>(PackageView.PARSED_PACKAGE_JSON);

  const cb = useCallback((s: PackageView) => setSelection(s), []);
  console.log('selection: ', selection);

  useEffect(() => {
    async function loadPnpmFileAsync(): Promise<void> {
      const pnpmfile = await readPnpmfileAsync();
      setPnpmfile(pnpmfile);
    }
    loadPnpmFileAsync().catch((e) => {
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
          console.error(`Failed to load project information: ${e}`);
        });
      } else {
        // This is used to develop the lockfile explorer application in case there is a mistake in our logic
        console.log('The selected entry has no entry name: ', selectedEntry.entryPackageName);
      }
    }
  }, [selectedEntry]);

  const renderDep =
    (name: boolean): ((dependencyDetails: [string, string]) => JSX.Element) =>
    (dependencyDetails) => {
      const [dep, version] = dependencyDetails;
      if (specChanges.has(dep)) {
        switch (specChanges.get(dep)?.type) {
          case 'add':
            if (name) {
              return (
                <p key={dep}>
                  <span className={styles.AddedSpec}>{dep}</span>
                </p>
              );
            } else {
              return (
                <p key={dep}>
                  {version} {displaySpecChanges(specChanges, dep)}
                </p>
              );
            }
          case 'diff':
            if (name) {
              return (
                <p key={dep}>
                  <span className={styles.ChangedSpec}>{dep}</span>
                </p>
              );
            } else {
              return (
                <p key={dep}>
                  {version} {displaySpecChanges(specChanges, dep)}
                </p>
              );
            }
          case 'remove':
            if (name) {
              return (
                <p key={dep}>
                  <span className={styles.DeletedSpec}>{dep}</span>
                </p>
              );
            } else {
              return (
                <p key={dep}>
                  {version} {displaySpecChanges(specChanges, dep)}
                </p>
              );
            }
          default:
            if (name) {
              return <p key={dep}>{dep}:</p>;
            } else {
              return <p key={dep}>{version}</p>;
            }
        }
      } else {
        if (name) {
          return <p key={dep}>{dep}:</p>;
        } else {
          return <p key={dep}>{version}</p>;
        }
      }
    };

  const renderFile = (): JSX.Element | null => {
    switch (selection) {
      case PackageView.PACKAGE_JSON:
        if (!packageJSON) return <h5>Please select a Project or Package to view it&apos;s package.json</h5>;
        return <pre>{JSON.stringify(packageJSON, null, 2)}</pre>;
      case PackageView.PACKAGE_SPEC:
        if (!pnpmfile) {
          return (
            <h5>
              Couldn&apos;t load the pnpmfile.cjs file - does it exist in the expected location?
              (/common/config/rush/.pnpmfile.cjs)
            </h5>
          );
        }
        return <pre>{pnpmfile}</pre>;
      case PackageView.PARSED_PACKAGE_JSON:
        if (!parsedPackageJSON)
          return <h5>Please select a Project or Package to view the parsed package.json</h5>;
        return (
          <div className={styles.PackageSpecWrapper}>
            <div className={styles.PackageSpecEntry}>
              <h5>Package Name:</h5>
              <p>{selectedEntry?.displayText}</p>
            </div>
            <div className={styles.PackageSpecEntry}>
              <h5>Version:</h5>
              <p>{selectedEntry?.entryPackageVersion}</p>
            </div>
            <div className={styles.DependencyRows}>
              <div>
                <h5>Dependencies</h5>
                {parsedPackageJSON.dependencies &&
                  Object.entries(parsedPackageJSON.dependencies).map(renderDep(true))}

                <h5>Dev Dependencies</h5>
                {parsedPackageJSON.devDependencies &&
                  Object.entries(parsedPackageJSON.devDependencies).map(renderDep(true))}

                <h5>Peer Dependencies</h5>
                {parsedPackageJSON.peerDependencies &&
                  Object.entries(parsedPackageJSON.peerDependencies).map(renderDep(true))}
              </div>
              <div>
                <h5>&nbsp;</h5>
                {parsedPackageJSON.dependencies &&
                  Object.entries(parsedPackageJSON.dependencies).map(renderDep(false))}

                <h5>&nbsp;</h5>
                {parsedPackageJSON.devDependencies &&
                  Object.entries(parsedPackageJSON.devDependencies).map(renderDep(false))}

                <h5>&nbsp;</h5>
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
      <div className={appStyles.ContainerCard}>
        <div className={styles.FileContents}>{renderFile()}</div>
      </div>
    </div>
  );
};
