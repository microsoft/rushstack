// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { RushConfiguration } from '@microsoft/rush-lib';

import {
  captureNativeMutationInstallationStateAsync,
  type INativeMutationInstallationState,
  isInstallationUnchangedByMutation
} from '../NativeMutationInstallationState';

const OLD_TIME: Date = new Date('2000-01-01T00:00:00Z');
const LINK: object = { linkedPackagePath: '/linked', linkedPackageName: 'linked', linkType: 'LinkPackage' };

describe('the installation state around a native mutation', () => {
  let folder: string;
  let subspaceFolders: string[];
  let hotlinkStatePath: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-mutation-state-'));
    subspaceFolders = [path.join(folder, 'default'), path.join(folder, 'other')];
    hotlinkStatePath = path.join(folder, 'rush-hotlink-state.json');
    for (const subspaceFolder of subspaceFolders) {
      fs.mkdirSync(subspaceFolder);
      writeFlag(subspaceFolder);
    }
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  function flagPath(subspaceFolder: string): string {
    return path.join(subspaceFolder, 'last-install.flag');
  }

  /** Writes a flag and dates it far back, so that a flag written again later never has the same times. */
  function writeFlag(subspaceFolder: string): void {
    fs.writeFileSync(flagPath(subspaceFolder), '{"node":"20.0.0","packageManager":"pnpm"}');
    fs.utimesSync(flagPath(subspaceFolder), OLD_TIME, OLD_TIME);
  }

  function writeHotlinkState(state: unknown): void {
    fs.writeFileSync(hotlinkStatePath, JSON.stringify(state));
  }

  async function captureAsync(): Promise<INativeMutationInstallationState | undefined> {
    const rushConfiguration: Partial<RushConfiguration> = {
      commonTempFolder: folder,
      subspaces: subspaceFolders.map((subspaceFolder: string) => ({
        getSubspaceTempFolderPath: () => subspaceFolder
      })) as unknown as RushConfiguration['subspaces']
    };
    return await captureNativeMutationInstallationStateAsync(rushConfiguration as RushConfiguration);
  }

  async function isUnchangedAfterAsync(change: () => void): Promise<boolean> {
    const before: INativeMutationInstallationState | undefined = await captureAsync();
    change();
    const after: INativeMutationInstallationState | undefined = await captureAsync();
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    return isInstallationUnchangedByMutation(before!, after!);
  }

  it('is unchanged when no flag was touched', async () => {
    expect(await isUnchangedAfterAsync(() => undefined)).toBe(true);
  });

  it('is unchanged when a flag was only read', async () => {
    expect(await isUnchangedAfterAsync(() => fs.readFileSync(flagPath(subspaceFolders[1])))).toBe(true);
  });

  it('is changed when a flag was written again with the same content', async () => {
    const content: Buffer = fs.readFileSync(flagPath(subspaceFolders[1]));
    expect(
      await isUnchangedAfterAsync(() => {
        fs.rmSync(flagPath(subspaceFolders[1]));
        fs.writeFileSync(flagPath(subspaceFolders[1]), content);
      })
    ).toBe(false);
  });

  it('is changed when a flag was deleted', async () => {
    expect(await isUnchangedAfterAsync(() => fs.rmSync(flagPath(subspaceFolders[0])))).toBe(false);
  });

  it('is changed when a flag was missing before, even if it is still missing', async () => {
    fs.rmSync(flagPath(subspaceFolders[1]));
    expect(await isUnchangedAfterAsync(() => undefined)).toBe(false);
  });

  it('is changed when the subspaces are different', async () => {
    const before: INativeMutationInstallationState | undefined = await captureAsync();
    subspaceFolders = subspaceFolders.slice(1);
    const after: INativeMutationInstallationState | undefined = await captureAsync();
    expect(isInstallationUnchangedByMutation(before!, after!)).toBe(false);
  });

  it.each([
    ['records no subspace', { fileVersion: 0, linksBySubspace: {} }],
    ['records no link in any subspace', { fileVersion: 0, linksBySubspace: { default: [], other: [] } }]
  ])('is unchanged when the hotlink state %s', async (description: string, state: unknown) => {
    writeHotlinkState(state);
    expect(await isUnchangedAfterAsync(() => undefined)).toBe(true);
  });

  it.each([
    ['records a link', { fileVersion: 0, linksBySubspace: { default: [], other: [LINK] } }],
    ['has another file version', { fileVersion: 1, linksBySubspace: {} }],
    ['has no linksBySubspace', { fileVersion: 0 }],
    [
      'lists a subspace in something other than an array',
      { fileVersion: 0, linksBySubspace: { default: {} } }
    ],
    ['is not an object', 0],
    ['is null', null]
  ])('is changed when the hotlink state %s', async (description: string, state: unknown) => {
    writeHotlinkState(state);
    expect(await isUnchangedAfterAsync(() => undefined)).toBe(false);
  });

  it('is changed when the hotlink state is not JSON', async () => {
    fs.writeFileSync(hotlinkStatePath, '{');
    expect(await isUnchangedAfterAsync(() => undefined)).toBe(false);
  });

  it('is changed when a hotlink was added during the mutation', async () => {
    expect(
      await isUnchangedAfterAsync(() =>
        writeHotlinkState({ fileVersion: 0, linksBySubspace: { default: [LINK] } })
      )
    ).toBe(false);
  });

  it('is changed when the hotlinks were removed during the mutation', async () => {
    writeHotlinkState({ fileVersion: 0, linksBySubspace: { default: [LINK] } });
    expect(
      await isUnchangedAfterAsync(() => writeHotlinkState({ fileVersion: 0, linksBySubspace: {} }))
    ).toBe(false);
  });

  it('cannot be captured, and does not throw, when a file that exists cannot be read', async () => {
    fs.mkdirSync(hotlinkStatePath);
    expect(await captureAsync()).toBeUndefined();
  });

  it('cannot be captured, and does not throw, when the configuration cannot list its subspaces', async () => {
    const rushConfiguration: Partial<RushConfiguration> = {
      commonTempFolder: folder,
      get subspaces(): RushConfiguration['subspaces'] {
        throw new Error('The subspaces cannot be loaded.');
      }
    };
    expect(
      await captureNativeMutationInstallationStateAsync(rushConfiguration as RushConfiguration)
    ).toBeUndefined();
  });
});
