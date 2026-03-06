// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushMcpPlugin, RushMcpPluginSession } from '@rushstack/mcp-server';

import { DocsTool } from './DocsTool.ts';

export interface IDocsPluginConfigFile {}

export class DocsPlugin implements IRushMcpPlugin {
  public session: RushMcpPluginSession;
  public configFile: IDocsPluginConfigFile | undefined = undefined;

  public constructor(session: RushMcpPluginSession, configFile: IDocsPluginConfigFile | undefined) {
    this.session = session;
    this.configFile = configFile;
  }

  public async onInitializeAsync(): Promise<void> {
    this.session.registerTool(
      {
        toolName: 'rush_docs',
        description:
          'Search and retrieve relevant sections from the official Rush documentation based on user queries.'
      },
      new DocsTool(this)
    );
  }
}
