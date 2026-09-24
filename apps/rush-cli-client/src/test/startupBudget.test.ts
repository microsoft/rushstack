// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  createNativeBuildTestFixture,
  type INativeBuildResult,
  type INativeBuildTestFixture
} from './NativeBuildTestFixture';

// Must match StartupModuleProbe.ts. The probe is not imported here because it registers an exit hook.
const STARTUP_MODULES_MARKER: string = 'rush-client-startup-modules:';
const PROBE_ARGS: ReadonlyArray<string> = ['--require', path.resolve(__dirname, 'StartupModuleProbe.js')];

// Only in-process fallback, rushx discovery, daemon startup and version selection may load these.
const DEFERRED_MODULES: ReadonlyArray<RegExp> = [
  /[\\/]rush-lib[\\/]lib-commonjs[\\/]index\.js$/,
  /[\\/]rush[\\/]lib-commonjs[\\/](start|MinimalRushConfiguration)\.js$/,
  /[\\/]rush-daemon[\\/]lib-commonjs[\\/](index|VersionSelectedDaemonLauncher)\.js$/
];

// A warm connect loaded ~1260 modules before #6054 and ~BASELINE after it; leave headroom for growth.
const WARM_CONNECT_MODULE_BUDGET: number = 600;

function readLoadedModules(result: INativeBuildResult): ReadonlyArray<string> {
  const line: string | undefined = result.stderr
    .split('\n')
    .find((candidate) => candidate.startsWith(STARTUP_MODULES_MARKER));
  if (!line) throw new Error(`The startup module probe did not report: ${result.stderr}`);
  return JSON.parse(line.slice(STARTUP_MODULES_MARKER.length));
}

describe('rush-client startup budget', () => {
  let fixture: INativeBuildTestFixture;

  beforeEach(() => {
    fixture = createNativeBuildTestFixture();
  });
  afterEach(async () => {
    await fixture.closeAsync();
  });

  it('connects to a warm daemon without loading the @microsoft/rush-lib entry point', async () => {
    // Cold auto-start may load the launcher; the warm invocations below must not.
    expect((await fixture.invokeAsync(['build'])).code).toBe(0);
    for (const argv of [['build'], ['daemon', 'status']]) {
      const result: INativeBuildResult = await fixture.invokeAsync(argv, false, PROBE_ARGS);
      expect(result.code).toBe(0);
      const modules: ReadonlyArray<string> = readLoadedModules(result);
      expect({ argv, deferred: modules.filter((name) => DEFERRED_MODULES.some((re) => re.test(name))) }).toEqual({
        argv,
        deferred: []
      });
      expect(modules.length).toBeLessThanOrEqual(WARM_CONNECT_MODULE_BUDGET);
    }
    // The probe and patterns must observe the in-process path, or the assertions above prove nothing.
    const native: INativeBuildResult = await fixture.invokeAsync(['--no-daemon', 'build'], false, PROBE_ARGS);
    expect(native.code).toBe(0);
    expect(readLoadedModules(native).filter((name) => DEFERRED_MODULES[0].test(name))).toHaveLength(1);
  }, 60000);
});
