// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Identifies the version of the reporter event protocol that produced an event.
 *
 * @remarks
 * The `major` version gates compatibility. Consumers reject a protocol whose
 * `major` they do not support. `minor` versions are additive, so a consumer
 * ignores unknown optional fields and events introduced by a newer `minor`.
 *
 * @beta
 */
export interface IReporterProtocolVersion {
  /**
   * The major protocol version. Incremented only for breaking changes.
   */
  readonly major: number;

  /**
   * The minor protocol version. Incremented for additive, backward-compatible changes.
   */
  readonly minor: number;
}
