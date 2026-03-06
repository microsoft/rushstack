// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API for use by MCP plugins.
 * @packageDocumentation
 */

export { type IRushMcpPlugin, type RushMcpPluginFactory } from './pluginFramework/IRushMcpPlugin.ts';
export type { IRushMcpTool } from './pluginFramework/IRushMcpTool.ts';
export { type IRegisterToolOptions, RushMcpPluginSession } from './pluginFramework/RushMcpPluginSession.ts';
export { CallToolResultSchema, type CallToolResult, type zodModule } from './pluginFramework/zodTypes.ts';
