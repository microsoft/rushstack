// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

import {
  fetchBuildStatusAsync,
  formatBuildStatusSnapshot,
  type IBuildStatusSnapshot
} from '../utilities/build-status-client';
import { BaseTool, type CallToolResult } from './base.tool';

export class RushBuildStatusTool extends BaseTool {
  public constructor() {
    super({
      name: 'rush_get_build_status',
      description:
        'Returns the current build status from a running `rush start` session. ' +
        'Connects to the rush-serve-plugin WebSocket endpoint and returns a snapshot ' +
        'of all operation statuses. Requires `rush start` to be running.',
      schema: {
        port: z.number().describe('The port number where `rush start` is serving'),
        host: z.string().optional().describe('The hostname (default: localhost)')
      }
    });
  }

  public async executeAsync({ port, host }: { port: number; host?: string }): Promise<CallToolResult> {
    const snapshot: IBuildStatusSnapshot = await fetchBuildStatusAsync({ port, host });

    return {
      content: [
        {
          type: 'text',
          text: formatBuildStatusSnapshot(snapshot)
        }
      ]
    };
  }
}
