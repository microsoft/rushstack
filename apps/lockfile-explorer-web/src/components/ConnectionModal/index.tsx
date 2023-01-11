// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Text } from '@rushstack/components';
import styles from './styles.scss';
import appStyles from '../../App.scss';
import { checkAliveAsync } from '../../parsing/getPackageFiles';
import { ReactNull } from '../../types/ReactNull';

export const ConnectionModal = (): JSX.Element | ReactNull => {
  const [isAlive, setIsAlive] = useState(true);
  const [checking, setChecking] = useState(false);
  const [manualChecked, setManualChecked] = useState(false);

  async function keepAliveAsync(): Promise<void> {
    if (await checkAliveAsync()) {
      setIsAlive(true);
    } else {
      setIsAlive(false);
    }
    setChecking(false);
  }

  useEffect(() => {
    window.setInterval(keepAliveAsync, 2000);
  }, []);

  const checkAliveManual = useCallback(() => {
    setChecking(true);
    setManualChecked(true);
    keepAliveAsync().catch((e) => {
      // Keep alive cannot fail
      console.error(`Unexpected exception: ${e}`);
    });
  }, []);

  if (isAlive) {
    return null;
  }

  return (
    <div className={styles.DisconnectOverlayBackground}>
      <div className={`${styles.DisconnectOverlay} ${appStyles.ContainerCard}`}>
        <Text type="h5" bold>
          The server has disconnected!
        </Text>
        {manualChecked ? (
          <Text type="p">
            We were still not able to establish a connection to the server. Are you sure it is running?
          </Text>
        ) : (
          <Text type="p">
            Please re-start the local development server to continue using this application.
          </Text>
        )}
        <div className={styles.DisconnectCheckRow}>
          <Button disabled={checking} onClick={checkAliveManual}>
            Check Again
          </Button>
          {checking ? <Text type="p">Checking...</Text> : null}
        </div>
      </div>
    </div>
  );
};
