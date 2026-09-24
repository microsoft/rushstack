import * as fs from 'node:fs';
import nodeModule from 'node:module';
import * as path from 'node:path';

interface IModuleWithParent {
  readonly filename: string;
  parent: unknown;
}

type ModuleConstructor = new (id: string, parent: NodeModule | undefined) => NodeModule;

const HEFT_PACKAGE_FOLDER: string = path.resolve(__dirname, '../..');
const PENDING_DEPRECATION_FLAG: string = '--pending-deprecation';

let _standInParentsByHostModuleFilename: ReadonlyMap<string, NodeModule> | undefined;
let _versionSelectorStandInModule: NodeModule | undefined;

function createStandInModule(
  pathInsideHeftPackage: string,
  parentModule: NodeModule | undefined
): NodeModule {
  const ModuleClass: ModuleConstructor = nodeModule as unknown as ModuleConstructor;
  return new ModuleClass(path.join(HEFT_PACKAGE_FOLDER, pathInsideHeftPackage), parentModule);
}

function getStandInParentsByHostModuleFilename(): ReadonlyMap<string, NodeModule> {
  if (!_standInParentsByHostModuleFilename) {
    const binModule: NodeModule = createStandInModule('bin/heft', undefined);
    const versionSelectorModule: NodeModule = createStandInModule(
      'lib-commonjs/startWithVersionSelector.js',
      binModule
    );
    _versionSelectorStandInModule = versionSelectorModule;
    const startModule: NodeModule = createStandInModule('lib-commonjs/start.js', versionSelectorModule);
    const commandLineParserModule: NodeModule = createStandInModule(
      'lib-commonjs/cli/HeftCommandLineParser.js',
      startModule
    );
    const leanCommandLineModule: NodeModule = createStandInModule(
      'lib-commonjs/cli/LeanHeftCommandLine.js',
      commandLineParserModule
    );
    const standInParentsByHostModuleName: ReadonlyArray<readonly [string, NodeModule]> = [
      ['HostEntry.js', startModule],
      ['WarmHostEntry.js', startModule],
      ['warmHostRun.js', startModule],
      ['HostCommandLine.js', commandLineParserModule],
      ['createPlanSeed.js', commandLineParserModule],
      ['tryExecutePlannedCommandAsync.js', leanCommandLineModule],
      ['plannedActions.js', leanCommandLineModule]
    ];
    _standInParentsByHostModuleFilename = new Map(
      standInParentsByHostModuleName.map(([hostModuleName, standInParent]) => [
        path.join(__dirname, hostModuleName),
        standInParent
      ])
    );
  }
  return _standInParentsByHostModuleFilename;
}

function isPendingDeprecationEnabled(): boolean {
  return (
    process.execArgv.includes(PENDING_DEPRECATION_FLAG) ||
    (process.env.NODE_OPTIONS ?? '').includes(PENDING_DEPRECATION_FLAG) ||
    process.env.NODE_PENDING_DEPRECATION === '1'
  );
}

export function makeRequireStacksMatchTheHeftCommandLine(): void {
  if (isPendingDeprecationEnabled()) {
    return;
  }
  const standInParentsByHostModuleFilename: ReadonlyMap<string, NodeModule> =
    getStandInParentsByHostModuleFilename();
  const startModuleFilename: string = path.join(HEFT_PACKAGE_FOLDER, 'lib-commonjs/start.js');
  for (const cachedModule of Object.values(require.cache)) {
    const moduleWithParent: IModuleWithParent | undefined = cachedModule as unknown as
      | IModuleWithParent
      | undefined;
    const parentFilename: string | undefined = (moduleWithParent?.parent as IModuleWithParent | undefined)
      ?.filename;
    const standInParent: NodeModule | undefined =
      parentFilename === undefined ? undefined : standInParentsByHostModuleFilename.get(parentFilename);
    if (
      moduleWithParent &&
      standInParent &&
      !standInParentsByHostModuleFilename.has(moduleWithParent.filename)
    ) {
      moduleWithParent.parent =
        moduleWithParent.filename === startModuleFilename ? _versionSelectorStandInModule : standInParent;
    }
  }
}

function tryGetRealPath(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return filePath;
  }
}

export function presentTheMainModuleAsTheHeftBin(heftBinPath: string): void {
  const mainModule: NodeModule | undefined = require.main;
  if (mainModule) {
    const heftBinRealPath: string = tryGetRealPath(heftBinPath);
    const heftBinFolder: string = path.dirname(heftBinRealPath);
    const moduleWithNodeModulePaths: { _nodeModulePaths(fromFolder: string): string[] } =
      nodeModule as unknown as { _nodeModulePaths(fromFolder: string): string[] };
    mainModule.filename = heftBinRealPath;
    (mainModule as { path: string }).path = heftBinFolder;
    mainModule.paths = moduleWithNodeModulePaths._nodeModulePaths(heftBinFolder);
  }
}
