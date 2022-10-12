import React, { useEffect } from 'react';
import { readLockfile } from './parsing/readLockfile';
import { LockfileViewer } from './containers/LockfileViewer';
import { PackageJsonViewer } from './containers/PackageJsonViewer';
import styles from './styles.scss';
import { useAppDispatch } from './store/hooks';
import { loadEntries } from './store/slices/entrySlice';

/**
 * This React component renders the application page.
 */
export const App = (): JSX.Element => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    async function loadLockfile(): Promise<void> {
      const lockfile = await readLockfile();
      dispatch(loadEntries(lockfile));
    }
    /* eslint @typescript-eslint/no-floating-promises: off */
    loadLockfile();
  }, []);

  return (
    <div className={styles.AppContainer}>
      <div>
        <LockfileViewer />
      </div>
      <PackageJsonViewer />
    </div>
  );
};
