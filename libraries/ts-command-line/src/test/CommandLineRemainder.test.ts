// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineAction } from '../providers/CommandLineAction';
import type { CommandLineParser } from '../providers/CommandLineParser';
import { DynamicCommandLineParser } from '../providers/DynamicCommandLineParser';
import { DynamicCommandLineAction } from '../providers/DynamicCommandLineAction';
import { CommandLineRemainder } from '../parameters/CommandLineRemainder';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities';

function createParser(): DynamicCommandLineParser {
  const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
    toolFilename: 'example',
    toolDescription: 'An example project'
  });
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

  commandLineParser._registerDefinedParameters({ parentParameterNames: new Set() });

  return commandLineParser;
}

describe(CommandLineRemainder.name, () => {
  it('renders help text', () => {
    const commandLineParser: CommandLineParser = createParser();
    ensureHelpTextMatchesSnapshot(commandLineParser);
  });

  it('parses an action input with remainder', async () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('run');
    const args: string[] = ['run', '--title', 'The title', 'the', 'remaining', 'args'];

    await commandLineParser.executeAsync(args);

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

  it('parses an action input with remainder flagged options', async () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('run');
    const args: string[] = ['run', '--title', 'The title', '--', '--the', 'remaining', '--args'];

    await commandLineParser.executeAsync(args);

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
