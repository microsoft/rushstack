// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';

import styles from './styles.scss';

export const LogoPanel = (): React.ReactElement => {
  // TODO: Add a mechanism to keep this in sync with the @rushstack/lockfile-explorer
  // package version.
  const appPackageVersion: string = window.appContext.appVersion;

  return (
    <div className={styles.LogoPanel}>
      <div className={styles.Icon}>
        <a href="https://lfx.rushstack.io/" target="_blank" rel="noreferrer">
          <img
            className={styles.Image}
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            src={require('./lockfile-explorer-icon.svg')}
          />
        </a>
      </div>
      <div>
        <a href="https://lfx.rushstack.io/" target="_blank" rel="noreferrer">
          <div className={styles.Title1}>
            <img
              className={styles.Image}
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              src={require('./lockfile-explorer-title-1.svg')}
            />
          </div>
          <div className={styles.Title2}>
            <img
              className={styles.Image}
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              src={require('./lockfile-explorer-title-2.svg')}
            />
          </div>
          <div className={styles.Detail}>{appPackageVersion}</div>
        </a>
        <a href="https://lfx.rushstack.io/" target="_blank" rel="noreferrer">
          <div className={styles.Detail}>lfx.rushstack.io</div>
        </a>
      </div>
    </div>
  );
};
