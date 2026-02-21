// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushMcpPluginSession, RushMcpPluginFactory } from '@rushstack/mcp-server';

import { DocsPlugin, type IDocsPluginConfigFile } from './DocsPlugin.ts';

function createPlugin(
  session: RushMcpPluginSession,
  configFile: IDocsPluginConfigFile | undefined
): DocsPlugin {
  return new DocsPlugin(session, configFile);
}

export default createPlugin satisfies RushMcpPluginFactory<IDocsPluginConfigFile>;
