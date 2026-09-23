// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

import { resolvePhasedCommandCwdAsync } from '../resolvePhasedCommandCwd';

describe(resolvePhasedCommandCwdAsync.name, () => {
  let folder: string;
  let root: string;
  let alias: string;
  let project: string;

  beforeEach(async () => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-native-cwd-'));
    fs.mkdirSync(path.join(folder, 'workspace', 'projects', 'a', 'nested'), { recursive: true });
    root = fs.realpathSync.native(path.join(folder, 'workspace'));
    project = path.join(root, 'projects', 'a');
    alias = path.join(folder, 'workspace-alias');
    await FileSystem.createSymbolicLinkJunctionAsync({ linkTargetPath: root, newLinkPath: alias });
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('accepts a workspace alias even when its spelling is outside the canonical root', async () => {
    expect(await resolvePhasedCommandCwdAsync(alias, root)).toBe(root);
    expect(await resolvePhasedCommandCwdAsync(path.join(alias, 'projects', 'a', 'nested'), root)).toBe(
      path.join(project, 'nested')
    );
  });

  it('retains the configuration namespace when RushConfiguration itself was loaded through an alias', async () => {
    expect(await resolvePhasedCommandCwdAsync(path.join(project, 'nested'), alias)).toBe(
      path.join(alias, 'projects', 'a', 'nested')
    );
  });

  it('rechecks a previously accepted alias after its target changes', async () => {
    expect(await resolvePhasedCommandCwdAsync(alias, root)).toBe(root);
    fs.unlinkSync(alias);
    const outside: string = path.join(folder, 'outside');
    fs.mkdirSync(outside);
    await FileSystem.createSymbolicLinkJunctionAsync({ linkTargetPath: outside, newLinkPath: alias });
    await expect(resolvePhasedCommandCwdAsync(alias, root)).rejects.toThrow('inside the daemon workspace');
  });

  it('resolves an in-workspace alias to the physical project path used for native selection', async () => {
    const projectAlias: string = path.join(root, 'project-alias');
    await FileSystem.createSymbolicLinkJunctionAsync({ linkTargetPath: project, newLinkPath: projectAlias });
    expect(await resolvePhasedCommandCwdAsync(path.join(projectAlias, 'nested'), root)).toBe(
      path.join(project, 'nested')
    );
  });

  it('rejects a symlink escape even though the request is lexically inside the workspace', async () => {
    const outside: string = path.join(folder, 'outside');
    fs.mkdirSync(outside);
    const escape: string = path.join(root, 'escape');
    await FileSystem.createSymbolicLinkJunctionAsync({ linkTargetPath: outside, newLinkPath: escape });
    await expect(resolvePhasedCommandCwdAsync(escape, root)).rejects.toThrow('inside the daemon workspace');
    await expect(resolvePhasedCommandCwdAsync(path.join(alias, 'escape'), root)).rejects.toThrow(
      'inside the daemon workspace'
    );
  });

  it('rejects sibling prefixes, missing paths and files rather than falling back to lexical containment', async () => {
    const sibling: string = `${root}-sibling`;
    fs.mkdirSync(sibling);
    await expect(resolvePhasedCommandCwdAsync(sibling, root)).rejects.toThrow('inside the daemon workspace');
    await expect(resolvePhasedCommandCwdAsync(path.join(root, 'missing'), root)).rejects.toMatchObject({
      code: 'ENOENT'
    });
    const filename: string = path.join(project, 'file.txt');
    fs.writeFileSync(filename, '');
    await expect(resolvePhasedCommandCwdAsync(filename, root)).rejects.toThrow('existing directory');
  });

  if (process.platform === 'linux') {
    it('does not equate distinct case-sensitive Linux directories', async () => {
      const other: string = path.join(folder, 'Workspace');
      fs.mkdirSync(other);
      await expect(resolvePhasedCommandCwdAsync(other, root)).rejects.toThrow('inside the daemon workspace');
    });
  }

  if (process.platform === 'win32') {
    it('accepts Windows path casing aliases without changing the configuration spelling', async () => {
      expect(await resolvePhasedCommandCwdAsync(path.join(project, 'nested').toUpperCase(), root)).toBe(
        path.join(project, 'nested')
      );
    });
  }
});
