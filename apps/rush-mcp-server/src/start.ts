// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { log } from './utilities/log';
import { RushMCPServer } from './server';

const main = async (): Promise<void> => {
  const rushWorkspacePath: string | undefined = process.argv[2];
  if (!rushWorkspacePath) {
    throw new Error('Please provide workspace root path as the first argument');
  }

  const server: RushMCPServer = new RushMCPServer(rushWorkspacePath);
  const transport: StdioServerTransport = new StdioServerTransport();
  await server.connect(transport);

  log('Rush MCP Server running on stdio');
};

main().catch((error) => {
  log('Fatal error running server:', error);
  process.exit(1);
});
