// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import testScss from './test.scss';
import testSass from './test.sass';
import testFunction from './preCopyTest';

/** @public */
export function log(message: string): void {
  console.log(message);
}

/** @public */
export function add(num1: number, num2: number): number {
  return num1 + num2;
}

/** @public */
export function logClass(): void {
  console.log(testScss.foo);
  console.log(testSass.foo);
}

testFunction();
