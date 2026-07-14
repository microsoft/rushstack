// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This module is intentionally self-contained. It imports no runtime values
// from the rest of the package so that a frozen copy can be embedded into the
// zero-dependency `install-run-rush` bundle, which must not import
// `@rushstack/reporter` at runtime.

/**
 * The protocol major version frozen into the bootstrap encoder.
 *
 * @remarks
 * This constant is generated from `@rushstack/reporter` and must equal
 * `REPORTER_PROTOCOL_VERSION.major`. It is duplicated here, rather than
 * imported, so the encoder can be embedded without a runtime dependency.
 *
 * @beta
 */
export const BOOTSTRAP_PROTOCOL_MAJOR: number = 1;

/**
 * The maximum size of the buffered bootstrap event stream, in bytes (1 MiB).
 *
 * @beta
 */
export const BOOTSTRAP_BUFFER_MAX_BYTES: number = 1024 * 1024;

/**
 * The maximum size of a single raw external-output chunk, in bytes (64 KiB).
 *
 * @beta
 */
export const BOOTSTRAP_EXTERNAL_CHUNK_MAX_BYTES: number = 64 * 1024;

/**
 * The private environment variable used to hand the bootstrap NDJSON file path
 * to the installed frontend.
 *
 * @beta
 */
export const RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR: '_RUSH_REPORTER_BOOTSTRAP_HANDOFF' =
  '_RUSH_REPORTER_BOOTSTRAP_HANDOFF';

/**
 * The namespaced extension event name that describes bootstrap buffer truncation.
 *
 * @beta
 */
export const BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME: 'rush.reporter.bufferTruncated' =
  'rush.reporter.bufferTruncated';
