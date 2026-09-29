// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getCiEnvironmentVariable, isDaemonOffBeforeRouting } from '../earlyRouting';

describe(getCiEnvironmentVariable.name, () => {
  it.each([
    { environment: {}, name: undefined },
    { environment: { CI: '' }, name: undefined },
    { environment: { CI: '0', GITHUB_ACTIONS: 'false' }, name: undefined },
    { environment: { CI: 'true' }, name: 'CI' },
    { environment: { CI: 'false', TF_BUILD: 'True' }, name: 'TF_BUILD' },
    { environment: { TEAMCITY_VERSION: '2024.1', JENKINS_URL: 'https://ci' }, name: 'JENKINS_URL' }
  ])('returns $name for $environment', ({ environment, name }) => {
    expect(getCiEnvironmentVariable(environment)).toBe(name);
  });
});

describe(isDaemonOffBeforeRouting.name, () => {
  let folder: string;
  let rushJsonPath: string;
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-early-routing-'));
    rushJsonPath = path.join(folder, 'rush.json');
  });
  afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

  function isOff(rushJson: string, environment: Record<string, string> = {}): boolean {
    fs.writeFileSync(rushJsonPath, rushJson);
    return isDaemonOffBeforeRouting(environment, rushJsonPath);
  }

  it('follows RUSH_DAEMON and the CI markers', () => {
    expect(isDaemonOffBeforeRouting({ RUSH_DAEMON: '1' }, undefined)).toBe(true);
    expect(isOff('{ "daemon": { "enabled": true } }', { RUSH_DAEMON: '0' })).toBe(true);
    expect(isOff('{}', { RUSH_DAEMON: '1' })).toBe(false);
    expect(isOff('{ "daemon": { "enabled": true } }', { CI: '1' })).toBe(true);
    expect(isOff('{}', { CI: '1', RUSH_DAEMON: '1' })).toBe(false);
  });

  it('reads daemon.enabled from rush.json when RUSH_DAEMON is not set', () => {
    expect(isOff('{ "projects": [] }')).toBe(true);
    expect(isOff('{ "daemon": {} }')).toBe(true);
    expect(isOff('{ "daemon": { "enabled": false, "autoStart": true } }')).toBe(true);
    expect(isOff('{ "daemon": { "compatiblePlugins": ["p"], "enabled": true } }')).toBe(false);
  });

  it('ignores the daemon block that `rush init` writes as comments', () => {
    expect(isOff('{\n  // "daemon": {\n  //   "enabled": true\n  // },\n  "projects": []\n}')).toBe(true);
    expect(isOff('{\n  /* "daemon": { "enabled": true } */\n  "projects": []\n}')).toBe(true);
    expect(isOff('{\n  "daemon": {\n    // "enabled": false\n    "enabled": true\n  }\n}')).toBe(false);
  });

  it('cannot tell when rush.json cannot be read', () => {
    expect(isDaemonOffBeforeRouting({}, path.join(folder, 'missing', 'rush.json'))).toBe(false);
  });
});
