import React, { useCallback, useEffect, useState } from 'react';
import { readCJS, readParsedCJS, readPackageJSON } from '../../parsing/readCJS';
import styles from './styles.scss';
import appStyles from '../../appstyles.scss';

enum PackageView {
  PACKAGE_JSON,
  CJS,
  PARSED_PACKAGE_JSON
}

export const PackageJsonViewer = (): JSX.Element => {
  const [packageJSON, setPackageJSON] = useState('');
  const [parsedPackageJSON, setParsedPackageJSON] = useState('');
  const [cjs, setCjs] = useState('');

  const [selection, setSelection] = useState<PackageView>(PackageView.PACKAGE_JSON);

  const cb = useCallback((s: PackageView) => () => setSelection(s), []);

  useEffect(() => {
    async function loadPackageDetails(): Promise<void> {
      const cjsFile = await readCJS();
      setCjs(cjsFile);
      const packageJSONFile = await readPackageJSON();
      setPackageJSON(packageJSONFile as string);
      const parsedJSON = await readParsedCJS();
      setParsedPackageJSON(parsedJSON as string);
    }
    /* eslint @typescript-eslint/no-floating-promises: off */
    loadPackageDetails();
  }, []);

  const renderFile = (): JSX.Element | null => {
    switch (selection) {
      case PackageView.PACKAGE_JSON:
        return <pre>{packageJSON}</pre>;
      case PackageView.CJS:
        return <pre>{cjs}</pre>;
      case PackageView.PARSED_PACKAGE_JSON:
        return <pre>{parsedPackageJSON}</pre>;
      default:
        return null;
    }
  };

  return (
    <div>
      <div className={styles.headerFilterBar}>
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
        <div
          className={`${styles.headerFilterItem} ${
            selection === PackageView.PARSED_PACKAGE_JSON ? styles.headerFilterItemActive : ''
          }`}
          onClick={cb(PackageView.PARSED_PACKAGE_JSON)}
        >
          Parsed package.json
        </div>
      </div>
      <div className={appStyles.containerCard}>
        <div className={styles.fileContents}>{renderFile()}</div>
      </div>
    </div>
  );
};
