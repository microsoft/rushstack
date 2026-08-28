// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EnvironmentVariableNames } from '@microsoft/rush-lib/lib/api/EnvironmentConfiguration';

export function getRushPreviewVersion(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  return env[EnvironmentVariableNames.RUSH_PREVIEW_VERSION] || undefined;
}
