// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LockFile } from '@rushstack/node-core-library';

import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { Rush } from '../../api/Rush';
import { RushConfiguration } from '../../api/RushConfiguration';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { PurgeManager } from '../PurgeManager';

describe(PurgeManager.name, () => {
  it('purges temporary files without deleting the active native repository mutex', async () => {
    const folder: string = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-purge-lock-')));
    const commonTempFolder: string = path.join(folder, 'common/temp');
    const originalTemp: string | undefined = process.env.RUSH_TEMP_FOLDER;
    let lock: LockFile | undefined;
    try {
      fs.mkdirSync(commonTempFolder, { recursive: true });
      process.env.RUSH_TEMP_FOLDER = commonTempFolder;
      EnvironmentConfiguration.reset();
      const rushJsonFile: string = path.join(folder, 'rush.json');
      fs.writeFileSync(
        rushJsonFile,
        JSON.stringify({
          rushVersion: Rush.version,
          npmVersion: '10.0.0',
          projects: []
        })
      );
      const configuration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
      expect(configuration.commonTempFolder).toBe(commonTempFolder);
      const globalFolder: RushGlobalFolder = {
        path: path.join(folder, 'global'),
        nodeSpecificPath: path.join(folder, 'global/node')
      };
      const obsoleteFile: string = path.join(commonTempFolder, 'obsolete.txt');
      fs.writeFileSync(obsoleteFile, 'temporary contents');
      lock = LockFile.tryAcquire(commonTempFolder, 'rush');
      expect(lock).toBeDefined();
      if (!lock) throw new Error('The purge fixture could not acquire its native lock.');
      const manager: PurgeManager = new PurgeManager(configuration, globalFolder);

      manager.purgeNormal();
      await manager.startDeleteAllAsync();

      expect(fs.existsSync(obsoleteFile)).toBe(false);
      expect(fs.existsSync(lock.filePath)).toBe(true);
      expect(lock.isReleased).toBe(false);
      expect(LockFile.tryAcquire(commonTempFolder, 'rush')).toBeUndefined();
      if (process.platform === 'win32') {
        expect(fs.existsSync(`${lock.filePath}.dirty`)).toBe(true);
      }
      lock.release();
      expect(fs.existsSync(lock.filePath)).toBe(false);
      expect(fs.existsSync(`${lock.filePath}.dirty`)).toBe(false);
    } finally {
      try {
        if (lock && !lock.isReleased) lock.release();
      } finally {
        if (originalTemp === undefined) delete process.env.RUSH_TEMP_FOLDER;
        else process.env.RUSH_TEMP_FOLDER = originalTemp;
        EnvironmentConfiguration.reset();
        fs.rmSync(folder, { recursive: true, force: true });
      }
    }
  });
});
