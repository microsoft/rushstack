import React, { useCallback, useEffect, useState } from 'react';
import { readCJS, readParsedCJS, readPackageJSON } from '../../parsing/readCJS';
import styles from './styles.scss';
import appStyles from '../../appstyles.scss';
import { useAppSelector } from '../../store/hooks';
import { selectCurrentEntry } from '../../store/slices/entrySlice';
import { IPackageJson } from '../../types/IPackageJson';

enum PackageView {
  PACKAGE_JSON,
  CJS,
  PARSED_PACKAGE_JSON
}

export const PackageJsonViewer = (): JSX.Element => {
  const [packageJSON, setPackageJSON] = useState<IPackageJson | null>(null);
  const [parsedPackageJSON, setParsedPackageJSON] = useState<IPackageJson | null>(null);
  const [cjs, setCjs] = useState('');
  const selectedEntry = useAppSelector(selectCurrentEntry);

  const [selection, setSelection] = useState<PackageView>(PackageView.PARSED_PACKAGE_JSON);

  const cb = useCallback((s: PackageView) => () => setSelection(s), []);

  useEffect(() => {
    async function loadPackageDetails(packageName: string): Promise<void> {
      const cjsFile = await readCJS();
      setCjs(cjsFile);
      const packageJSONFile = await readPackageJSON(packageName);
      setPackageJSON(packageJSONFile);
      const parsedJSON = await readParsedCJS(packageName);
      setParsedPackageJSON(parsedJSON);
    }
    if (selectedEntry) {
      if (selectedEntry.entryPackageName) {
        /* eslint @typescript-eslint/no-floating-promises: off */
        loadPackageDetails(selectedEntry.packageJsonFolderPath);
      } else {
        console.log('selected entyr has no entry name: ', selectedEntry.entryPackageName);
      }
    }
  }, [selectedEntry]);

  useEffect(() => {
    if (packageJSON && parsedPackageJSON) {
    }
  }, [packageJSON, parsedPackageJSON]);

  const renderFile = (): JSX.Element | null => {
    switch (selection) {
      case PackageView.PACKAGE_JSON:
        if (!packageJSON) return null;
        return <pre>{JSON.stringify(packageJSON, null, 2)}</pre>;
      case PackageView.CJS:
        return <pre>{cjs}</pre>;
      case PackageView.PARSED_PACKAGE_JSON:
        if (!parsedPackageJSON) return null;
        return <pre>{JSON.stringify(parsedPackageJSON, null, 2)}</pre>;
      default:
        return null;
    }
  };

  return (
    <div>
      <div className={styles.headerFilterBar}>
        <div
          className={`${styles.headerFilterItem} ${
            selection === PackageView.PARSED_PACKAGE_JSON ? styles.headerFilterItemActive : ''
          }`}
          onClick={cb(PackageView.PARSED_PACKAGE_JSON)}
        >
          package spec
        </div>
        <div
          className={`${styles.headerFilterItem} ${
            selection === PackageView.PACKAGE_JSON ? styles.headerFilterItemActive : ''
          }`}
          onClick={cb(PackageView.PACKAGE_JSON)}
        >
          package.json
        </div>
        <div
          className={`${styles.headerFilterItem} ${
            selection === PackageView.CJS ? styles.headerFilterItemActive : ''
          }`}
          onClick={cb(PackageView.CJS)}
        >
          .pnpmfile.cjs
        </div>
      </div>
      <div className={appStyles.containerCard}>
        <div className={styles.fileContents}>{renderFile()}</div>
      </div>
    </div>
  );
};
