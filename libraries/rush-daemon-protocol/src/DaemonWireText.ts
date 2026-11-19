// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Shared, stateless UTF-8 codec instances for the wire layer. Both are safe
 * for concurrent reuse.
 *
 * @internal
 */
export const WIRE_TEXT_ENCODER: InstanceType<typeof TextEncoder> = new TextEncoder();

/** @internal */
export const WIRE_TEXT_DECODER: InstanceType<typeof TextDecoder> = new TextDecoder();
