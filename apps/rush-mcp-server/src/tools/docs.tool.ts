// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';
import { JsonFile } from '@rushstack/node-core-library';
import path from 'path';

import { BaseTool, type CallToolResult } from './base.tool';

interface IDocsResult {
  query: string;
  results: {
    score: number;
    text: string;
  }[];
  count: number;
  searchTimeMs: number;
}

export class RushDocsTool extends BaseTool {
  public constructor() {
    super({
      name: 'rush_docs',
      description:
        'Search and retrieve relevant sections from the official Rush documentation based on user queries.',
      schema: {
        userQuery: z.string().describe('The user query to search for relevant documentation sections.')
      }
    });
  }

  // TODO: replace with Microsoft's service
  private _searchDocs(query: string): IDocsResult {
    const startTime: number = Date.now();

    const results: IDocsResult['results'] = JsonFile.load(
      path.join(__dirname, '../rush-doc-fragment.mock.json')
    );

    return {
      query,
      results,
      count: results.length,
      searchTimeMs: Date.now() - startTime
    };
  }

  public async executeAsync({ userQuery }: { userQuery: string }): Promise<CallToolResult> {
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
