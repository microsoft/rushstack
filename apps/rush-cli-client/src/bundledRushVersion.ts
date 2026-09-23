// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@rushstack/node-core-library';

/**
 * The version of the bundled Rush engine, which is `Rush.version`, read without loading the engine.
 */
export const BUNDLED_RUSH_VERSION: string = JsonFile.load(
  require.resolve('@microsoft/rush-lib/package.json')
).version;
