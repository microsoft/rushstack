// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize } from '@rushstack/terminal';

const ASCII_HEADER_WIDTH: number = 79;
const LEFT_BRACKETS: number = 4;
const RIGHT_BRACKETS: number = 4;
const NAME_PADDING: number = 1;
const COUNT_PADDING: number = 1;
const TWO_BRACKETS: number = 2;
const MIN_MIDDLE: number = 0;

/**
 * Formats the legacy per-operation collated header line, byte-identical to
 * rush-lib's `OperationGraph` `onWriterActive` output:
 * `==[ name ]=================[ 1 of 1000 ]==`
 *
 * @beta
 */
export function formatDaemonOperationHeader(
  operationName: string,
  completed: number,
  total: number
): string {
  const leftPart: string = `${Colorize.gray('==[')} ${Colorize.cyan(operationName)} `;
  const leftPartLength: number = LEFT_BRACKETS + operationName.length + NAME_PADDING;
  const completedOfTotal: string = `${completed} of ${total}`;
  const rightPart: string = ` ${Colorize.white(completedOfTotal)} ${Colorize.gray(']==')}`;
  const rightPartLength: number = COUNT_PADDING + completedOfTotal.length + RIGHT_BRACKETS;
  const middleLength: number = Math.max(
    ASCII_HEADER_WIDTH - (leftPartLength + rightPartLength + TWO_BRACKETS),
    MIN_MIDDLE
  );
  const middlePart: string = Colorize.gray(`]${'='.repeat(middleLength)}[`);
  return `${leftPart}${middlePart}${rightPart}`;
}
