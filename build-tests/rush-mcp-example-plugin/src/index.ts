// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushMcpPluginSession, RushMcpPluginFactory } from '@rushstack/mcp-server';
import { ExamplePlugin, type IExamplePluginConfigFile } from './ExamplePlugin.ts';

function createPlugin(
  session: RushMcpPluginSession,
  configFile: IExamplePluginConfigFile | undefined
): ExamplePlugin {
  return new ExamplePlugin(session, configFile);
}

export default createPlugin satisfies RushMcpPluginFactory<IExamplePluginConfigFile>;
