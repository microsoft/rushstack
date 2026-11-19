// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:fs', () => {
  const actual: typeof import('node:fs') = jest.requireActual('node:fs');
  return { ...actual, readdirSync: jest.fn(actual.readdirSync) };
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { captureWorkspaceInputFingerprintAsync } from '../WorkspaceInputFingerprint';
import { RushConfiguration } from '../RushConfiguration';

describe('workspace runtime walk', () => {
  it('walks a package folder that several configured plugins share only once per capture', async () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    try {
      const write = (relativePath: string, content: string): void => {
        const filename: string = path.join(folder, relativePath);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
      };
      write('rush.json', JSON.stringify({ rushVersion: '5.179.0', pnpmVersion: '10.27.0', projects: [] }));
      write(
        'common/config/rush/rush-plugins.json',
        JSON.stringify({
          plugins: ['first', 'second', 'third'].map((pluginName: string) => ({
            packageName: '@example/plugins',
            pluginName,
            autoinstallerName: 'plugins'
          }))
        })
      );
      const packageFolder: string = 'common/autoinstallers/plugins/node_modules/@example/plugins';
      write(`${packageFolder}/release/first.js`, 'exports.v = 1;');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.join(folder, 'rush.json')
      );

      const readdirSync: jest.Mock = fs.readdirSync as unknown as jest.Mock;
      readdirSync.mockClear();
      await captureWorkspaceInputFingerprintAsync({ rushConfiguration, environment: {} });
      const walks: unknown[] = readdirSync.mock.calls.filter(
        ([walked]: unknown[]) => walked === path.join(folder, packageFolder)
      );
      expect(walks).toHaveLength(1);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
