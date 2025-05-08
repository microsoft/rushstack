// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushMcpTool } from './IRushMcpTool';

/**
 * Each plugin gets its own session.
 *
 * @public
 */
export interface IRegisterToolOptions {
  toolName: string;
  description?: string;
}

/**
 * Each plugin gets its own session.
 *
 * @public
 */
export class RushMcpPluginSession {
  public registerTool(options: IRegisterToolOptions, tool: IRushMcpTool): void {}
}
