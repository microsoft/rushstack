// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';

import {
  BUILT_IN_RUSH_COMMAND_CLASSIFICATION,
  classifyRushCommand
} from '../RushCommandRequestPolicy';
import { RequestExclusivityClass } from '../RequestScheduler';

describe(classifyRushCommand.name, () => {
  it('classifies every command registered by Rush without repository configuration', () => {
    const emptyFolder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-classification-'));
    try {
      const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: emptyFolder });
      const registeredNames: string[] = parser.actions
        .map((action) => action.actionName)
        .filter((name: string) => name !== 'tab-complete')
        .sort();

      expect(Object.keys(BUILT_IN_RUSH_COMMAND_CLASSIFICATION).sort()).toEqual(registeredNames);
    } finally {
      fs.rmSync(emptyFolder, { recursive: true });
    }
  });

  it('uses conservative classes and fails unknown commands closed', () => {
    expect(classifyRushCommand({ commandName: 'build', commandOrigin: 'built-in' })).toBe(
      RequestExclusivityClass.SharedBuild
    );
    expect(classifyRushCommand({ commandName: 'list', commandOrigin: 'built-in' })).toBe(
      RequestExclusivityClass.SharedRead
    );
    expect(classifyRushCommand({ commandName: 'alert', commandOrigin: 'built-in' })).toBe(
      RequestExclusivityClass.Exclusive
    );
    expect(classifyRushCommand({ commandName: 'rebuild', commandOrigin: 'built-in' })).toBe(
      RequestExclusivityClass.Exclusive
    );
    expect(classifyRushCommand({ commandName: 'custom-command', commandOrigin: 'custom' })).toBe(
      RequestExclusivityClass.Exclusive
    );
    expect(classifyRushCommand({ commandName: 'constructor', commandOrigin: 'built-in' })).toBe(
      RequestExclusivityClass.Exclusive
    );
    expect(classifyRushCommand({ commandName: 'build' })).toBe(RequestExclusivityClass.Exclusive);
  });

  it('fails a plugin replacement of a built-in command name closed', () => {
    expect(classifyRushCommand({ commandName: 'build', commandOrigin: 'custom' })).toBe(
      RequestExclusivityClass.Exclusive
    );
  });
});
