// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import { CommandLineAction } from '../CommandLineAction';
import { CommandLineParser } from '../CommandLineParser';
import { DynamicCommandLineParser } from '../DynamicCommandLineParser';
import { DynamicCommandLineAction } from '../DynamicCommandLineAction';

function createParser(): DynamicCommandLineParser {
  const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser(
    {
      toolFilename: 'example',
      toolDescription: 'An example project'
    }
  );
  commandLineParser.defineFlagParameter({
    parameterLongName: '--verbose',
    description: 'A flag that affects all actions'
  });

  const action: DynamicCommandLineAction = new DynamicCommandLineAction({
    actionName: 'run',
    summary: 'does the job',
    documentation: 'a longer description'
  });
  commandLineParser.addAction(action);

  action.defineStringParameter({
    parameterLongName: '--title',
    description: 'A string',
    argumentName: 'TEXT'
  });

  // Although this is defined BEFORE the parameter, but it should still capture the end
  action.defineCommandLineRemainder({
    description: 'The action remainder'
  });

  return commandLineParser;
}

describe('CommandLineRemainder', () => {
  it('prints the global help', () => {
    const commandLineParser: CommandLineParser = createParser();
    const helpText: string = colors.stripColors(commandLineParser.renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it('prints the action help', () => {
    const commandLineParser: CommandLineParser = createParser();
    const helpText: string = colors.stripColors(commandLineParser.getAction('run').renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it('parses an action input with remainder', () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('run');
    const args: string[] = [ 'run', '--title', 'The title', 'the', 'remaining', 'args'];

    return commandLineParser.execute(args).then(() => {
      expect(commandLineParser.selectedAction).toBe(action);

      const copiedArgs: string[] = [];
      for (const parameter of action.parameters) {
        copiedArgs.push(`### ${parameter.longName} output: ###`);
        parameter.appendToArgList(copiedArgs);
      }

      copiedArgs.push(`### remainder output: ###`);
      action.remainder!.appendToArgList(copiedArgs);

      expect(copiedArgs).toMatchSnapshot();
    });
  });

});
