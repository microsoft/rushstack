// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useEffect } from 'react';

import styles from './App.scss';
import { readLockfileAsync } from './parsing/readLockfile';
import { LockfileViewer } from './containers/LockfileViewer';
import { PackageJsonViewer } from './containers/PackageJsonViewer';
import { useAppDispatch } from './store/hooks';
import { loadEntries } from './store/slices/entrySlice';
import { LockfileEntryDetailsView } from './containers/LockfileEntryDetailsView';
import { BookmarksSidebar } from './containers/BookmarksSidebar';
import { SelectedEntryPreview } from './containers/SelectedEntryPreview';
import { LogoPanel } from './containers/LogoPanel';
import { ConnectionModal } from './components/ConnectionModal';

/**
 * This React component renders the application page.
 */
export const App = (): JSX.Element => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    async function loadLockfileAsync(): Promise<void> {
      const lockfile = await readLockfileAsync();
      dispatch(loadEntries(lockfile));
    }
    loadLockfileAsync().catch((e) => {
      // eslint-disable-next-line no-console
      console.log(`Failed to read lockfile: ${e}`);
    });
  }, [dispatch]);

  return (
    <>
      <ConnectionModal />
      <div className={styles.AppContainer}>
        <div className="ms-Grid" dir="ltr">
          <div className="ms-Grid-row">
            <div className={`ms-Grid-col ms-sm3 ${styles.BodyContainer}`}>
              <LockfileViewer />
            </div>
            <div className={`ms-Grid-col ms-sm7 ${styles.BodyContainer}`}>
              <SelectedEntryPreview />
              <PackageJsonViewer />
              <LockfileEntryDetailsView />
            </div>
            <div className={`ms-Grid-col ms-sm2 ${styles.BodyContainer}`}>
              <LogoPanel />
              <BookmarksSidebar />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
