// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushMcpTool, RushMcpPluginSession, CallToolResult, zodModule } from '@rushstack/mcp-server';

import type { ExamplePlugin } from './ExamplePlugin.ts';

export class StateCapitalTool implements IRushMcpTool<StateCapitalTool['schema']> {
  public readonly plugin: ExamplePlugin;
  public readonly session: RushMcpPluginSession;

  public constructor(plugin: ExamplePlugin) {
    this.plugin = plugin;
    this.session = plugin.session;
  }

  // ZOD relies on type inference generate a messy expression in the .d.ts file
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  public get schema() {
    const zod: typeof zodModule = this.session.zod;

    return zod.object({
      state: zod.string().describe('The name of the state, in all lowercase')
    });
  }

  public async executeAsync(input: zodModule.infer<StateCapitalTool['schema']>): Promise<CallToolResult> {
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
