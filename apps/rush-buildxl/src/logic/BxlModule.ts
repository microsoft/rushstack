// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { FileSystem } from '@microsoft/node-core-library';

import { BxlModuleConfig } from './BxlModuleConfig';

export interface IBxlModuleInfo {
  name: string;
  projectFolder: string;
  moduleFolder: string;
  buildCommand: string;
  dependencies: string[];
}

export class BxlModule {
  private _config: BxlModuleConfig;
  private _rushJsonPath: string;
  private _moduleInfo: IBxlModuleInfo;
  private _dependenciesLib: string;
  private _dependenciesDist: string;
  private _dependenciesNode: string;

  constructor(rushJsonPath: string, moduleInfo: IBxlModuleInfo) {
    this._moduleInfo = moduleInfo;
    this._rushJsonPath = rushJsonPath;
    this._config = new BxlModuleConfig(moduleInfo.name, moduleInfo.moduleFolder, this.moduleFilePath);
    this._dependenciesLib = moduleInfo.dependencies.map((m) => `d\`${path.resolve(m, 'lib')}\`,`).join('\n  ');
    this._dependenciesDist = moduleInfo.dependencies.map((m) => `d\`${path.resolve(m, 'dist')}\`,`).join('\n  ');
    this._dependenciesNode = moduleInfo.dependencies.map((m) => `d\`${path.resolve(m, 'node_modules')}\`,`).join('\n  ');
  }

  public get configFilePath(): string {
    return this._config.moduleConfigFilePath;
  }

  public get moduleFilePath(): string {
    return `${this._moduleInfo.moduleFolder}/${this._moduleInfo.name}.dsc`;
  }

  public async writeFile(): Promise<void> {
    const contents: string =
`import { Cmd, Transformer } from "Sdk.Transformers";

export const cmdTool: Transformer.ToolDefinition = {
  exe: f\`\${Environment.getPathValue("COMSPEC")}\`,
  dependsOnWindowsDirectories: true,
};

const packageRoot: Directory = d\`${this._moduleInfo.projectFolder}\`;
const rushJsonPath: File  = f\`${this._rushJsonPath}\`;

// TODO: consider moving to a shared SDK module to reduce duplication
const inputDirs: Directory[] = [
  d\`\${packageRoot.path}/node_modules\`,
  d\`\${packageRoot.path}/bin\`,
  d\`\${packageRoot.path}/config\`,
  d\`\${packageRoot.path}/src\`,
  d\`\${Context.getMount("CommonRushConfig").path}\`,
  d\`\${Context.getMount("Root").path}/common/temp/node_modules\`,
  ${this._normalizePathSeparator(this._dependenciesLib)}
  ${this._normalizePathSeparator(this._dependenciesDist)}
  ${this._normalizePathSeparator(this._dependenciesNode)}
];

const inputSourceSealedDirs: StaticDirectory[] = inputDirs.map((d) => {
  return Transformer.sealSourceDirectory(d, Transformer.SealSourceDirectoryOption.allDirectories);
});

// Globbing because lib is an output directory under package root
const packageMetadataFiles: File[] = glob(packageRoot, "*");

// Invoke the rushx build command for the package
const buildPip = Transformer.execute({
  tool: cmdTool,
  arguments: [
    Cmd.argument("/D"),
    Cmd.argument("/C"),
    Cmd.argument("${this._moduleInfo.buildCommand}"),
  ],
  dependencies: [
    rushJsonPath,
    ...packageMetadataFiles,
    ...inputSourceSealedDirs,
  ],
  environmentVariables: [
    { name: "PATH", value: "${this._getPathEnvironment}" }
  ],
  outputs: [
    d\`\${packageRoot.path}/lib\`,
    d\`\${packageRoot.path}/dist\`,
  ],
  // BuildXL ignores changes to these paths and variables. Unsafe options reduce determinism and can
  // cause distributed build failures if used too broadly.
  unsafe: {
    passThroughEnvironmentVariables : [
      "USERPROFILE",
    ],
    untrackedScopes: [
      d\`\${packageRoot.path}/temp\`,
      d\`\${Environment.getPathValue("USERPROFILE").path}/.rush\`,
      d\`\${Context.getMount("AppData").path}\`,
      d\`\${Context.getMount("LocalAppData").path}\`,
      d\`\${Context.getMount("ProgramFiles").path}\`,
      d\`\${Context.getMount("ProgramFilesX86").path}\`,
    ],
  },
  workingDirectory: packageRoot,
});

export const output = buildPip.getOutputFiles();
`;

    FileSystem.writeFile(this.moduleFilePath, contents, { ensureFolderExists: true });

    // Also write the module config file
    await this._config.writeFile();
  }

  private get _getPathEnvironment(): string {
    const projectBinFolder: string = path.resolve(this._moduleInfo.projectFolder, 'node_modules/.bin');
    const pathEnv: string = `${projectBinFolder};${process.env.PATH}`;
    return pathEnv.replace(/\\/g, '\\\\');
  }

  private _normalizePathSeparator(str: string): string {
    return str.replace(/\\/g, '/');
  }
}
