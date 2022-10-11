import React, { useEffect, useState } from 'react';
import { readLockfile } from './parsing/readLockfile';
import { LockfileEntry, LockfileEntryKind } from './parsing/LockfileEntry';
import { LockfileViewer } from './containers/LockfileViewer';
import { PackageJsonViewer } from './containers/PackageJsonViewer';
import styles from './styles.scss';

/**
 * This React component renders the application page.
 */
export const App = (): JSX.Element => {
  const [selection, setSelection] = useState(LockfileEntryKind.Project);
  const [projectEntries, setProjectEntries] = useState<LockfileEntry[]>([]);
  const [packageEntries, setPackageEntries] = useState<LockfileEntry[]>([]);

  useEffect(() => {
    async function loadLockfile(): Promise<void> {
      const lockfile = await readLockfile();
      setProjectEntries(lockfile.filter((l) => l.kind === LockfileEntryKind.Project));
      setPackageEntries(lockfile.filter((l) => l.kind === LockfileEntryKind.Package));
    }
    /* eslint @typescript-eslint/no-floating-promises: off */
    loadLockfile();
  }, []);

  return (
    <div className={styles.AppContainer}>
      <div>
        <LockfileViewer
          lockfile={selection === LockfileEntryKind.Package ? packageEntries : projectEntries}
          setSelection={setSelection}
        />
      </div>
      <PackageJsonViewer />
    </div>
  );
};
