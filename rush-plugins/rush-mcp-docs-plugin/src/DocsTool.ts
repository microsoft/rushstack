// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import type { IRushMcpTool, RushMcpPluginSession, CallToolResult, zodModule } from '@rushstack/mcp-server';
import { JsonFile } from '@rushstack/node-core-library';

import type { DocsPlugin } from './DocsPlugin.ts';

interface IDocsResult {
  query: string;
  results: {
    score: number;
    text: string;
  }[];
  count: number;
  searchTimeMs: number;
}

export class DocsTool implements IRushMcpTool<DocsTool['schema']> {
  public readonly plugin: DocsPlugin;
  public readonly session: RushMcpPluginSession;

  public constructor(plugin: DocsPlugin) {
    this.plugin = plugin;
    this.session = plugin.session;
  }

  // ZOD relies on type inference generate a messy expression in the .d.ts file
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  public get schema() {
    const zod: typeof zodModule = this.session.zod;

    return zod.object({
      userQuery: zod.string().describe('The user query to search for relevant documentation sections.')
    });
  }

  // TODO: replace with Microsoft's service
  private _searchDocs(query: string): IDocsResult {
    const startTime: number = Date.now();

    const results: IDocsResult['results'] = JsonFile.load(
      path.join(__dirname, './rush-doc-fragment.mock.json')
    );

    return {
      query,
      results,
      count: results.length,
      searchTimeMs: Date.now() - startTime
    };
  }

  public async executeAsync({ userQuery }: zodModule.infer<DocsTool['schema']>): Promise<CallToolResult> {
    const docSearchResult: IDocsResult = this._searchDocs(userQuery);

    return {
      content: [
        {
          type: 'text',
          text: docSearchResult.results.map((item) => item.text).join('\n\n')
        }
      ]
    };
  }
}
