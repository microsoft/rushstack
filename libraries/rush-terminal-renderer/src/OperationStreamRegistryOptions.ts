// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TerminalWritable } from '@rushstack/terminal';

/** Options for {@link OperationStreamRegistry}. @beta */
export interface IOperationStreamRegistryOptions {
  /** The sink the collated output flows to. */
  readonly destination: TerminalWritable;
  /** Whether to strip ANSI colors from the collated output. */
  readonly removeColors: boolean;
  /** Whether to suppress the blank line after each operation header. */
  readonly quiet: boolean;
}
