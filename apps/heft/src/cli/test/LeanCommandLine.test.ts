// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Differential tests: the lean command line (LeanParameterProvider + the argparse HelpFormatter port) must behave
// exactly like ts-command-line (which uses argparse) whenever it doesn't fall back to it.

import {
  AliasCommandLineAction,
  CommandLineAction,
  CommandLineParser,
  type CommandLineParameter,
  type CommandLineParameterProvider,
  ScopedCommandLineAction
} from '@rushstack/ts-command-line';
import { Colorize } from '@rushstack/terminal';

import { LeanParameterProvider, type ILeanRegistration, type LeanParseResult } from '../LeanParameterProvider';
import { formatHelp, formatUsage } from '../HelpFormatter';
import { getRootHelpParser } from '../LeanHeftCommandLine';
import {
  DEBUG_PARAMETER_DESCRIPTION,
  HEFT_TOOL_DESCRIPTION,
  HEFT_TOOL_FILENAME,
  SCOPED_ACTION_REMAINDER_DESCRIPTION,
  UNMANAGED_PARAMETER_DESCRIPTION
} from '../CliConstants';

const ROOT_PARAMETER_NAMES: string[] = ['--debug', '--unmanaged'];
const RUN_DOCUMENTATION: string = 'Run a provided selection of Heft phases.';

interface IDefinition {
  kind: 'flag' | 'string' | 'stringList' | 'integer' | 'integerList' | 'choice' | 'choiceList';
  parameterLongName: string;
  parameterShortName?: string;
  parameterScope?: string;
  description: string;
  argumentName?: string;
  alternatives?: string[];
  defaultValue?: string | number;
  required?: boolean;
  environmentVariable?: string;
  undocumentedSynonyms?: string[];
}

// A small deterministic PRNG (Park-Miller), so that failures are reproducible
function createRandom(seed: number): (n: number) => number {
  let state: number = seed;
  return (n: number) => {
    state = (state * 16807) % 2147483647;
    return state % n;
  };
}

function defineParameter(provider: CommandLineParameterProvider, definition: IDefinition): CommandLineParameter {
  const { kind, ...rest } = definition;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = rest;
  switch (kind) {
    case 'flag':
      return provider.defineFlagParameter(options);
    case 'string':
      return provider.defineStringParameter(options);
    case 'stringList':
      return provider.defineStringListParameter(options);
    case 'integer':
      return provider.defineIntegerParameter(options);
    case 'integerList':
      return provider.defineIntegerListParameter(options);
    case 'choice':
      return provider.defineChoiceParameter(options);
    case 'choiceList':
      return provider.defineChoiceListParameter(options);
  }
}

const BUILT_IN_DEFINITIONS: IDefinition[] = [
  {
    kind: 'flag',
    parameterLongName: '--verbose',
    parameterShortName: '-v',
    description: 'If specified, log information useful for debugging.'
  },
  { kind: 'flag', parameterLongName: '--production', description: 'If specified, run Heft in production mode.' },
  {
    kind: 'stringList',
    parameterLongName: '--locales',
    argumentName: 'LOCALE',
    description: 'Use the specified locale for this run, if applicable.'
  },
  { kind: 'flag', parameterLongName: '--clean', description: 'If specified, clean the outputs.' }
];

function getPluginDefinitions(scope: string): IDefinition[] {
  return [
    { kind: 'flag', parameterLongName: '--fix', parameterScope: scope, description: 'Fix.' },
    { kind: 'integer', parameterLongName: '--count', argumentName: 'N', parameterScope: scope, description: 'n' },
    {
      kind: 'integerList',
      parameterLongName: '--nums',
      argumentName: 'N',
      parameterScope: scope,
      description: 'n'
    },
    { kind: 'string', parameterLongName: '--name', argumentName: 'TEXT', parameterScope: scope, description: 's' },
    {
      kind: 'choice',
      parameterLongName: '--color',
      alternatives: ['red', 'blue'],
      parameterScope: scope,
      description: 'c'
    },
    {
      kind: 'choiceList',
      parameterLongName: '--mons',
      alternatives: ['a', 'b', 'c'],
      parameterScope: scope,
      description: 'm'
    }
  ];
}

const DEFINITION_SETS: IDefinition[][] = [
  BUILT_IN_DEFINITIONS,
  [...BUILT_IN_DEFINITIONS, ...getPluginDefinitions('lint')],
  [
    ...BUILT_IN_DEFINITIONS,
    {
      kind: 'string',
      parameterLongName: '--req',
      argumentName: 'R',
      parameterScope: 'p',
      description: 'r',
      required: true
    }
  ],
  [
    ...BUILT_IN_DEFINITIONS,
    {
      kind: 'string',
      parameterLongName: '--name',
      argumentName: 'T',
      parameterScope: 'x',
      description: 's',
      defaultValue: 'd'
    },
    {
      kind: 'integer',
      parameterLongName: '--count',
      argumentName: 'N',
      parameterScope: 'x',
      description: 'n',
      defaultValue: 42
    },
    {
      kind: 'flag',
      parameterLongName: '--eflag',
      parameterScope: 'x',
      description: 'e',
      environmentVariable: 'HEFT_TEST_EFLAG'
    },
    {
      kind: 'string',
      parameterLongName: '--estr',
      argumentName: 'S',
      parameterScope: 'x',
      description: 'e',
      environmentVariable: 'HEFT_TEST_ESTR'
    }
  ],
  [...BUILT_IN_DEFINITIONS, ...getPluginDefinitions('one'), ...getPluginDefinitions('two')],
  [
    ...BUILT_IN_DEFINITIONS,
    { kind: 'flag', parameterLongName: '--vvv', parameterShortName: '-v', parameterScope: 'x', description: 'v' }
  ],
  [...BUILT_IN_DEFINITIONS, { kind: 'flag', parameterLongName: '--clean', parameterScope: 'x', description: 'c' }],
  [...BUILT_IN_DEFINITIONS, { kind: 'flag', parameterLongName: '--debug', parameterScope: 'x', description: 'd' }],
  [
    ...BUILT_IN_DEFINITIONS,
    { kind: 'flag', parameterLongName: '--hhh', parameterShortName: '-h', parameterScope: 'x', description: 'h' }
  ],
  [
    ...BUILT_IN_DEFINITIONS,
    {
      kind: 'string',
      parameterLongName: '--syn',
      argumentName: 'S',
      parameterScope: 'x',
      description: 's',
      undocumentedSynonyms: ['--old-syn']
    }
  ]
];

class TestAction extends CommandLineAction {
  public executed: boolean = false;
  public constructor(actionName: string, documentation: string, definitions: IDefinition[]) {
    super({ actionName, summary: documentation, documentation });
    for (const definition of definitions) {
      defineParameter(this, definition);
    }
  }
  protected override async onExecuteAsync(): Promise<void> {
    this.executed = true;
  }
}

class TestScopedAction extends ScopedCommandLineAction {
  readonly #definitions: IDefinition[];
  public constructor(definitions: IDefinition[]) {
    super({ actionName: 'run', summary: RUN_DOCUMENTATION, documentation: RUN_DOCUMENTATION });
    this.#definitions = definitions;
    defineScopingParameters(this);
  }
  protected override onDefineScopedParameters(provider: CommandLineParameterProvider): void {
    for (const definition of this.#definitions) {
      defineParameter(provider, definition);
    }
  }
  protected override async onExecuteAsync(): Promise<void> {
    // Nothing to do
  }
}

function defineScopingParameters(provider: CommandLineParameterProvider): void {
  for (const parameterLongName of ['--to', '--to-except', '--only']) {
    provider.defineStringListParameter({
      parameterLongName,
      argumentName: 'PHASE',
      description: `The phase ${parameterLongName}.`,
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    });
  }
}

class TestParser extends CommandLineParser {
  public constructor() {
    super({ toolFilename: HEFT_TOOL_FILENAME, toolDescription: HEFT_TOOL_DESCRIPTION });
    this.defineFlagParameter({ parameterLongName: '--debug', description: DEBUG_PARAMETER_DESCRIPTION });
    this.defineFlagParameter({ parameterLongName: '--unmanaged', description: UNMANAGED_PARAMETER_DESCRIPTION });
  }
}

interface IReferenceResult {
  output: string;
  error?: string;
}

async function runReferenceAsync(parser: CommandLineParser, args: string[]): Promise<IReferenceResult> {
  let output: string = '';
  const stdoutWriteSpy: jest.SpyInstance = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      output += chunk;
      return true;
    });
  const consoleLogSpy: jest.SpyInstance = jest.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
    output += parts.join(' ') + '\n';
  });
  try {
    await parser.executeWithoutErrorHandlingAsync(args);
    return { output };
  } catch (e) {
    return { output, error: (e as Error).message };
  } finally {
    stdoutWriteSpy.mockRestore();
    consoleLogSpy.mockRestore();
  }
}

function getValues(parameters: ReadonlyArray<CommandLineParameter>): unknown[] {
  return parameters.map((parameter: CommandLineParameter) => [
    parameter.scopedLongName || parameter.longName,
    'values' in parameter ? parameter.values : parameter.value
  ]);
}

const EXTRA_ARGS: string[] = [
  'x',
  'red',
  'blue',
  'a',
  'c',
  '5',
  '007',
  '-5',
  '1.5',
  '',
  'hello world',
  '--',
  '-h',
  '--help',
  '--debug',
  '--bogus',
  '--verb',
  '-vh',
  '--locales=en'
];

function generateArgs(random: (n: number) => number, definitions: IDefinition[]): string[] {
  const optionStrings: string[] = [];
  for (const definition of definitions) {
    optionStrings.push(definition.parameterLongName);
    if (definition.parameterShortName) {
      optionStrings.push(definition.parameterShortName);
    }
    if (definition.parameterScope) {
      optionStrings.push(`--${definition.parameterScope}:${definition.parameterLongName.slice(2)}`);
    }
    optionStrings.push(...(definition.undocumentedSynonyms || []));
  }
  const args: string[] = [];
  const count: number = random(7);
  for (let i: number = 0; i < count; i++) {
    const pool: string[] = random(3) === 0 ? EXTRA_ARGS : optionStrings;
    args.push(pool[random(pool.length)]);
  }
  return args;
}

function createLeanProvider(definitions: IDefinition[]): [LeanParameterProvider, CommandLineParameter[]] {
  const provider: LeanParameterProvider = new LeanParameterProvider();
  const parameters: CommandLineParameter[] = definitions.map((d: IDefinition) =>
    defineParameter(provider.asCommandLineParameterProvider(), d)
  );
  return [provider, parameters];
}

function setColumns(columns: string | undefined): void {
  if (columns === undefined) {
    delete process.env.COLUMNS;
  } else {
    process.env.COLUMNS = columns;
  }
}

describe('LeanParameterProvider', () => {
  const originalEnvironment: NodeJS.ProcessEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it('parses exactly like ts-command-line whenever it does not fall back', async () => {
    const random: (n: number) => number = createRandom(1);
    let accepted: number = 0;
    for (let i: number = 0; i < 600; i++) {
      const definitions: IDefinition[] = DEFINITION_SETS[random(DEFINITION_SETS.length)];
      const args: string[] = generateArgs(random, definitions);
      process.env.HEFT_TEST_EFLAG = ['1', '0', 'x', ''][random(4)];
      process.env.HEFT_TEST_ESTR = ['env', ''][random(2)];

      const [provider, leanParameters] = createLeanProvider(definitions);
      const registration: ILeanRegistration | undefined = provider.tryGetRegistration(ROOT_PARAMETER_NAMES);

      const parser: TestParser = new TestParser();
      const action: TestAction = new TestAction('build', 'Build.', definitions);
      parser.addAction(action);
      const referenceResult: IReferenceResult = await runReferenceAsync(parser, ['build', ...args]);

      if (!registration) {
        // Falling back to ts-command-line is always correct
        continue;
      }

      const leanResult: LeanParseResult = provider.parseArguments(registration, args, false);
      if (leanResult.kind === 'help') {
        expect(referenceResult.error).toBeUndefined();
        expect(action.executed).toBe(false);
        expect(referenceResult.output).toContain('usage: heft build');
      } else if (leanResult.kind === 'ok' && provider.tryApplyValues(leanResult.data)) {
        accepted++;
        expect(referenceResult.error).toBeUndefined();
        expect(action.executed).toBe(true);
        expect(getValues(leanParameters)).toEqual(getValues(action.parameters));
        expect(provider.getParameterStringMap()).toEqual(action.getParameterStringMap());
      }
    }
    expect(accepted).toBeGreaterThan(50);
  });

  it('falls back when ts-command-line would fail to register the parameters', async () => {
    for (const definitions of DEFINITION_SETS) {
      const [provider] = createLeanProvider(definitions);
      const registration: ILeanRegistration | undefined = provider.tryGetRegistration(ROOT_PARAMETER_NAMES);

      const parser: TestParser = new TestParser();
      parser.addAction(new TestAction('build', 'Build.', definitions));
      const referenceResult: IReferenceResult = await runReferenceAsync(parser, ['build', '--help']);
      if (referenceResult.error !== undefined) {
        expect(registration).toBeUndefined();
      }
    }
  });
});

describe('HelpFormatter', () => {
  const originalColumns: string | undefined = process.env.COLUMNS;
  afterEach(() => {
    setColumns(originalColumns);
  });

  const DOCUMENTATION: string[] = [
    'Runs to the build phase, including all transitive dependencies.',
    'A supercalifragilisticexpialidociouswordwithoutanydelimiterswhatsoever that is long.',
    'Examine the package.json dependencies; 100% of "quoted" text, tabs\tand\nnewlines | pipes!'
  ];

  for (const columns of [undefined, '20', '40', '80', '120']) {
    it(`renders action help like argparse (COLUMNS=${columns})`, async () => {
      setColumns(columns);
      for (const definitions of DEFINITION_SETS) {
        for (const documentation of DOCUMENTATION) {
          const [provider] = createLeanProvider(definitions);
          const registration: ILeanRegistration | undefined =
            provider.tryGetRegistration(ROOT_PARAMETER_NAMES);
          if (!registration) {
            continue;
          }
          const parser: TestParser = new TestParser();
          parser.addAction(new TestAction('build', documentation, definitions));
          const referenceResult: IReferenceResult = await runReferenceAsync(parser, ['build', '--help']);
          expect(formatHelp(provider.getHelpParser(registration, 'heft build', documentation, undefined))).toEqual(
            referenceResult.output
          );
        }
      }
    });

    it(`renders scoped and unscoped run help like argparse (COLUMNS=${columns})`, async () => {
      setColumns(columns);
      for (const definitions of DEFINITION_SETS) {
        const unscopedProvider: LeanParameterProvider = new LeanParameterProvider();
        unscopedProvider.defineCommandLineRemainder({ description: SCOPED_ACTION_REMAINDER_DESCRIPTION });
        defineScopingParameters(unscopedProvider.asCommandLineParameterProvider());
        const unscopedRegistration: ILeanRegistration = unscopedProvider.tryGetRegistration(ROOT_PARAMETER_NAMES)!;

        const unscopedReference: IReferenceResult = await runReferenceAsync(
          createRunParser(definitions),
          ['run', '--help']
        );
        expect(
          formatHelp(unscopedProvider.getHelpParser(unscopedRegistration, 'heft run', RUN_DOCUMENTATION, undefined))
        ).toEqual(unscopedReference.output);

        const [scopedProvider] = createLeanProvider(definitions);
        const scopedRegistration: ILeanRegistration | undefined = scopedProvider.tryGetRegistration([
          ...ROOT_PARAMETER_NAMES,
          ...unscopedRegistration.registeredNames
        ]);
        if (!scopedRegistration) {
          continue;
        }
        const scopedReference: IReferenceResult = await runReferenceAsync(createRunParser(definitions), [
          'run',
          '--only',
          'build',
          '--',
          '--help'
        ]);
        expect(
          formatHelp(
            scopedProvider.getHelpParser(
              scopedRegistration,
              'heft run --only build --',
              RUN_DOCUMENTATION,
              Colorize.bold('For more information on available unscoped parameters, use "heft run --help"')
            )
          )
        ).toEqual(scopedReference.output);
      }
    });

    it(`renders the root help and usage like argparse (COLUMNS=${columns})`, async () => {
      setColumns(columns);
      const parser: TestParser = new TestParser();
      const summaries: [string, string][] = [];
      const actions: TestAction[] = [];
      for (const [actionName, documentation] of [
        ['clean', 'Clean the project, removing temporary task folders and specified clean paths.'],
        ['run', RUN_DOCUMENTATION],
        ['build', DOCUMENTATION[0]],
        ['trust-dev-cert-watch', DOCUMENTATION[2]]
      ]) {
        const action: TestAction = new TestAction(actionName, documentation, []);
        actions.push(action);
        parser.addAction(action);
        summaries.push([actionName, action.summary]);
      }
      const alias: AliasCommandLineAction = new AliasCommandLineAction({
        toolFilename: HEFT_TOOL_FILENAME,
        aliasName: 'start',
        targetAction: actions[2],
        defaultParameters: ['--serve']
      });
      parser.addAction(alias);
      summaries.push(['start', alias.summary]);

      const helpReference: IReferenceResult = await runReferenceAsync(parser, ['--help']);
      expect(formatHelp(getRootHelpParser(summaries))).toEqual(helpReference.output);

      const usageParser: TestParser = new TestParser();
      usageParser.addAction(new TestAction('build', 'Build.', []));
      const usageReference: IReferenceResult = await runReferenceAsync(usageParser, ['--version']);
      expect(usageReference.error).toMatch(/too few arguments/);
      expect(formatUsage(getRootHelpParser([['build', 'Build.']]))).toEqual(usageReference.output);
    });
  }
});

function createRunParser(definitions: IDefinition[]): TestParser {
  const parser: TestParser = new TestParser();
  parser.addAction(new TestScopedAction(definitions));
  return parser;
}
