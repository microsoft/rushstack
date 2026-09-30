// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

const PROC_SELF_STAT: string = '/proc/self/stat';
const UTF8: BufferEncoding = 'utf8';
const COMM_END: string = ')';
const FIELD_SEPARATOR: string = ' ';
// After the ")" that ends the command name come: " <state> <ppid> <pgrp> ...".
const PGRP_FIELD_INDEX: number = 3;

/** This process's own process group id, or `undefined` when the platform cannot report it. */
export function ownGroupId(): number | undefined {
  try {
    const stat: string = fs.readFileSync(PROC_SELF_STAT, UTF8);
    const fields: string[] = stat.slice(stat.lastIndexOf(COMM_END)).split(FIELD_SEPARATOR);
    return Number(fields[PGRP_FIELD_INDEX]);
  } catch {
    return undefined;
  }
}
