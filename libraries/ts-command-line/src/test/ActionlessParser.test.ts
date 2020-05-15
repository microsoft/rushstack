// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '../CommandLineParser';
import { CommandLineFlagParameter } from '../CommandLineParameter';


class TestCommandLine extends CommandLineParser {
  public flag: CommandLineFlagParameter;

  public constructor() {
    super({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });
  }

  protected onDefineParameters(): void {
    this.flag = this.defineFlagParameter({
      parameterLongName: '--flag',
      description: 'The flag'
    });
  }
}

describe('Actionless CommandLineParser', () => {

  it('parses a flag', () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    return commandLineParser.execute(['--flag']).then(() => {
      expect(commandLineParser.selectedAction).toBeUndefined();
      expect(commandLineParser.flag.value).toBe(true);
    });
  });

  it('parses a flag and remainder', () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    commandLineParser.defineCommandLineRemainder({
      description: 'remainder description'
    });

    return commandLineParser.execute(['--flag', 'the', 'remaining', 'args']).then(() => {
      expect(commandLineParser.selectedAction).toBeUndefined();
      expect(commandLineParser.flag.value).toBe(true);
      expect(commandLineParser.remainder!.values).toEqual(['the', 'remaining', 'args']);
    });
  });

});
