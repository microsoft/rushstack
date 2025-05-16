// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { zod } from '@rushstack/mcp-server';
import type { IRushMcpTool, RushMcpPluginSession, CallToolResult } from '@rushstack/mcp-server';

import type { ExamplePlugin } from './ExamplePlugin';

export class StateCapitalTool implements IRushMcpTool {
  // eslint-disable-next-line @typescript-eslint/typedef
  public static readonly SCHEMA = zod.object({
    state: zod.string().describe('The name of the state, in all lowercase')
  });

  public readonly plugin: ExamplePlugin;
  public readonly session: RushMcpPluginSession;

  public constructor(plugin: ExamplePlugin) {
    this.plugin = plugin;
    this.session = plugin.session;
  }

  // Getter: executes after constructor
  public get schema(): typeof StateCapitalTool.SCHEMA {
    return StateCapitalTool.SCHEMA;
  }

  public async executeAsync(input: zod.infer<typeof StateCapitalTool.SCHEMA>): Promise<CallToolResult> {
    const capital: string | undefined = this.plugin.configFile?.capitalsByState[input.state];

    return {
      content: [
        {
          type: 'text',
          text: capital
            ? `The capital of "${input.state}" is "${capital}"`
            : `Unable to determine the answer from the data set.`
        }
      ]
    };
  }
}
