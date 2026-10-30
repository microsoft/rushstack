// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';

it('uses the physical fixture folder even when the temporary root is reached through an alias', async () => {
  const testRoot: string = `${__dirname}/../../temp/test/graph-paths`;
  fs.mkdirSync(testRoot, { recursive: true });
  const root: string = fs.mkdtempSync(`${testRoot}/case-`);
  const physical: string = `${root}/physical temporary directory`;
  const alias: string = `${root}/alias`;
  let fixture: DaemonGraphTestFixture | undefined;
  try {
    fs.mkdirSync(physical);
    fs.symlinkSync(physical, alias, process.platform === 'win32' ? 'junction' : 'dir');
    fixture = new DaemonGraphTestFixture(alias);
    expect(fixture.folder).toBe(fs.realpathSync.native(fixture.folder));
    expect(path.dirname(fixture.folder)).toBe(fs.realpathSync.native(physical));
  } finally {
    await fixture?.[Symbol.asyncDispose]();
  }
});

it('copies immutable inputs into independent project-local workspaces and retains them after disposal', async () => {
  const first: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
  let second: DaemonGraphTestFixture | undefined;
  try {
    const root: string = fs.realpathSync.native(`${__dirname}/../../temp/test/graph`);
    const fixtureInput: string = fs.readFileSync(`${__dirname}/fixtures/graph/a/input.txt`, 'utf8');
    expect(path.dirname(first.folder)).toBe(root);
    first.write('a/input.txt', 'changed');
    await first[Symbol.asyncDispose]();
    expect(fs.readFileSync(`${first.folder}/a/input.txt`, 'utf8')).toBe('changed');
    expect(fs.existsSync(first.host.paths.lockfilePath)).toBe(false);

    second = await DaemonGraphTestFixture.createAsync();
    expect(path.dirname(second.folder)).toBe(root);
    expect(second.folder).not.toBe(first.folder);
    expect(fs.readFileSync(`${second.folder}/a/input.txt`, 'utf8')).toBe(fixtureInput);
    expect(fs.readFileSync(`${__dirname}/fixtures/graph/a/input.txt`, 'utf8')).toBe(fixtureInput);
  } finally {
    await second?.[Symbol.asyncDispose]();
    await first[Symbol.asyncDispose]();
  }
}, 30000);
