// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Native Rush owns the workspace lock. No engine preparation or iteration has begun.
 * A later explicit request may retry after that command finishes.
 * @alpha
 */
export class PhasedCommandEngineBusyError extends Error {
  public constructor() {
    super('Another Rush command is already running in this repository.');
    this.name = 'PhasedCommandEngineBusyError';
  }
}
