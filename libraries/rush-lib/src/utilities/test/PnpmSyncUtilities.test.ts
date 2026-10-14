// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { symlink } from 'node:fs/promises';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { pnpmSyncUpdateFileAsync } from 'pnpm-sync-lib';

import { PnpmSyncUtilities } from '../PnpmSyncUtilities';

describe('PNPM installed-layout synchronization', () => {
  const fixtureRoot: string = path.resolve(__dirname, '../../../temp/test/PnpmSyncUtilities');
  const lockfileFolder: string = path.join(fixtureRoot, 'install-root');
  const modulesFolder: string = path.join(lockfileFolder, 'node_modules');
  const modulesFilePath: string = path.join(modulesFolder, '.modules.yaml');
  const virtualStore: string = path.join(modulesFolder, '.pnpm');
  const sourceFolder: string = path.join(fixtureRoot, 'projects/source');
  const syncFilename: string = path.join(sourceFolder, 'node_modules/.pnpm-sync.json');
  const targetA: string = path.join(
    virtualStore,
    'manager-selected-short-slot-a/node_modules/fixture-source'
  );
  const targetB: string = path.join(
    virtualStore,
    'manager-selected-short-slot-b/node_modules/fixture-source'
  );
  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

  function metadata(): Record<string, unknown> {
    return {
      layoutVersion: 5,
      nodeLinker: 'isolated',
      packageManager: 'pnpm@12.11.2',
      virtualStoreDir: '.pnpm',
      virtualStoreDirMaxLength: 60,
      injectedDeps: {
        '../projects/source': [path.relative(lockfileFolder, targetA), path.relative(lockfileFolder, targetB)]
      }
    };
  }

  async function prepareAsync(): Promise<void> {
    await PnpmSyncUtilities.prepareFromModulesAsync({
      modulesFilePath,
      lockfileFolder,
      lockfileId: 'current',
      pnpmVersion: '12.11.2',
      sourceProjectFolders: [sourceFolder],
      terminal
    });
  }

  beforeEach(async () => {
    await FileSystem.ensureEmptyFolderAsync(fixtureRoot);
    for (const folder of [sourceFolder, targetA, targetB]) {
      await JsonFile.saveAsync({ name: 'fixture-source', version: '1.0.0' }, `${folder}/package.json`, {
        ensureFolderExists: true
      });
    }
    await JsonFile.saveAsync(metadata(), modulesFilePath);
  });

  afterEach(async () => {
    await FileSystem.deleteFolderAsync(fixtureRoot);
  });

  it('uses installed peer-variant destinations without reconstructing short virtual-store names', async () => {
    await prepareAsync();
    const sync: {
      postbuildInjectedCopy: { targetFolders: { folderPath: string; lockfileId: string }[] };
    } = await JsonFile.loadAsync(syncFilename);
    expect(
      sync.postbuildInjectedCopy.targetFolders.map(({ folderPath }) =>
        path.resolve(path.dirname(syncFilename), folderPath)
      )
    ).toEqual([targetA, targetB]);
    expect(sync.postbuildInjectedCopy.targetFolders.map(({ lockfileId }) => lockfileId)).toEqual([
      'current',
      'current'
    ]);
  });

  it('replaces this subspace mapping without removing another subspace mapping', async () => {
    await FileSystem.ensureFolderAsync(path.dirname(syncFilename));
    const otherTarget: string = path.join(fixtureRoot, 'other-subspace/source');
    await pnpmSyncUpdateFileAsync({
      sourceProjectFolder: sourceFolder,
      targetFolders: [otherTarget],
      lockfileId: 'other',
      logMessageCallback: () => {}
    });
    await pnpmSyncUpdateFileAsync({
      sourceProjectFolder: sourceFolder,
      targetFolders: [path.join(virtualStore, 'obsolete/source')],
      lockfileId: 'current',
      logMessageCallback: () => {}
    });
    await prepareAsync();
    const sync: {
      postbuildInjectedCopy: { targetFolders: { folderPath: string; lockfileId: string }[] };
    } = await JsonFile.loadAsync(syncFilename);
    expect(
      sync.postbuildInjectedCopy.targetFolders.map(({ folderPath, lockfileId }) => [
        path.resolve(path.dirname(syncFilename), folderPath),
        lockfileId
      ])
    ).toEqual([
      [otherTarget, 'other'],
      [targetA, 'current'],
      [targetB, 'current']
    ]);
  });

  it('does not create sync descriptors when the installed layout has no injected dependencies', async () => {
    const manifest: Record<string, unknown> = metadata();
    delete manifest.injectedDeps;
    await JsonFile.saveAsync(manifest, modulesFilePath);
    await prepareAsync();
    expect(await FileSystem.existsAsync(syncFilename)).toBe(false);
  });

  it.each([
    ['layoutVersion', 99],
    ['nodeLinker', 'hoisted'],
    ['packageManager', 'pnpm@10.27.0']
  ])('rejects an unsupported or stale %s before writing', async (key, value) => {
    await JsonFile.saveAsync({ ...metadata(), [key]: value }, modulesFilePath);
    await expect(prepareAsync()).rejects.toThrow('unsupported PNPM layout');
    expect(await FileSystem.existsAsync(syncFilename)).toBe(false);
  });

  it('validates all destinations before writing, including paths escaping the virtual store', async () => {
    await JsonFile.saveAsync(
      {
        ...metadata(),
        injectedDeps: {
          '../projects/source': [path.relative(lockfileFolder, targetA), '../unrelated']
        }
      },
      modulesFilePath
    );
    await expect(prepareAsync()).rejects.toThrow('outside the virtual store');
    expect(await FileSystem.existsAsync(syncFilename)).toBe(false);
  });

  it('rejects symlink targets that would copy into a source project', async () => {
    await FileSystem.deleteFolderAsync(targetA);
    await symlink(sourceFolder, targetA, 'junction');
    await expect(prepareAsync()).rejects.toThrow('not a materialized virtual-store copy');
    expect(await FileSystem.existsAsync(syncFilename)).toBe(false);
  });

  it('rejects an unregistered source or a mismatched destination package', async () => {
    await JsonFile.saveAsync(
      { ...metadata(), injectedDeps: { '../unregistered': [path.relative(lockfileFolder, targetA)] } },
      modulesFilePath
    );
    await expect(prepareAsync()).rejects.toThrow('not a configured Rush project');
    await JsonFile.saveAsync(metadata(), modulesFilePath);
    await JsonFile.saveAsync({ name: 'different-package' }, `${targetA}/package.json`);
    await expect(prepareAsync()).rejects.toThrow('unexpected package name');
    expect(await FileSystem.existsAsync(syncFilename)).toBe(false);
  });
});
