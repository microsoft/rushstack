// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { JsonSchema } from '@rushstack/node-core-library';

import type { IDaemonIpcConfiguration } from '../../../api/RushProjectConfiguration';
import schemaJson from '../../../schemas/rush-project.schema.json';
import {
  resolveDaemonIpcConfigurationAsync,
  type IResolvedDaemonIpcConfiguration
} from '../DaemonIpcConfiguration';

describe('explicit daemon Node implementation boundary', () => {
  let folder: string;
  const descriptor: IDaemonIpcConfiguration = { entryPoint: 'tools/entry.cjs', args: ['two words', '"literal"'] };
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-ipc-definition-'));
    fs.mkdirSync(path.join(folder, 'tools'));
    fs.writeFileSync(path.join(folder, descriptor.entryPoint), "require('./helper.cjs');\n");
    fs.writeFileSync(path.join(folder, 'tools/helper.cjs'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(folder, 'input.txt'), 'one');
  });
  afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

  it('retains raw args and fingerprints only the bounded implementation tree by content', async () => {
    const first: IResolvedDaemonIpcConfiguration = await resolveDaemonIpcConfigurationAsync(folder, descriptor);
    expect(first.args).toEqual(['two words', '"literal"']);
    expect(first.entryPoint).toBe(fs.realpathSync.native(path.join(folder, descriptor.entryPoint)));
    fs.writeFileSync(path.join(folder, 'input.txt'), 'changed ordinary build input');
    fs.utimesSync(path.join(folder, descriptor.entryPoint), new Date(), new Date());
    expect((await resolveDaemonIpcConfigurationAsync(folder, descriptor)).implementationHash).toBe(first.implementationHash);
    fs.writeFileSync(path.join(folder, 'tools/helper.cjs'), 'module.exports = 2;\n');
    const helperChanged: IResolvedDaemonIpcConfiguration = await resolveDaemonIpcConfigurationAsync(folder, descriptor);
    expect(helperChanged.implementationHash).not.toBe(first.implementationHash);
    fs.writeFileSync(path.join(folder, 'tools/added.json'), '{}');
    expect((await resolveDaemonIpcConfigurationAsync(folder, descriptor)).implementationHash).not.toBe(helperChanged.implementationHash);
  });

  it.each([
    { entryPoint: '../entry.cjs' },
    { entryPoint: '/entry.cjs' },
    { entryPoint: 'C:\\entry.cjs' },
    { entryPoint: 'entry.cjs' },
    { entryPoint: 'tools/entry.ts' },
    { entryPoint: 'tools/entry.cjs', args: ['\0'] }
  ])('refuses an invalid executable/argument boundary: %j', async (invalid: IDaemonIpcConfiguration) => {
    await expect(resolveDaemonIpcConfigurationAsync(folder, invalid)).rejects.toThrow();
  });

  it('rejects oversized implementations instead of silently truncating their fingerprint', async () => {
    fs.writeFileSync(path.join(folder, 'tools/too-large.bin'), Buffer.alloc(8 * 1024 * 1024));
    await expect(resolveDaemonIpcConfigurationAsync(folder, descriptor)).rejects.toThrow('8 MiB');
  });

  it.each([
    {},
    { entryPoint: '' },
    { entryPoint: 'tools/entry.cjs', args: [42] },
    { entryPoint: 'tools/entry.cjs', command: 'arbitrary-shell' }
  ])('schema rejects malformed public descriptors: %j', (invalid: object) => {
    expect(() => JsonSchema.fromLoadedObject(schemaJson).validateObject({
      operationSettings: [{ operationName: '_phase:build', daemonIpc: invalid }]
    }, 'rush-project.json')).toThrow();
  });

  it('schema accepts the explicit Node descriptor', () => {
    JsonSchema.fromLoadedObject(schemaJson).validateObject({
      operationSettings: [{ operationName: '_phase:build', daemonIpc: descriptor }]
    }, 'rush-project.json');
  });
});
