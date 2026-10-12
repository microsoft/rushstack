// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { JsonFile } from '@rushstack/node-core-library';
import {
  ConsoleTerminalProvider,
  StringBufferTerminalProvider,
  Terminal,
  type ITerminal,
  type ITerminalProvider
} from '@rushstack/terminal';
import { CommandLineAction, CommandLineParser, type CommandLineParameter } from '@rushstack/ts-command-line';

import { RushConfiguration } from '../../../api/RushConfiguration';
import {
  CommandLineConfiguration,
  type IPhasedCommandConfig,
  type IParameterJson,
  type IPhase
} from '../../../api/CommandLineConfiguration';
import { Operation } from '../Operation';
import type { IOperationRunnerContext } from '../IOperationRunner';
import { OperationStatus } from '../OperationStatus';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { Utilities } from '../../../utilities/Utilities';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { formatCommand, ShellOperationRunnerPlugin } from '../ShellOperationRunnerPlugin';
import {
  type ICreateOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { defineCustomParameters } from '../../../cli/parsing/defineCustomParameters';
import { associateParametersByPhase } from '../../../cli/parsing/associateParametersByPhase';
import { getCommandExecution, setIncrementalExecutionGuard } from '../IncrementalExecutionState';
import { IS_WINDOWS } from '../../../utilities/executionUtilities';

interface ISerializedOperation {
  name: string;
  commandToRun: string;
}

function serializeOperation(operation: Operation): ISerializedOperation {
  return {
    name: operation.name,
    commandToRun: operation.runner!.getConfigHash()
  };
}

/**
 * Test implementation of CommandLineAction for testing parameter handling
 */
class TestCommandLineAction extends CommandLineAction {
  protected async onExecuteAsync(): Promise<void> {
    // No-op for testing
  }
}

/**
 * Test implementation of CommandLineParser for testing parameter handling
 */
class TestCommandLineParser extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'test-tool',
      toolDescription: 'Test tool for parameter parsing'
    });
  }
}

/**
 * Creates the operations of parameterIgnoringRepo's `build` command, for the given command line.
 */
async function createParameterIgnoringRepoOperationsAsync(argv: string[]): Promise<Set<Operation>> {
  const repoFolder: string = path.resolve(__dirname, '../../test/parameterIgnoringRepo');
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
    `${repoFolder}/rush.json`
  );
  const commandLineJson: ICommandLineJson = JsonFile.load(
    `${repoFolder}/common/config/rush/command-line.json`
  );
  const buildCommand: IPhasedCommandConfig = new CommandLineConfiguration(commandLineJson).commands.get(
    'build'
  )! as IPhasedCommandConfig;

  const projectConfigurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> =
    await RushProjectConfiguration.tryLoadForProjectsAsync(
      rushConfiguration.projects,
      new Terminal(new StringBufferTerminalProvider())
    );

  const parser: TestCommandLineParser = new TestCommandLineParser();
  const action: TestCommandLineAction = new TestCommandLineAction({
    actionName: 'build',
    summary: 'Test build action',
    documentation: 'Test'
  });
  parser.addAction(action);
  const customParametersMap: Map<IParameterJson, CommandLineParameter> = new Map();
  defineCustomParameters(action, buildCommand.associatedParameters, customParametersMap);
  await parser.executeWithoutErrorHandlingAsync(argv);

  const phasesMap: Map<string, IPhase> = new Map();
  for (const phase of buildCommand.phases) {
    phasesMap.set(phase.name, phase);
  }
  associateParametersByPhase(customParametersMap, phasesMap);

  const customParameters: Map<string, CommandLineParameter> = new Map();
  for (const [parameterJson, parameter] of customParametersMap) {
    customParameters.set(parameterJson.longName, parameter);
  }

  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new PhasedOperationPlugin().apply(hooks);
  new ShellOperationRunnerPlugin().apply(hooks);
  const context: Pick<
    ICreateOperationsContext,
    'phaseSelection' | 'projectSelection' | 'projectConfigurations' | 'rushConfiguration' | 'customParameters'
  > = {
    phaseSelection: buildCommand.phases,
    projectSelection: new Set(rushConfiguration.projects),
    projectConfigurations,
    rushConfiguration,
    customParameters
  };
  return await hooks.createOperationsAsync.promise(new Set(), context as unknown as ICreateOperationsContext);
}

describe(ShellOperationRunnerPlugin.name, () => {
  it('shellCommand "echo custom shellCommand" should be set to commandToRun', async () => {
    const rushJsonFile: string = path.resolve(__dirname, `../../test/customShellCommandinBulkRepo/rush.json`);
    const commandLineJsonFile: string = path.resolve(
      __dirname,
      `../../test/customShellCommandinBulkRepo/common/config/rush/command-line.json`
    );

    const rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    const commandLineConfiguration = new CommandLineConfiguration(commandLineJson);

    const echoCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'echo'
    )! as IPhasedCommandConfig;

    const fakeCreateOperationsContext: Pick<
      ICreateOperationsContext,
      'phaseSelection' | 'projectSelection' | 'projectConfigurations'
    > = {
      phaseSelection: echoCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectConfigurations: new Map()
    };

    const hooks: PhasedCommandHooks = new PhasedCommandHooks();

    // Generates the default operation graph
    new PhasedOperationPlugin().apply(hooks);
    // Applies the Shell Operation Runner to selected operations
    new ShellOperationRunnerPlugin().apply(hooks);

    const operations: Set<Operation> = await hooks.createOperationsAsync.promise(
      new Set(),
      fakeCreateOperationsContext as ICreateOperationsContext
    );
    // All projects
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('shellCommand priority should be higher than script name', async () => {
    const rushJsonFile: string = path.resolve(
      __dirname,
      `../../test/customShellCommandinBulkOverrideScriptsRepo/rush.json`
    );
    const commandLineJsonFile: string = path.resolve(
      __dirname,
      `../../test/customShellCommandinBulkOverrideScriptsRepo/common/config/rush/command-line.json`
    );

    const rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    const commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
    const echoCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'echo'
    )! as IPhasedCommandConfig;

    const fakeCreateOperationsContext: Pick<
      ICreateOperationsContext,
      'phaseSelection' | 'projectSelection' | 'projectConfigurations'
    > = {
      phaseSelection: echoCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectConfigurations: new Map()
    };

    const hooks: PhasedCommandHooks = new PhasedCommandHooks();

    // Generates the default operation graph
    new PhasedOperationPlugin().apply(hooks);
    // Applies the Shell Operation Runner to selected operations
    new ShellOperationRunnerPlugin().apply(hooks);

    const operations: Set<Operation> = await hooks.createOperationsAsync.promise(
      new Set(),
      fakeCreateOperationsContext as ICreateOperationsContext
    );
    // All projects
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('parameters should be filtered when parameterNamesToIgnore is specified', async () => {
    const rushJsonFile: string = path.resolve(__dirname, `../../test/parameterIgnoringRepo/rush.json`);
    const commandLineJsonFile: string = path.resolve(
      __dirname,
      `../../test/parameterIgnoringRepo/common/config/rush/command-line.json`
    );

    const rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    const commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    // Load project configurations
    const terminalProvider: ConsoleTerminalProvider = new ConsoleTerminalProvider();
    const terminal: Terminal = new Terminal(terminalProvider);

    const projectConfigurations = await RushProjectConfiguration.tryLoadForProjectsAsync(
      rushConfiguration.projects,
      terminal
    );

    // Create CommandLineParser and action to parse parameter values
    const parser: TestCommandLineParser = new TestCommandLineParser();
    const action: TestCommandLineAction = new TestCommandLineAction({
      actionName: 'build',
      summary: 'Test build action',
      documentation: 'Test'
    });
    parser.addAction(action);

    // Create CommandLineParameter instances from the parameter definitions
    const customParametersMap: Map<IParameterJson, CommandLineParameter> = new Map();
    defineCustomParameters(action, buildCommand.associatedParameters, customParametersMap);

    // Parse parameter values using the parser
    await parser.executeWithoutErrorHandlingAsync([
      'build',
      '--production',
      '--verbose',
      '--config',
      '/path/to/config.json',
      '--mode',
      'prod',
      '--tags',
      'tag1',
      '--tags',
      'tag2'
    ]);

    // Associate parameters with phases using the helper
    // Create a map of phase names to phases for the helper
    const phasesMap: Map<string, IPhase> = new Map();
    for (const phase of buildCommand.phases) {
      phasesMap.set(phase.name, phase);
    }
    associateParametersByPhase(customParametersMap, phasesMap);

    // Create customParameters map for ICreateOperationsContext (keyed by longName)
    const customParametersForContext: Map<string, CommandLineParameter> = new Map();
    for (const [param, cli] of customParametersMap) {
      customParametersForContext.set(param.longName, cli);
    }

    const fakeCreateOperationsContext: Pick<
      ICreateOperationsContext,
      | 'phaseSelection'
      | 'projectSelection'
      | 'projectConfigurations'
      | 'rushConfiguration'
      | 'customParameters'
    > = {
      phaseSelection: buildCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectConfigurations,
      rushConfiguration,
      customParameters: customParametersForContext
    };

    const hooks: PhasedCommandHooks = new PhasedCommandHooks();

    // Generates the default operation graph
    new PhasedOperationPlugin().apply(hooks);
    // Applies the Shell Operation Runner to selected operations
    new ShellOperationRunnerPlugin().apply(hooks);

    const operations: Set<Operation> = await hooks.createOperationsAsync.promise(
      new Set(),
      fakeCreateOperationsContext as unknown as ICreateOperationsContext
    );

    // Verify that project 'a' has the --production parameter filtered out
    const operationA = Array.from(operations).find((op) => op.name === 'a');
    expect(operationA).toBeDefined();
    const commandHashA = operationA!.runner!.getConfigHash();
    // Should not contain --production but should contain other parameters
    expect(commandHashA).not.toContain('--production');
    expect(commandHashA).toContain('--verbose');
    expect(commandHashA).toContain('--config');
    expect(commandHashA).toContain('--mode');
    expect(commandHashA).toContain('--tags');

    // Verify that project 'b' has --verbose, --config, --mode, and --tags filtered out
    const operationB = Array.from(operations).find((op) => op.name === 'b');
    expect(operationB).toBeDefined();
    const commandHashB = operationB!.runner!.getConfigHash();
    // Should contain --production but not the other parameters since they are filtered
    expect(commandHashB).toContain('--production');
    expect(commandHashB).not.toContain('--verbose');
    expect(commandHashB).not.toContain('--config');
    expect(commandHashB).not.toContain('--mode');
    expect(commandHashB).not.toContain('--tags');

    // All projects snapshot
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('I2: quotes the parameter values that the shell would parse', async () => {
    const operations: Set<Operation> = await createParameterIgnoringRepoOperationsAsync([
      'build',
      '--production',
      '--verbose',
      '--config',
      'cfg dir/a|b.json',
      '--mode',
      'prod',
      '--tags',
      '$HOME',
      '--tags',
      'x(y'
    ]);

    expect(Array.from(operations, serializeOperation)).toEqual([
      {
        name: 'a',
        commandToRun: IS_WINDOWS
          ? 'echo building a --verbose --config "cfg dir/a|b.json" --mode prod --tags $HOME --tags "x(y"'
          : "echo building a --verbose --config 'cfg dir/a|b.json' --mode prod --tags '$HOME' --tags 'x(y'"
      },
      {
        name: 'b',
        commandToRun: 'echo building b --production'
      }
    ]);
  });

  it.each([
    [false, ['node build.js', 'node build.js']],
    [true, ['node build.js', 'node build.js --incremental']]
  ])(
    'runs the :incremental script for a repeated operation only in watch mode (isWatch: %s)',
    async (isWatch: boolean, expectedCommands: string[]) => {
      const phase: IPhase = {
        name: '_phase:build',
        isSynthetic: false,
        missingScriptBehavior: 'error',
        allowWarningsOnSuccess: false,
        associatedParameters: new Set()
      } as unknown as IPhase;
      const project: RushConfigurationProject = {
        packageName: 'a',
        projectFolder: process.cwd(),
        packageJson: {
          scripts: {
            '_phase:build': 'node build.js',
            '_phase:build:incremental': 'node build.js --incremental'
          }
        },
        rushConfiguration: { commonTempFolder: process.cwd() }
      } as unknown as RushConfigurationProject;
      const operation: Operation = new Operation({ phase, project, logFilenameIdentifier: 'a' });
      const hooks: PhasedCommandHooks = new PhasedCommandHooks();
      new ShellOperationRunnerPlugin().apply(hooks);
      await hooks.createOperationsAsync.promise(new Set([operation]), {
        isIncrementalBuildAllowed: true,
        isWatch
      } as unknown as ICreateOperationsContext);

      const commands: string[] = [];
      const executeSpy = jest
        .spyOn(Utilities, 'executeLifecycleCommandAsync')
        .mockImplementation((command) => {
          commands.push(command.trim());
          const stdout: PassThrough = new PassThrough();
          const stderr: PassThrough = new PassThrough();
          const child: childProcess.ChildProcess = Object.assign(new EventEmitter(), {
            stdout,
            stderr,
            stdio: []
          }) as unknown as childProcess.ChildProcess;
          queueMicrotask(() => {
            stdout.end();
            stderr.end();
            child.emit('close', 0, null);
          });
          return child;
        });
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
      const context: IOperationRunnerContext = {
        environment: undefined,
        async runWithTerminalAsync<T>(
          callback: (
            terminal: ITerminal,
            operationTerminalProvider: ITerminalProvider,
            structuredChildOutputTerminalProvider: ITerminalProvider
          ) => Promise<T>
        ): Promise<T> {
          return await callback(new Terminal(terminalProvider), terminalProvider, terminalProvider);
        }
      } as unknown as IOperationRunnerContext;
      try {
        await expect(operation.runner!.executeAsync(context)).resolves.toBe(OperationStatus.Success);
        await expect(
          operation.runner!.executeAsync(context, { status: OperationStatus.Success })
        ).resolves.toBe(OperationStatus.Success);
      } finally {
        executeSpy.mockRestore();
      }
      expect(commands).toEqual(expectedCommands);
    }
  );

  describe('outside watch mode', () => {
    async function runTwiceAsync(options: {
      scripts: Record<string, string>;
      shellCommand?: string;
      guarded: boolean;
    }): Promise<{ commands: string[]; hasIncrementalCommand: boolean | undefined }> {
      const phase: IPhase = {
        name: '_phase:build',
        isSynthetic: false,
        missingScriptBehavior: 'error',
        allowWarningsOnSuccess: false,
        associatedParameters: new Set(),
        shellCommand: options.shellCommand
      } as unknown as IPhase;
      const project: RushConfigurationProject = {
        packageName: 'a',
        projectFolder: process.cwd(),
        packageJson: { scripts: options.scripts },
        rushConfiguration: { commonTempFolder: process.cwd() }
      } as unknown as RushConfigurationProject;
      const operation: Operation = new Operation({ phase, project, logFilenameIdentifier: 'a' });
      const hooks: PhasedCommandHooks = new PhasedCommandHooks();
      new ShellOperationRunnerPlugin().apply(hooks);
      await hooks.createOperationsAsync.promise(new Set([operation]), {
        isIncrementalBuildAllowed: true,
        isWatch: false
      } as unknown as ICreateOperationsContext);

      const commands: string[] = [];
      const executeSpy = jest
        .spyOn(Utilities, 'executeLifecycleCommandAsync')
        .mockImplementation((command) => {
          commands.push(command.trim());
          const stdout: PassThrough = new PassThrough();
          const stderr: PassThrough = new PassThrough();
          const child: childProcess.ChildProcess = Object.assign(new EventEmitter(), {
            stdout,
            stderr,
            stdio: []
          }) as unknown as childProcess.ChildProcess;
          queueMicrotask(() => {
            stdout.end();
            stderr.end();
            child.emit('close', 0, null);
          });
          return child;
        });
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
      const context: IOperationRunnerContext = {
        environment: undefined,
        async runWithTerminalAsync<T>(
          callback: (
            terminal: ITerminal,
            operationTerminalProvider: ITerminalProvider,
            structuredChildOutputTerminalProvider: ITerminalProvider
          ) => Promise<T>
        ): Promise<T> {
          return await callback(new Terminal(terminalProvider), terminalProvider, terminalProvider);
        }
      } as unknown as IOperationRunnerContext;
      if (options.guarded) {
        setIncrementalExecutionGuard(context, {
          getBlockReasonAsync: async () => undefined,
          verifyIncrementalResultAsync: async () => undefined
        });
      }
      try {
        await expect(operation.runner!.executeAsync(context)).resolves.toBe(OperationStatus.Success);
        await expect(
          operation.runner!.executeAsync(context, { status: OperationStatus.Success })
        ).resolves.toBe(OperationStatus.Success);
      } finally {
        executeSpy.mockRestore();
      }
      return { commands, hasIncrementalCommand: getCommandExecution(context)?.hasIncrementalCommand };
    }

    it('runs the :incremental script for a repeated operation when its guard allows it', async () => {
      const { commands, hasIncrementalCommand } = await runTwiceAsync({
        scripts: {
          '_phase:build': 'node build.js',
          '_phase:build:incremental': 'node build.js --incremental'
        },
        guarded: true
      });
      expect(commands).toEqual(['node build.js', 'node build.js --incremental']);
      expect(hasIncrementalCommand).toBe(true);
    });

    it('does not treat an :incremental script that equals the initial script as an incremental command', async () => {
      const { commands, hasIncrementalCommand } = await runTwiceAsync({
        scripts: {
          '_phase:build': 'node build.js',
          '_phase:build:incremental': 'node build.js'
        },
        guarded: true
      });
      expect(commands).toEqual(['node build.js', 'node build.js']);
      expect(hasIncrementalCommand).toBe(false);
    });

    it('does not use the :incremental script of an operation with a shellCommand', async () => {
      const { commands, hasIncrementalCommand } = await runTwiceAsync({
        scripts: {
          '_phase:build': 'node build.js',
          '_phase:build:incremental': 'node build.js --incremental'
        },
        shellCommand: 'node custom.js',
        guarded: true
      });
      expect(commands).toEqual(['node custom.js', 'node custom.js']);
      expect(hasIncrementalCommand).toBe(false);
    });
  });
});

describe(formatCommand.name, () => {
  const bValues: string[] = [
    '--verbose',
    '--config',
    '/path/to/config.json',
    '--mode',
    'prod',
    '--tags',
    'tag1',
    '--tags',
    'tag2'
  ];

  it('F1: quotes a value for sh', () => {
    expect(formatCommand('heft test', ['--test-path-pattern', 'bump|x'], [], false)).toEqual(
      "heft test --test-path-pattern 'bump|x'"
    );
  });

  it('F2: quotes a value for cmd.exe', () => {
    expect(formatCommand('heft test', ['--test-path-pattern', 'bump|x'], [], true)).toEqual(
      'heft test --test-path-pattern "bump|x"'
    );
  });

  it.each([false, true])(
    'F3: leaves values that need no quoting as they were (isWindows: %s)',
    (isWindows: boolean) => {
      expect(formatCommand('echo building a', bValues, [], isWindows)).toEqual(
        `echo building a ${bValues.join(' ')}`
      );
    }
  );

  it.each([false, true])(
    'F4: keeps the trailing space when there are no values (isWindows: %s)',
    (isWindows: boolean) => {
      expect(formatCommand('echo custom shellCommand', [], [], isWindows)).toEqual(
        'echo custom shellCommand '
      );
    }
  );

  it('F5: appends the preformatted arguments after the quoted values', () => {
    expect(
      formatCommand(
        'heft test',
        ['--p', 'a b'],
        ['--shard=1/3', '--shard-output-directory=.rush/operations/x/shards/1'],
        false
      )
    ).toEqual("heft test --p 'a b' --shard=1/3 --shard-output-directory=.rush/operations/x/shards/1");
  });

  it('F6: does not quote the preformatted arguments', () => {
    expect(
      formatCommand(
        'heft test',
        ['--p', 'x'],
        ['--shard-parent-folder=".rush/operations/x/shards/"', '--shard-count="3"'],
        false
      )
    ).toEqual('heft test --p x --shard-parent-folder=".rush/operations/x/shards/" --shard-count="3"');
  });

  it("F7: still converts the slashes of the command's first token on Windows", () => {
    expect(formatCommand('node_modules/.bin/heft test', ['--p', 'a b'], [], true)).toEqual(
      'node_modules\\.bin\\heft test --p "a b"'
    );
  });

  it.each([false, true])(
    'F8: returns an empty string for an empty command (isWindows: %s)',
    (isWindows: boolean) => {
      expect(formatCommand('', ['--p', 'x'], [], isWindows)).toEqual('');
    }
  );
});
