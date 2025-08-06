// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as RushLib from '@rushstack/rush-sdk';
import type { RushConfiguration } from '@rushstack/rush-sdk';

export const getRushConfiguration = async (): Promise<RushConfiguration> => {
  // Since the MCP server is not always started from the directory of the Rush monorepo,
  // it’s necessary to use dynamic import to load the Rush SDK.
  const Rush: typeof RushLib = await import('@rushstack/rush-sdk');
  const rushConfiguration: RushConfiguration = Rush.RushConfiguration.loadFromDefaultLocation();
  return rushConfiguration;
};
