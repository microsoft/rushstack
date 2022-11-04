// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';
import styles from './styles.scss';

export const LogoPanel = (): JSX.Element => {
  // TODO: Add a mechanism to keep this in sync with the @rushstack/lockfile-explorer
  // package version.
  const appPackageVersion: string = '0.1.0';

  return (
    <div className={styles.LogoPanel}>
      <a href="https://www.npmjs.com/package/@rushstack/lockfile-explorer" target="_blank" rel="noreferrer">
        <div className={styles.Icon}>
          <img className={styles.Image} src={require('./lockfile-explorer-icon.svg')} />
        </div>
        <div className={styles.Title1}>
          <img className={styles.Image} src={require('./lockfile-explorer-title-1.svg')} />
        </div>
        <div className={styles.Title2}>
          <img className={styles.Image} src={require('./lockfile-explorer-title-2.svg')} />
        </div>
        <div className={styles.Detail}>{appPackageVersion}</div>
        <div className={styles.Detail}>rushstack.io</div>
      </a>
    </div>
  );
};
