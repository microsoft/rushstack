// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useState } from 'react';
import styles from './styles.scss';
import appStyles from '../../App.scss';
import { checkAlive } from '../../parsing/getPackageFiles';
import { ReactNull } from '../../types/ReactNull';

export const ConnectionModal = (): JSX.Element | ReactNull => {
  const [isAlive, setIsAlive] = useState(true);
  const [checking, setChecking] = useState(false);
  const [manualChecked, setManualChecked] = useState(false);

  async function keepAlive(): Promise<void> {
    if (await checkAlive()) {
      setIsAlive(true);
    } else {
      setIsAlive(false);
    }
    setChecking(false);
  }

  useEffect(() => {
    window.setInterval(keepAlive, 2000);
  }, []);

  const checkAliveManual = useCallback(() => {
    setChecking(true);
    setManualChecked(true);
    keepAlive().catch((e) => {
      // Keep alive cannot fail
      console.error('Unexpected exception: ', +e.toString());
    });
  }, []);

  if (isAlive) {
    return null;
  }

  return (
    <div className={styles.DisconnectOverlayBackground}>
      <div className={`${styles.DisconnectOverlay} ${appStyles.ContainerCard}`}>
        <h5>The Server Has Disconnected!</h5>
        {manualChecked ? (
          <p>We were still not able to establish a connection to the server, are you sure it is running?</p>
        ) : (
          <p>Please re-start the local development server to continue using this application.</p>
        )}
        <div className={styles.DisconnectCheckRow}>
          <button disabled={checking} onClick={checkAliveManual}>
            Check Again
          </button>
          {checking ? <p>Checking...</p> : null}
        </div>
      </div>
    </div>
  );
};
