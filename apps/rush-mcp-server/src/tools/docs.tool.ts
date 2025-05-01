// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

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
      description: '',
      schema: {
        userQuery: z.string().describe('The user query to search for relevant documentation sections.')
      }
    });
  }

  public async executeAsync({ userQuery }: { userQuery: string }): Promise<CallToolResult> {
    // An example of a knowledge base that can run, but needs to be replaced with Microsoft’s service.
    const response: Response = await fetch('http://47.120.46.115/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: userQuery, topK: 10 })
    });

    const result: IDocsResult = (await response.json()) as IDocsResult;

    return {
      content: [
        {
          type: 'text',
          text: result.results.map((item) => item.text).join('\n')
        }
      ]
    };
  }
}
