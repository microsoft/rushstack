// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** The byte length of the frame payload-length field (`u32` little-endian). @beta */
export const LENGTH_FIELD_BYTES: number = 4;

/** The byte length of the frame type field (`u8`). @beta */
export const TYPE_FIELD_BYTES: number = 1;

/** The total byte length of a frame header: length field plus type field. @beta */
export const FRAME_HEADER_BYTES: number = LENGTH_FIELD_BYTES + TYPE_FIELD_BYTES;

/** The offset of the payload-length field within the header. @beta */
export const LENGTH_FIELD_OFFSET: number = 0;

/** The offset of the frame type field within the header. @beta */
export const TYPE_FIELD_OFFSET: number = LENGTH_FIELD_BYTES;

const KIBIBYTE: number = 1024;
const MEBIBYTE: number = KIBIBYTE * KIBIBYTE;
const DEFAULT_MAX_PAYLOAD_MEBIBYTES: number = 16;

/**
 * The default maximum accepted payload size of a single frame.
 *
 * @remarks
 * Guards the streaming decoder against corrupt or hostile length prefixes.
 * Callers may override it per decoder.
 * @beta
 */
export const DEFAULT_MAX_PAYLOAD_BYTES: number = DEFAULT_MAX_PAYLOAD_MEBIBYTES * MEBIBYTE;

/** The byte length of the operation-id length prefix used by log frames (`u16` little-endian). @beta */
export const OPERATION_ID_LENGTH_BYTES: number = 2;

/** The maximum byte length of an operation id in a log frame (`u16` range). @beta */
export const MAX_OPERATION_ID_BYTES: number = 65535;

/** The offset of the operation-id length prefix within a log frame payload. @beta */
export const OPERATION_ID_LENGTH_OFFSET: number = 0;

/** The byte length of the request-id length prefix used by stdin frames (`u16` little-endian). @beta */
export const REQUEST_ID_LENGTH_BYTES: number = 2;

/** The maximum byte length of a request id in a stdin frame (`u16` range). @beta */
export const MAX_REQUEST_ID_BYTES: number = 65535;

/** The offset of the request-id length prefix within a stdin frame payload. @beta */
export const REQUEST_ID_LENGTH_OFFSET: number = 0;

/** The offset of the frame payload within a serialized frame. @beta */
export const PAYLOAD_OFFSET: number = FRAME_HEADER_BYTES;
