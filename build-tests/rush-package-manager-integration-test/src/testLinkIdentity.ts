// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ITerminal } from '@rushstack/terminal';

import { TestHelper } from './TestHelper';

export async function testLinkIdentityAsync(terminal: ITerminal): Promise<void> {
  const folder: string = await fs.mkdtemp(path.join(os.tmpdir(), 'rush-link-identity-'));
  try {
    const repoPath: string = path.join(folder, 'repo');
    await fs.mkdir(path.join(repoPath, 'projects', 'test-project-a'), { recursive: true });
    await fs.mkdir(path.join(repoPath, 'projects', 'wrong-target'), { recursive: true });
    await fs.mkdir(path.join(repoPath, 'projects', 'test-project-b', 'node_modules'), { recursive: true });

    const physicalRepoPath: string = await fs.realpath(repoPath);
    const aliasPath: string = path.join(folder, 'repo-alias');
    const dependencyPath: string = path.join(
      physicalRepoPath,
      'projects',
      'test-project-b',
      'node_modules',
      'test-project-a'
    );
    const linkType: 'junction' | 'dir' = process.platform === 'win32' ? 'junction' : 'dir';
    await fs.symlink(physicalRepoPath, aliasPath, linkType);
    await fs.symlink(path.join(physicalRepoPath, 'projects', 'test-project-a'), dependencyPath, linkType);

    const helper: TestHelper = new TestHelper(terminal);
    await helper.verifyDependenciesAsync(physicalRepoPath, 'test-project-b', ['test-project-a']);
    await helper.verifyDependenciesAsync(aliasPath, 'test-project-b', ['test-project-a']);

    await fs.rm(dependencyPath, { recursive: true, force: true });
    await fs.symlink(path.join(physicalRepoPath, 'projects', 'wrong-target'), dependencyPath, linkType);
    await assert.rejects(
      helper.verifyDependenciesAsync(aliasPath, 'test-project-b', ['test-project-a']),
      /does not resolve correctly/
    );

    await fs.rm(dependencyPath, { recursive: true, force: true });
    await assert.rejects(
      helper.verifyDependenciesAsync(aliasPath, 'test-project-b', ['test-project-a']),
      /not found/
    );
    terminal.writeLine('Physical and aliased dependency links verified; wrong and missing targets rejected.');
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
}
