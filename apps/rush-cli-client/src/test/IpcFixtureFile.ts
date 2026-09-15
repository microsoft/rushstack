// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

export function writeIpcFixtureFile(filename: string, contents: string): void {
  const temporary: string = path.join(
    path.dirname(filename), `.${path.basename(filename)}-${process.pid}-${randomUUID()}.tmp`
  );
  const descriptor: number = fs.openSync(temporary, 'wx', 0o600);
  try {
    try {
      fs.writeFileSync(descriptor, contents, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function readIpcFixtureEvents<T>(filename: string): T[] {
  const contents: string = fs.readFileSync(filename, 'utf8');
  // A concurrent append is not published until its terminating newline is visible.
  return contents.slice(0, contents.lastIndexOf('\n') + 1)
    .split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export async function readPressureGateAsync(
  filename: string,
  deadline: number
): Promise<{ additionalMemoryBytes?: number; cancelled?: boolean }> {
  while (!fs.existsSync(filename)) {
    if (performance.now() >= deadline) throw new Error('Pressure fixture gate was not released.');
    await delayAsync(10);
  }
  const gate: { additionalMemoryBytes?: number; cancelled?: boolean } =
    JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (gate.cancelled) throw new Error('Pressure fixture setup was cancelled.');
  return gate;
}
