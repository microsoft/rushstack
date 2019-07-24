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
  private _rushJson: string;

  constructor(name: string, projectFolder: string, rushJson: string, moduleFolder: string) {
    this._name = name;
    this._projectFolder = projectFolder;
    this._rushJson = rushJson;
    this._moduleFolder = moduleFolder;
    this._config = new BxlModuleConfig(name, moduleFolder, this.moduleFilePath);
  }

  public get configFilePath(): string {
    return this._config.moduleConfigFilePath;
  }

  public get moduleFilePath(): string {
    return `${this._moduleFolder}/${this._name}.dsc`;
  }

  public writeFile(): Promise<void> {
    const contents: string =
`import { Cmd, Transformer } from "Sdk.Transformers";

export const cmdTool: Transformer.ToolDefinition = {
  exe: f\`\${Environment.getPathValue("COMSPEC")}\`,
  dependsOnWindowsDirectories: true,
};

const packageRoot = d\`${this._projectFolder}\`;
const packageJson = f\`${this._projectFolder}/package.json\`;
const rushJson = f\`${this._rushJson}\`;
const outFile = f\`\${Context.getMount("Out").path}\\${this._name}.snt\`;

export const buildPip = Transformer.execute({
    tool: cmdTool,
    arguments: [
        Cmd.argument("/D"),
        Cmd.argument("/C"),
        Cmd.argument("rushx.cmd build"),
    ],
    dependencies: [
        packageJson,
        rushJson,
    ],
    environmentVariables: [],
    outputs: [
        outFile
    ],
    unsafe: {
        passThroughEnvironmentVariables : [
          "PATH",
          "USERPROFILE",
        ],
        untrackedScopes: [
          d\`\${Context.getMount("AppData").path}\`,
          d\`\${Context.getMount("ProgramFiles").path}\`,
          d\`\${Context.getMount("ProgramFilesX86").path}\`,
        ],
    },
    workingDirectory: packageRoot,
});
`;

    FileSystem.writeFile(this.moduleFilePath, contents, { ensureFolderExists: true });
    return this._config.writeFile();
  }
}
