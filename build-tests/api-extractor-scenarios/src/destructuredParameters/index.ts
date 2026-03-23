// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export function testObject(first: string, { x, y }: { x: number; y: number }): void {}

/** @public */
export function testArray([x, y]: [number, number], last: string): void {}

/** @public */
export function testObjects({ x }: { x: number }, { y }: { y: number }): void {}

/** @public */
export function testNameConflict([x, y]: [number, number], input: boolean): void {}

/** @public */
export function testNameConflict2({ x }: { x: number }, { y }: { y: number }, input2: string): void {}

/** @public */
export function testObjectWithComments(
  // slash P1
  {
    // slash P2
    x, // slash P3
    // slash P4
    y // slash P5
    // slash P6
  }: // slash T1
  {
    // slash T2
    x: number; // slash T3
    // slash T4
    y: number; // slash T5
    // slash T6
  } // slash T7
  // slash T8
): void {}
