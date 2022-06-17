// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '../providers/CommandLineParser';
import { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter';

class TestCommandLine extends CommandLineParser {
  public flag!: CommandLineFlagParameter;
  public done: boolean = false;

  public constructor() {
    super({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });
  }

  protected async onExecute(): Promise<void> {
    await super.onExecute();
    this.done = true;
  }

  protected onDefineParameters(): void {
    this.flag = this.defineFlagParameter({
      parameterLongName: '--flag',
      description: 'The flag'
    });
  }
}

describe(`Actionless ${CommandLineParser.name}`, () => {
  it('parses an empty arg list', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    await commandLineParser.execute([]);

    expect(commandLineParser.done).toBe(true);
    expect(commandLineParser.selectedAction).toBeUndefined();
    expect(commandLineParser.flag.value).toBe(false);
  });

  it('parses a flag', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    await commandLineParser.execute(['--flag']);

    expect(commandLineParser.done).toBe(true);
    expect(commandLineParser.selectedAction).toBeUndefined();
    expect(commandLineParser.flag.value).toBe(true);
  });

  it('parses a flag and remainder', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    commandLineParser.defineCommandLineRemainder({
      description: 'remainder description'
    });

    await commandLineParser.execute(['--flag', 'the', 'remaining', 'args']);

    expect(commandLineParser.done).toBe(true);
    expect(commandLineParser.selectedAction).toBeUndefined();
    expect(commandLineParser.flag.value).toBe(true);
    expect(commandLineParser.remainder!.values).toEqual(['the', 'remaining', 'args']);
  });
});
