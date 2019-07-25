// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@microsoft/node-core-library';

import { BxlModuleConfig } from './BxlModuleConfig';

export interface IBxlModuleInfo {
  name: string;
  packageRoot: string;
  moduleFolder: string;
}

export class BxlModule {
  private _name: string;
  private _moduleFolder: string;
  private _config: BxlModuleConfig;
  private _projectFolder: string;
  private _rushJsonPath: string;

  constructor(name: string, projectFolder: string, rushJsonPath: string, moduleFolder: string) {
    this._name = name;
    this._projectFolder = projectFolder;
    this._rushJsonPath = rushJsonPath;
    this._moduleFolder = moduleFolder;
    this._config = new BxlModuleConfig(name, moduleFolder, this.moduleFilePath);
  }

  public get configFilePath(): string {
    return this._config.moduleConfigFilePath;
  }

  public get moduleFilePath(): string {
    return `${this._moduleFolder}/${this._name}.dsc`;
  }

  public async writeFile(): Promise<void> {
    const contents: string =
`import { Cmd, Transformer } from "Sdk.Transformers";

export const cmdTool: Transformer.ToolDefinition = {
  exe: f\`\${Environment.getPathValue("COMSPEC")}\`,
  dependsOnWindowsDirectories: true,
};

const packageRoot: Directory = d\`${this._projectFolder}\`;
const packageJson: File = f\`${this._projectFolder}/package.json\`;
const rushJsonPath: File  = f\`${this._rushJsonPath}\`;
const outFile: File = f\`\${Context.getMount("Out").path}\\${this._name}.snt\`;

const commonRushConfig: StaticDirectory =
   Transformer.sealSourceDirectory(
      d\`\${Context.getMount("CommonRushConfig").path}\`,
      Transformer.SealSourceDirectoryOption.allDirectories);

// Invoke the rushx build command for the package
export const buildPip = Transformer.execute({
    tool: cmdTool,
    arguments: [
        Cmd.argument("/D"),
        Cmd.argument("/C"),
        Cmd.argument("rushx.cmd build"),
    ],
    dependencies: [
        packageJson,
        rushJsonPath,
        commonRushConfig,
    ],
    environmentVariables: [],
    outputs: [
        outFile
    ],
    // BuildXL ignores changes to these paths and variables. Unsafe options reduce determinism and can
    // cause distributed build failures if used too broadly.
    unsafe: {
        passThroughEnvironmentVariables : [
          "PATH",
          "USERPROFILE",
        ],
        untrackedScopes: [
          d\`\${Environment.getPathValue("USERPROFILE").path}/.rush\`,
          d\`\${Context.getMount("AppData").path}\`,
          d\`\${Context.getMount("ProgramFiles").path}\`,
          d\`\${Context.getMount("ProgramFilesX86").path}\`,
        ],
    },
    workingDirectory: packageRoot,
});
`;

    FileSystem.writeFile(this.moduleFilePath, contents, { ensureFolderExists: true });

    // Also write the module config file
    await this._config.writeFile();
  }
}
