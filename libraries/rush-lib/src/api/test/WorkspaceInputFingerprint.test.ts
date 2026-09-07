// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  classifyWorkspaceInputChange,
  WorkspaceInputChangeTier,
  WorkspaceRuntimeFingerprintCache,
  type IWorkspaceInputFingerprint
} from '../WorkspaceInputFingerprint';

describe('workspace input fingerprints', () => {
  it('classifies content, configuration and process-bound identities', () => {
    const current: IWorkspaceInputFingerprint = {
      configurationHash: 'configuration',
      environmentHash: 'environment',
      installationHash: 'installation',
      runtimeHash: 'runtime',
      selectedRushVersion: '5.179.0'
    };
    expect(classifyWorkspaceInputChange(current, { ...current })).toBe(WorkspaceInputChangeTier.Reuse);
    expect(classifyWorkspaceInputChange(current, { ...current, configurationHash: 'changed' })).toBe(
      WorkspaceInputChangeTier.Reload
    );
    for (const changed of [
      { environmentHash: 'changed' },
      { installationHash: 'changed' },
      { runtimeHash: 'changed' },
      { selectedRushVersion: '5.180.0' }
    ]) {
      expect(classifyWorkspaceInputChange(current, { ...current, ...changed })).toBe(
        WorkspaceInputChangeTier.Restart
      );
    }
  });

  it('retains content identity across touches and catches same-size runtime edits with restored mtime', () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    try {
      const filename: string = path.join(folder, 'runtime.js');
      fs.writeFileSync(filename, 'module.exports = 1;\n');
      const cache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
      const original: string = cache._hashPaths([folder]);
      const times: fs.Stats = fs.statSync(filename);
      fs.utimesSync(filename, times.atime, new Date(times.mtimeMs + 1000));
      expect(cache._hashPaths([folder])).toBe(original);
      fs.writeFileSync(filename, 'module.exports = 2;\n');
      fs.utimesSync(filename, times.atime, times.mtime);
      expect(cache._hashPaths([folder])).not.toBe(original);
      fs.writeFileSync(path.join(folder, 'added.js'), 'module.exports = 3;\n');
      const added: string = cache._hashPaths([folder]);
      fs.rmSync(path.join(folder, 'added.js'));
      expect(cache._hashPaths([folder])).not.toBe(added);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
