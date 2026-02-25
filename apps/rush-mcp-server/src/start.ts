// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as process from 'node:process';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { FileSystem } from '@rushstack/node-core-library';
import { RushSdkLoader } from '@rushstack/rush-sdk/loader';

import { log } from './utilities/log.ts';
import type { RushMCPServer } from './server.ts';

const main = async (): Promise<void> => {
  const rushWorkspacePath: string | undefined = process.argv[2];
  if (!rushWorkspacePath) {
    throw new Error('Please provide workspace root path as the first argument');
  }

  const rushWorkspaceFullPath: string = path.resolve(rushWorkspacePath);

  if (!(await FileSystem.existsAsync(rushWorkspaceFullPath))) {
    throw new Error(
      'The specified workspace root path does not exist:\n  ' + JSON.stringify(rushWorkspacePath)
    );
  }

  // Load rush-sdk from the specified repository
  await RushSdkLoader.loadAsync({
    rushJsonSearchFolder: rushWorkspaceFullPath
  });

  const RushMCPServerClass: typeof RushMCPServer = (await import('./server.ts')).RushMCPServer;

  const server: RushMCPServer = new RushMCPServerClass(rushWorkspaceFullPath);
  await server.startAsync();
  const transport: StdioServerTransport = new StdioServerTransport();
  await server.connect(transport);

  log('Rush MCP Server running on stdio');
};

main().catch((error) => {
  log('Fatal error running server:', error instanceof Error ? error.message : error);
  process.exit(1);
});
