// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ILocalizationFile } from '../../interfaces';

const MISSING_COMMENT: string = '-- missing comment --';

export function serializeLocFile(locFile: ILocalizationFile): string {
  interface IRow {
    key: string;
    value: string;
    comment: string;
  }

  const rows: IRow[] = [];

  let longestKeyLength: number = 'key'.length;
  let longestValueLength: number = 'value'.length;
  let longestCommentLength: number = 'comment'.length;
  for (const [key, { value, comment = MISSING_COMMENT }] of Object.entries(locFile)) {
    rows.push({
      key,
      value,
      comment
    });
    longestKeyLength = Math.max(longestKeyLength, key.length);
    longestValueLength = Math.max(longestValueLength, value.length);
    longestCommentLength = Math.max(longestCommentLength, comment.length);
  }

  const lines: string[] = [];

  includeRow({ key: 'key', value: 'value', comment: 'comment' }, false);

  function includeRow({ key, value, comment }: IRow, leadingSpace: boolean = true): void {
    const paddedKey: string = key + ' '.repeat(longestKeyLength - key.length);
    const paddedValue: string = value + ' '.repeat(longestValueLength - value.length);
    lines.push(`${leadingSpace ? ' ' : ''}${paddedKey} | ${paddedValue} | ${comment}`);
  }

  lines.push('-'.repeat(longestKeyLength + longestValueLength + longestCommentLength + 8));

  for (const row of rows) {
    includeRow(row);
  }

  return lines.join('\n');
}
