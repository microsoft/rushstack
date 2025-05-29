// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushMcpTool } from './IRushMcpTool';
import * as zod from 'zod';
import type { zodModule } from './zodTypes';

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
  public readonly zod: typeof zodModule = zod;
  public registerTool(options: IRegisterToolOptions, tool: IRushMcpTool): void {}
}
