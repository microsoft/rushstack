// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

const PROC_UPTIME: string = '/proc/uptime';
const UTF8: BufferEncoding = 'utf8';
const DECIMAL_POINT: string = '.';
const FRACTION_START: number = 0;
const HUNDREDTHS_DIGITS: number = 2;
const TICKS_PER_SECOND: number = 100;

/** The clock ticks since boot, read with the tests' own parser. */
export function readTicks(): number {
  const [seconds, fraction] = fs.readFileSync(PROC_UPTIME, UTF8).split(DECIMAL_POINT);
  return Number(seconds) * TICKS_PER_SECOND + Number(fraction.slice(FRACTION_START, HUNDREDTHS_DIGITS));
}
