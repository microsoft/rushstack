import { DynamicCommandLineParser, DynamicCommandLineAction } from '..';
import { TabCompleteAction } from '../providers/TabCompletionAction';
import { ICommandLineStringDefinition } from '../parameters/CommandLineDefinition';

/**
 * Provides the parameter configuration for '--variant'.
 */
const VARIANT_PARAMETER: ICommandLineStringDefinition = {
  parameterLongName: '--variant',
  argumentName: 'VARIANT',
  description: 'Run command using a variant installation configuration',
  environmentVariable: 'RUSH_VARIANT'
};

async function arrayFromAsyncIteractorAsync(iterator: AsyncIterable<string>): Promise<string[]> {
  const ret: string[] = [];

  for await (const val of iterator) {
    ret.push(val);
  }

  return ret;
}

function getCommandLineParser(): DynamicCommandLineParser {
  const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
    toolFilename: 'rush',
    toolDescription: 'Rush: a scalable monorepo manager for the web',
    enableTabCompletionAction: true
  });

  const addAction: DynamicCommandLineAction = new DynamicCommandLineAction({
    actionName: 'add',
    summary: 'Adds a dependency to the package.json and runs rush upgrade.',
    documentation: 'Adds a dependency to the package.json and runs rush upgrade.'
  });
  commandLineParser.addAction(addAction);
  addAction.defineStringParameter({
    parameterLongName: '--package',
    parameterShortName: '-p',
    required: true,
    argumentName: 'PACKAGE',
    description:
      '(Required) The name of the package which should be added as a dependency.' +
      ' A SemVer version specifier can be appended after an "@" sign.  WARNING: Symbol characters' +
      " are usually interpreted by your shell, so it's recommended to use quotes." +
      ' For example, write "rush add --package "example@^1.2.3"" instead of "rush add --package example@^1.2.3".'
  });
  addAction.defineFlagParameter({
    parameterLongName: '--exact',
    description:
      'If specified, the SemVer specifier added to the' +
      ' package.json will be an exact version (e.g. without tilde or caret).'
  });
  addAction.defineFlagParameter({
    parameterLongName: '--caret',
    description:
      'If specified, the SemVer specifier added to the' +
      ' package.json will be a prepended with a "caret" specifier ("^").'
  });
  addAction.defineFlagParameter({
    parameterLongName: '--dev',
    description:
      'If specified, the package will be added to the "devDependencies" section of the package.json'
  });
  addAction.defineFlagParameter({
    parameterLongName: '--make-consistent',
    parameterShortName: '-m',
    description:
      'If specified, other packages with this dependency will have their package.json' +
      ' files updated to use the same version of the dependency.'
  });
  addAction.defineFlagParameter({
    parameterLongName: '--skip-update',
    parameterShortName: '-s',
    description:
      'If specified, the "rush update" command will not be run after updating the package.json files.'
  });
  addAction.defineFlagParameter({
    parameterLongName: '--all',
    description: 'If specified, the dependency will be added to all projects.'
  });

  const buildAction: DynamicCommandLineAction = new DynamicCommandLineAction({
    actionName: 'build',
    summary: "Build all projects that haven't been built.",
    documentation: "Build all projects that haven't been built."
  });
  commandLineParser.addAction(buildAction);
  buildAction.defineStringParameter({
    parameterLongName: '--parallelism',
    parameterShortName: '-p',
    argumentName: 'COUNT',
    description: 'Specifies the maximum number of concurrent processes to launch during a build.'
  });
  buildAction.defineStringListParameter({
    parameterLongName: '--to',
    parameterShortName: '-t',
    argumentName: 'PROJECT1',
    description: 'Run command in the specified project and all of its dependencies.',
    completions: async (): Promise<string[]> => {
      return ['abc', 'def', 'hij'];
    }
  });
  buildAction.defineStringListParameter({
    parameterLongName: '--from',
    parameterShortName: '-f',
    argumentName: 'PROJECT2',
    description:
      'Run command in the specified project and all projects that directly or indirectly depend on the ' +
      'specified project.'
  });

  const changeAction: DynamicCommandLineAction = new DynamicCommandLineAction({
    actionName: 'change',
    summary:
      'Records changes made to projects, indicating how the package version number should be bumped ' +
      'for the next publish.',
    documentation: 'Asks a series of questions and then generates a <branchname>-<timestamp>.json file.'
  });
  commandLineParser.addAction(changeAction);
  changeAction.defineFlagParameter({
    parameterLongName: '--verify',
    parameterShortName: '-v',
    description: 'Verify the change file has been generated and that it is a valid JSON file'
  });
  changeAction.defineFlagParameter({
    parameterLongName: '--no-fetch',
    description: 'Skips fetching the baseline branch before running "git diff" to detect changes.'
  });
  changeAction.defineStringParameter({
    parameterLongName: '--target-branch',
    parameterShortName: '-b',
    argumentName: 'BRANCH',
    description: 'If this parameter is specified, compare the checked out branch with the specified branch.'
  });
  changeAction.defineFlagParameter({
    parameterLongName: '--overwrite',
    description: `If a changefile already exists, overwrite without prompting.`
  });
  changeAction.defineStringParameter({
    parameterLongName: '--email',
    argumentName: 'EMAIL',
    description:
      'The email address to use in changefiles. If this parameter is not provided, the email address ' +
      'will be detected or prompted for in interactive mode.'
  });
  changeAction.defineFlagParameter({
    parameterLongName: '--bulk',
    description:
      'If this flag is specified, apply the same change message and bump type to all changed projects. '
  });
  changeAction.defineStringParameter({
    parameterLongName: '--message',
    argumentName: 'MESSAGE',
    description: `The message to apply to all changed projects.`
  });
  changeAction.defineChoiceParameter({
    parameterLongName: '--bump-type',
    alternatives: ['major', 'minor', 'patch', 'none'],
    description: `The bump type to apply to all changed projects.`
  });

  const installAction: DynamicCommandLineAction = new DynamicCommandLineAction({
    actionName: 'install',
    summary: 'Install package dependencies for all projects in the repo according to the shrinkwrap file.',
    documentation:
      'Longer description: Install package dependencies for all projects in the repo according ' +
      'to the shrinkwrap file.'
  });
  commandLineParser.addAction(installAction);
  installAction.defineFlagParameter({
    parameterLongName: '--purge',
    parameterShortName: '-p',
    description: 'Perform "rush purge" before starting the installation'
  });
  installAction.defineFlagParameter({
    parameterLongName: '--bypass-policy',
    description: 'Overrides enforcement of the "gitPolicy" rules from rush.json (use honorably!)'
  });
  installAction.defineFlagParameter({
    parameterLongName: '--no-link',
    description: 'If "--no-link" is specified, then project symlinks will NOT be created'
  });
  installAction.defineIntegerParameter({
    parameterLongName: '--network-concurrency',
    argumentName: 'COUNT',
    description: 'If specified, limits the maximum number of concurrent network requests.'
  });
  installAction.defineFlagParameter({
    parameterLongName: '--debug-package-manager',
    description: 'Activates verbose logging for the package manager.'
  });
  installAction.defineIntegerParameter({
    parameterLongName: '--max-install-attempts',
    argumentName: 'NUMBER',
    description: `Overrides the default maximum number of install attempts.`,
    defaultValue: 3
  });
  installAction.defineStringParameter(VARIANT_PARAMETER);

  commandLineParser.defineFlagParameter({
    parameterLongName: '--debug',
    parameterShortName: '-d',
    description: 'Show the full call stack if an error occurs while executing the tool'
  });

  return commandLineParser;
}

describe('Gets TabCompletion(s)', () => {
  it(`gets completion(s) for rush <tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush ';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['add', 'build', 'change', 'install', '--debug', '-d'];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush a<tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush a';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['add'];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush -d a<tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush -d a';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['add'];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush build <tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush build ';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    expect(actual.indexOf('-t') !== -1).toBe(true);
    expect(actual.indexOf('--to') !== -1).toBe(true);
    expect(actual.indexOf('-f') !== -1).toBe(true);
    expect(actual.indexOf('--from') !== -1).toBe(true);
  });

  it(`gets completion(s) for rush build -<tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush build -';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    expect(actual.indexOf('-t') !== -1).toBe(true);
    expect(actual.indexOf('--to') !== -1).toBe(true);
    expect(actual.indexOf('-f') !== -1).toBe(true);
    expect(actual.indexOf('--from') !== -1).toBe(true);
  });

  it(`gets completion(s) for rush build -t <tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush build -t ';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['abc', 'def', 'hij'];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush build -t a<tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush build -t a';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['abc'];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush --debug build -t a<tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush --debug build -t a';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['abc'];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush change --bump-type <tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush change --bump-type ';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['major', 'minor', 'patch', 'none'];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush change --bulk <tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush change --bulk ';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    expect(actual.indexOf('--bulk') !== -1).toBe(true);
    expect(actual.indexOf('--message') !== -1).toBe(true);
    expect(actual.indexOf('--bump-type') !== -1).toBe(true);
    expect(actual.indexOf('--verify') !== -1).toBe(true);
  });

  it(`gets completion(s) for rush change --bump-type m<tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush change --bump-type m';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['major', 'minor'];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush change --message <tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush change --message ';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = [];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush change --message "my change log message" --bump-type <tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush change --message "my change log message" --bump-type ';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['major', 'minor', 'patch', 'none'];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it(`gets completion(s) for rush change --message "my change log message" --bump-type m<tab>`, async () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush change --message "my change log message" --bump-type m';
    const actual: string[] = await arrayFromAsyncIteractorAsync(
      tc.getCompletions(commandLine.trim(), commandLine.length)
    );

    const expected: string[] = ['major', 'minor'];

    expect(actual.sort()).toEqual(expected.sort());
  });
});

describe(`Tokenize command line`, () => {
  it(`tokenizes "rush change -"`, () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush change -';
    const actual: string[] = tc.tokenizeCommandLine(commandLine.trim());

    const expected: string[] = ['rush', 'change', '-'];

    expect(actual.sort()).toEqual(expected.sort());
  });
  it(`tokenizes 'rush change -m "my change log"'`, () => {
    const commandLineParser: DynamicCommandLineParser = getCommandLineParser();
    const tc: TabCompleteAction = new TabCompleteAction(
      commandLineParser.actions,
      commandLineParser.parameters
    );

    const commandLine: string = 'rush change -m "my change log"';
    const actual: string[] = tc.tokenizeCommandLine(commandLine.trim());

    const expected: string[] = ['rush', 'change', '-m', 'my change log'];

    expect(actual.sort()).toEqual(expected.sort());
  });
});
