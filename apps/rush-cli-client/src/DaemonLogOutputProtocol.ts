// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const MAX_LOG_OUTPUT_BYTES: number = 64 * 1024;
export const LOG_OUTPUT_FD: number = 3;

export type LogOutputRequest =
  | { readonly kind: 'write'; readonly bytes: Uint8Array }
  | { readonly kind: 'end' };

export type LogOutputResponse =
  | { readonly kind: 'ready' }
  | { readonly kind: 'written'; readonly byteLength: number }
  | { readonly kind: 'error'; readonly message: string; readonly code?: string };
