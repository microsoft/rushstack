// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalChunkKind } from '@rushstack/terminal';
import type { ITerminalChunk } from '@rushstack/terminal';

import { OperationTextDecoder } from '../OperationTextDecoder';

const OP_A: string = 'a';
const OP_B: string = 'b';
const EMPTY: string = '';
const EURO: string = '\u20ac';
const PI: string = '\u03c0';
const LAMBDA: string = '\u03bb';
const REPLACEMENT: string = '\ufffd';
const START: number = 0;
const SPLIT: number = 1;
const ENCODER: InstanceType<typeof TextEncoder> = new TextEncoder();

it('keeps split UTF-8 independent across operations and streams', () => {
  const decoder: OperationTextDecoder = new OperationTextDecoder();
  const euro: Uint8Array = ENCODER.encode(EURO);
  const pi: Uint8Array = ENCODER.encode(PI);
  const lambda: Uint8Array = ENCODER.encode(LAMBDA);
  expect(decoder.decode(OP_A, TerminalChunkKind.Stdout, euro.subarray(START, SPLIT)).text).toBe(EMPTY);
  expect(decoder.decode(OP_B, TerminalChunkKind.Stdout, lambda.subarray(START, SPLIT)).text).toBe(EMPTY);
  expect(decoder.decode(OP_A, TerminalChunkKind.Stderr, pi.subarray(START, SPLIT)).text).toBe(EMPTY);
  expect(decoder.decode(OP_A, TerminalChunkKind.Stdout, euro.subarray(SPLIT)).text).toBe(EURO);
  expect(decoder.decode(OP_A, TerminalChunkKind.Stderr, pi.subarray(SPLIT)).text).toBe(PI);
  expect(decoder.decode(OP_B, TerminalChunkKind.Stdout, lambda.subarray(SPLIT)).text).toBe(LAMBDA);
});

it('flushes incomplete text once and releases the operation decoder state', () => {
  const decoder: OperationTextDecoder = new OperationTextDecoder();
  const chunks: ITerminalChunk[] = [];
  decoder.decode(OP_A, TerminalChunkKind.Stderr, ENCODER.encode(EURO).subarray(START, SPLIT));
  decoder.flush(OP_A, (chunk: ITerminalChunk) => { chunks.push(chunk); });
  decoder.flush(OP_A, (chunk: ITerminalChunk) => { chunks.push(chunk); });
  expect(chunks).toEqual([{ kind: TerminalChunkKind.Stderr, text: REPLACEMENT }]);
  expect(decoder.decode(OP_A, TerminalChunkKind.Stdout, ENCODER.encode(EURO)).text).toBe(EURO);
});
