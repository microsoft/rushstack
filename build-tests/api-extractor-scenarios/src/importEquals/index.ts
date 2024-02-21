// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize } from '@rushstack/terminal';

/** @public */
export function useColors(): typeof Colorize.red {
  return Colorize.red;
}
