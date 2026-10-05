// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

const PROC_UPTIME: string = '/proc/uptime';
const UTF8: BufferEncoding = 'utf8';
const FIELD_SEPARATOR: RegExp = /\s+/;
// The first field, the seconds since boot: whole seconds and a fraction of any length, possibly empty.
const SECONDS_PATTERN: RegExp = /^(\d+)\.?(\d*)$/;
const WHOLE_MATCH: number = 1;
const FRACTION_MATCH: number = 2;
const FRACTION_START: number = 0;
const HUNDREDTHS_DIGITS: number = 2;
const PAD_DIGIT: string = '0';
const TICKS_PER_SECOND: number = 100;

/**
 * The clock ticks since boot, read with the tests' own parser. It truncates the first field to hundredths with
 * integer math, since floating point can lose a tick: `Math.floor(4.35 * 100)` is 434.
 */
export function readTicks(): number {
  const [uptime] = fs.readFileSync(PROC_UPTIME, UTF8).trim().split(FIELD_SEPARATOR);
  const match: RegExpExecArray | null = SECONDS_PATTERN.exec(uptime);
  if (!match) throw new Error(`${PROC_UPTIME} starts with ${JSON.stringify(uptime)}, not seconds`);
  const hundredths: string = match[FRACTION_MATCH].padEnd(HUNDREDTHS_DIGITS, PAD_DIGIT);
  return (
    Number(match[WHOLE_MATCH]) * TICKS_PER_SECOND +
    Number(hundredths.slice(FRACTION_START, HUNDREDTHS_DIGITS))
  );
}
