// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushDiagnostic } from './IRushDiagnostic';

/**
 * An in-process `Error` that wraps a structured diagnostic DTO.
 *
 * @remarks
 * `RushError` lets Rush-owned code throw and propagate a failure while carrying
 * the already-emitted diagnostic. The wrapped {@link IRushDiagnostic} is the
 * wire contract; catch boundaries use its {@link RushError.diagnosticId} to
 * reference the failure rather than re-rendering it.
 *
 * @beta
 */
export class RushError extends Error {
  /**
   * The structured diagnostic carried by this error.
   */
  public readonly diagnostic: IRushDiagnostic;

  public constructor(diagnostic: IRushDiagnostic, message?: string) {
    super(message ?? diagnostic.code);
    this.name = 'RushError';
    this.diagnostic = diagnostic;

    // Restore the prototype chain, which is broken when subclassing a built-in
    // and compiling to ES5/ES2018 CommonJS.
    Object.setPrototypeOf(this, RushError.prototype);
  }

  /**
   * The id of the wrapped diagnostic.
   */
  public get diagnosticId(): string {
    return this.diagnostic.diagnosticId;
  }
}
