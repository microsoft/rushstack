// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '../providers/CommandLineParser.ts';
import type { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter.ts';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities.ts';

class TestCommandLine extends CommandLineParser {
  public flag: CommandLineFlagParameter;
  public done: boolean = false;

  public constructor() {
    super({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });

    this.flag = this.defineFlagParameter({
      parameterLongName: '--flag',
      description: 'The flag'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    await super.onExecuteAsync();
    this.done = true;
  }
}

describe(`Actionless ${CommandLineParser.name}`, () => {
  it('renders help text', () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    ensureHelpTextMatchesSnapshot(commandLineParser);
  });

  it('parses an empty arg list', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    await commandLineParser.executeAsync([]);

    expect(commandLineParser.done).toBe(true);
    expect(commandLineParser.selectedAction).toBeUndefined();
    expect(commandLineParser.flag.value).toBe(false);
  });

  it('parses a flag', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    await commandLineParser.executeAsync(['--flag']);

    expect(commandLineParser.done).toBe(true);
    expect(commandLineParser.selectedAction).toBeUndefined();
    expect(commandLineParser.flag.value).toBe(true);
  });

  it('parses a flag and remainder', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    commandLineParser.defineCommandLineRemainder({
      description: 'remainder description'
    });

    await commandLineParser.executeAsync(['--flag', 'the', 'remaining', 'args']);

    expect(commandLineParser.done).toBe(true);
    expect(commandLineParser.selectedAction).toBeUndefined();
    expect(commandLineParser.flag.value).toBe(true);
    expect(commandLineParser.remainder!.values).toEqual(['the', 'remaining', 'args']);
  });
});
