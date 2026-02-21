// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushMcpPlugin, RushMcpPluginSession } from '@rushstack/mcp-server';
import { StateCapitalTool } from './StateCapitalTool.ts';

export interface IExamplePluginConfigFile {
  capitalsByState: Record<string, string>;
}

export class ExamplePlugin implements IRushMcpPlugin {
  public session: RushMcpPluginSession;
  public configFile: IExamplePluginConfigFile | undefined = undefined;

  public constructor(session: RushMcpPluginSession, configFile: IExamplePluginConfigFile | undefined) {
    this.session = session;
    this.configFile = configFile;
  }

  public async onInitializeAsync(): Promise<void> {
    this.session.registerTool({ toolName: 'state_capital' }, new StateCapitalTool(this));
  }
}
