// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';

import { FileSystem, JsonFile, type JsonObject } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { TestHelper } from './TestHelper';

/**
 * Integration test for Rush PNPM workspace mode with PNPM's global virtual store.
 * This test verifies that Rush passes enableGlobalVirtualStore through to a real PNPM install.
 */
export async function testPnpmGlobalVirtualStoreAsync(terminal: ITerminal): Promise<void> {
  const helper: TestHelper = new TestHelper(terminal);
  // Use system temp directory to avoid rush init detecting parent rush.json
  const testRepoPath: string = path.join(
    os.tmpdir(),
    'rush-package-manager-test',
    'pnpm-global-virtual-store-test-repo'
  );
  const sharedStorePath: string = path.join(os.tmpdir(), 'rush-package-manager-test', 'shared-pnpm-store');
  const rushEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    CI: 'false',
    PNPM_CONFIG_CI: 'false',
    RUSH_PNPM_STORE_PATH: sharedStorePath,
    RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE: '1'
  };

  terminal.writeLine('==========================================');
  terminal.writeLine('Rush PNPM Global Virtual Store Integration Test');
  terminal.writeLine('==========================================');
  terminal.writeLine('');
  terminal.writeLine(
    'This test verifies that Rush can enable PNPM global virtual store during workspace installs.'
  );
  terminal.writeLine('');

  await helper.createTestRepoAsync(testRepoPath, 'pnpm', '10.12.1');

  const pnpmConfigPath: string = path.join(testRepoPath, 'common/config/rush/pnpm-config.json');
  const pnpmConfigJson: JsonObject = await JsonFile.loadAsync(pnpmConfigPath);
  pnpmConfigJson.useWorkspaces = true;
  await JsonFile.saveAsync(pnpmConfigJson, pnpmConfigPath, { updateExistingFile: true });

  terminal.writeLine('Creating test-project-a...');
  await helper.createTestProjectAsync(
    testRepoPath,
    'test-project-a',
    '1.0.0',
    { semver: '^7.5.4' },
    `node -e "const fs = require('fs'); fs.mkdirSync('lib', {recursive: true}); fs.writeFileSync('lib/index.js', 'module.exports = { greet: () => \\"Hello from A\\" };');"`
  );

  terminal.writeLine('Creating test-project-b...');
  await helper.createTestProjectAsync(
    testRepoPath,
    'test-project-b',
    '1.0.0',
    {
      'test-project-a': 'workspace:*',
      moment: '^2.29.4'
    },
    `node -e "const fs = require('fs'); fs.mkdirSync('lib', {recursive: true}); fs.writeFileSync('lib/index.js', 'module.exports = { test: () => \\"Using: \\" + require(\\'test-project-a\\').greet() };');"`
  );

  await FileSystem.ensureEmptyFolderAsync(sharedStorePath);

  terminal.writeLine('');
  terminal.writeLine("Running 'rush update' with PNPM global virtual store enabled...");
  await helper.executeRushAsync(['update'], testRepoPath, rushEnvironment);

  terminal.writeLine('');
  terminal.writeLine("Running 'rush install' with PNPM global virtual store enabled...");
  await helper.executeRushAsync(['install'], testRepoPath, rushEnvironment);

  await helper.verifyPnpmGlobalVirtualStoreAsync(testRepoPath, sharedStorePath);
  await helper.verifyDependenciesAsync(testRepoPath, 'test-project-a', ['semver']);
  await helper.verifyDependenciesAsync(testRepoPath, 'test-project-b', ['test-project-a']);

  terminal.writeLine('');
  terminal.writeLine("Running 'rush build'...");
  await helper.executeRushAsync(['build'], testRepoPath, rushEnvironment);

  await helper.verifyBuildOutputsAsync(testRepoPath, ['test-project-a', 'test-project-b']);
  await helper.testBuiltCodeAsync(testRepoPath, 'test-project-b');

  terminal.writeLine('');
  terminal.writeLine('==========================================');
  terminal.writeLine('✓ PNPM Global Virtual Store Integration Test PASSED');
  terminal.writeLine('==========================================');
  terminal.writeLine('');
  terminal.writeLine('PNPM global virtual store works correctly with Rush workspace installs:');
  terminal.writeLine('  - Workspace file includes enableGlobalVirtualStore');
  terminal.writeLine('  - Shared PNPM store is populated');
  terminal.writeLine('  - Dependencies link and resolve correctly');
  terminal.writeLine('  - Build completed successfully');
  terminal.writeLine('');
}
