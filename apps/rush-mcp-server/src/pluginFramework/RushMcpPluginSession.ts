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
export abstract class RushMcpPluginSession {
  public readonly zod: typeof zodModule = zod;
  public abstract registerTool(options: IRegisterToolOptions, tool: IRushMcpTool): void;
}

export class RushMcpPluginSessionInternal extends RushMcpPluginSession {
  public constructor() {
    super();
  }

  public override registerTool(options: IRegisterToolOptions, tool: IRushMcpTool): void {
    // TODO: Register the tool
  }
}
