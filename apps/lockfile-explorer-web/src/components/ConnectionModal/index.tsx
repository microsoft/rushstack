// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback, useEffect, useState } from 'react';

import { Button, Text } from '@rushstack/rush-themed-ui';

import styles from './styles.scss';
import appStyles from '../../App.scss';
import { checkAliveAsync } from '../../helpers/lfxApiClient.ts';
import type { ReactNull } from '../../types/ReactNull.ts';

export const ConnectionModal = (): React.ReactElement | ReactNull => {
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
      // eslint-disable-next-line no-console
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
          The Lockfile Explorer server has disconnected!
        </Text>
        {manualChecked ? (
          <Text type="p">
            We were still not able to connect to the server. Are you sure the &quot;lockfile-explorer&quot;
            shell command is running?
          </Text>
        ) : (
          <Text type="p">
            Please restart the &quot;lockfile-explorer&quot; shell command to continue using this application.
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
