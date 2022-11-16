// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useState } from 'react';
import { readPnpmfile, readPackageSpec, readPackageJson } from '../../parsing/getPackageFiles';
import styles from './styles.scss';
import appStyles from '../../App.scss';
import { useAppSelector } from '../../store/hooks';
import { selectCurrentEntry } from '../../store/slices/entrySlice';
import { IPackageJson } from '../../types/IPackageJson';
import { compareSpec, ISpecChange } from '../../parsing/compareSpec';
import { FilterBar } from '../../components/FilterBar';

enum PackageView {
  PACKAGE_JSON,
  CJS,
  PARSED_PACKAGE_JSON
}

export const PackageJsonViewer = (): JSX.Element => {
  const [packageJSON, setPackageJSON] = useState<IPackageJson | undefined>(undefined);
  const [parsedPackageJSON, setParsedPackageJSON] = useState<IPackageJson | undefined>(undefined);
  const [specChanges, setSpecChanges] = useState<Map<string, ISpecChange>>(new Map());
  const [cjs, setCjs] = useState('');
  const selectedEntry = useAppSelector(selectCurrentEntry);

  const [selection, setSelection] = useState<PackageView>(PackageView.PARSED_PACKAGE_JSON);

  const cb = useCallback((s: PackageView) => () => setSelection(s), []);

  useEffect(() => {
    async function loadPackageDetails(packageName: string): Promise<void> {
      const cjsFile = await readPnpmfile();
      setCjs(cjsFile);
      const packageJSONFile = await readPackageJson(packageName);
      setPackageJSON(packageJSONFile);
      const parsedJSON = await readPackageSpec(packageName);
      setParsedPackageJSON(parsedJSON);

      if (packageJSONFile && parsedJSON) {
        const diffDeps = compareSpec(packageJSONFile, parsedJSON);
        setSpecChanges(diffDeps);
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

  const renderDep = (dependencyDetails: [string, string]): JSX.Element => {
    const [dep, version] = dependencyDetails;
    if (specChanges.has(dep)) {
      switch (specChanges.get(dep)?.type) {
        case 'add':
          return (
            <p key={dep}>
              <span className={styles.AddedSpec}>
                {dep}: {version}
              </span>{' '}
              [Added by .pnpmfile.cjs]
            </p>
          );
        case 'diff':
          return (
            <p key={dep}>
              <span className={styles.ChangedSpec}>
                {dep}: {version}
              </span>{' '}
              [Changed from {specChanges.get(dep)?.from}]
            </p>
          );
        case 'remove':
          return (
            <p key={dep}>
              <span className={styles.DeletedSpec}>
                {dep}: {version}
              </span>{' '}
              [Deleted by .pnpmfile.cjs]
            </p>
          );
        default:
          return (
            <p key={dep}>
              {dep}: {version}
            </p>
          );
      }
    } else {
      return (
        <p key={dep}>
          {dep}: {version}
        </p>
      );
    }
  };

  const renderFile = (): JSX.Element | null => {
    switch (selection) {
      case PackageView.PACKAGE_JSON:
        if (!packageJSON) return null;
        return <pre>{JSON.stringify(packageJSON, null, 2)}</pre>;
      case PackageView.CJS:
        return <pre>{cjs}</pre>;
      case PackageView.PARSED_PACKAGE_JSON:
        if (!parsedPackageJSON) return null;
        return (
          <div className={styles.PackageSpecWrapper}>
            <h5>Dependencies</h5>
            {parsedPackageJSON.dependencies && Object.entries(parsedPackageJSON.dependencies).map(renderDep)}
            <h5>Dev Dependencies</h5>
            {parsedPackageJSON.devDependencies &&
              Object.entries(parsedPackageJSON.devDependencies).map(renderDep)}
            <h5>Peer Dependencies</h5>
            {parsedPackageJSON.peerDependencies &&
              Object.entries(parsedPackageJSON.peerDependencies).map(renderDep)}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <FilterBar
        options={[
          {
            text: 'package spec',
            active: selection === PackageView.PARSED_PACKAGE_JSON,
            onClick: cb(PackageView.PARSED_PACKAGE_JSON)
          },
          {
            text: 'package.json',
            active: selection === PackageView.PACKAGE_JSON,
            onClick: cb(PackageView.PACKAGE_JSON)
          },
          { text: '.pnpmfile.cjs', active: selection === PackageView.CJS, onClick: cb(PackageView.CJS) }
        ]}
      />
      <div className={appStyles.ContainerCard}>
        <div className={styles.FileContents}>{renderFile()}</div>
      </div>
    </div>
  );
};
