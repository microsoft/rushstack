// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushMcpPluginSession } from './RushMcpPluginSession';

/**
 * MCP plugins should implement this interface.
 * @public
 */
export interface IRushMcpPlugin {
  onInitializeAsync(): Promise<void>;
}

/**
 * The plugin's entry point should return this function as its default export.
 * @public
 */
export type RushMcpPluginFactory<TConfigFile = {}> = (
  session: RushMcpPluginSession,
  configFile: TConfigFile | undefined
) => IRushMcpPlugin;
