// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { createNativeBuildTestFixture } from './NativeBuildTestFixture';

describe('native build fixture lifetime', () => {
  it('joins the whole old callback without rebinding it to a later fixture', async () => {
    const old = createNativeBuildTestFixture();
    const next = createNativeBuildTestFixture();
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let continued: boolean = false;
    let disposed: boolean = false;
    const work = old.runAsync(async ({ folder, invokeAsync }) => {
      await released;
      expect(folder).toBe(old.folder);
      expect(() => invokeAsync(['build'])).toThrow('already closing');
      fs.writeFileSync(path.join(folder, 'late-callback.txt'), 'old fixture only');
      continued = true;
    });
    const closing = old.closeAsync().then(() => {
      disposed = true;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(disposed).toBe(false);
      expect(fs.existsSync(old.folder)).toBe(true);
      release();
      await work;
      await closing;
      expect(continued).toBe(true);
      expect(fs.existsSync(old.folder)).toBe(false);
      expect(fs.existsSync(path.join(next.folder, 'late-callback.txt'))).toBe(false);
      expect(fs.readFileSync(path.join(next.folder, 'a/input.txt'), 'utf8')).toBe('one');
    } finally {
      release();
      try {
        await closing;
      } finally {
        await next.closeAsync();
      }
    }
  }, 15000);

  it.each([false, true])(
    'terminates an owned watch before removal (registered during cleanup: %s)',
    async (late) => {
      const fixture = createNativeBuildTestFixture();
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        cwd: fixture.folder,
        stdio: 'ignore'
      });
      const closed = once(child, 'close');
      if (!late) fixture.trackWatch(child, closed);
      let continued: boolean = false;
      const work = fixture.runAsync(async () => {
        if (late) expect(() => fixture.trackWatch(child, closed)).toThrow('already closing');
        await closed;
        continued = true;
      });
      await fixture.closeAsync();
      await work;
      expect(continued).toBe(true);
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(fs.existsSync(fixture.folder)).toBe(false);
    },
    15000
  );

  it('leaves callback failures observable while cleanup joins the rejected work', async () => {
    const fixture = createNativeBuildTestFixture();
    const failure = new Error('native fixture callback failure');
    const work = fixture.runAsync(async () => {
      throw failure;
    });
    try {
      await expect(work).rejects.toBe(failure);
    } finally {
      await fixture.closeAsync();
    }
    expect(fs.existsSync(fixture.folder)).toBe(false);
  }, 15000);
});
