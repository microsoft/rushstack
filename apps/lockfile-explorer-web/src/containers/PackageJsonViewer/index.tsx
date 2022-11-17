// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useState } from 'react';
import { readPnpmfile, readPackageSpec, readPackageJson } from '../../parsing/getPackageFiles';
import styles from './styles.scss';
import appStyles from '../../App.scss';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectCurrentEntry } from '../../store/slices/entrySlice';
import { IPackageJson } from '../../types/IPackageJson';
import { compareSpec } from '../../parsing/compareSpec';
import { FilterBar } from '../../components/FilterBar';
import { loadSpecChanges } from '../../store/slices/workspaceSlice';
import { displaySpecChanges } from '../../helpers/displaySpecChanges';
import { isEntryModified } from '../../helpers/isEntryModified';

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

  const cb = useCallback((s: PackageView) => () => setSelection(s), []);

  useEffect(() => {
    async function loadPnpmFile(): Promise<void> {
      const pnpmfile = await readPnpmfile();
      setPnpmfile(pnpmfile);
    }
    loadPnpmFile().catch((e) => {
      console.error(`Failed to load project's pnpm file: ${e}`);
    });
  }, []);

  useEffect(() => {
    async function loadPackageDetails(packageName: string): Promise<void> {
      const packageJSONFile = await readPackageJson(packageName);
      setPackageJSON(packageJSONFile);
      const parsedJSON = await readPackageSpec(packageName);
      setParsedPackageJSON(parsedJSON);

      if (packageJSONFile && parsedJSON) {
        const diffDeps = compareSpec(packageJSONFile, parsedJSON);
        dispatch(loadSpecChanges(diffDeps));
      }
    }
    if (selectedEntry) {
      if (selectedEntry.entryPackageName) {
        loadPackageDetails(selectedEntry.packageJsonFolderPath).catch((e) => {
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
        if (!packageJSON) return <h5>Please select a Project or Package to view it's package.json</h5>;
        return <pre>{JSON.stringify(packageJSON, null, 2)}</pre>;
      case PackageView.PACKAGE_SPEC:
        if (!pnpmfile) {
          return (
            <h5>
              Couldn't load the pnpmfile.cjs file - does it exist in the expected location?
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
      <FilterBar
        options={[
          {
            text: `package spec ${isEntryModified(selectedEntry, specChanges) ? '*' : ''}`,
            active: selection === PackageView.PARSED_PACKAGE_JSON,
            onClick: cb(PackageView.PARSED_PACKAGE_JSON)
          },
          {
            text: 'package.json',
            active: selection === PackageView.PACKAGE_JSON,
            onClick: cb(PackageView.PACKAGE_JSON)
          },
          {
            text: '.pnpmfile.cjs',
            active: selection === PackageView.PACKAGE_SPEC,
            onClick: cb(PackageView.PACKAGE_SPEC)
          }
        ]}
      />
      <div className={appStyles.ContainerCard}>
        <div className={styles.FileContents}>{renderFile()}</div>
      </div>
    </div>
  );
};
