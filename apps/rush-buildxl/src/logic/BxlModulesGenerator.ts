// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '@microsoft/rush-lib';

import { BxlModule } from './BxlModule';
import { BxlConfig } from './BxlConfig';

export class BxlModulesGenerator {
  private _rushConfiguration: RushConfiguration;
  private _buildXLRoot: string;

  constructor(rushConfiguration: RushConfiguration, buildXLRoot: string) {
    this._rushConfiguration = rushConfiguration;
    this._buildXLRoot = this._normalizePathSeparator(buildXLRoot);
  }

  public async run(): Promise<void> {
    const modulesRoot: string = this._normalizePathSeparator(`${this._rushConfiguration.commonTempFolder}/bxl/modules`);
    const rushJsonFilePath: string = this._normalizePathSeparator(this._rushConfiguration.rushJsonFile);
    const commonRushConfigFolder: string = this._normalizePathSeparator(this._rushConfiguration.commonRushConfigFolder);

    const modules: BxlModule[] =  this._rushConfiguration.projects.map((project) => {
      const name: string = this._packageNameToModuleName(project.packageName);
      const moduleRoot: string = `${modulesRoot}/${name}`;
      const projDir: string = this._normalizePathSeparator(project.projectFolder);

      return new BxlModule(name, projDir, rushJsonFilePath, moduleRoot);
    });

    const bxlConfig: BxlConfig = new BxlConfig(this._buildXLRoot, modulesRoot, modules, commonRushConfigFolder);

    // Write individual module dsc files
    const tasks: Array<Promise<void>> = modules.map(module => module.writeFile());
    await Promise.all(tasks);

    // Write config.dsc
    await bxlConfig.writeFile();
  }

  private _packageNameToModuleName(packageName: string): string {
    return packageName.replace('/', '_');
  }

  private _normalizePathSeparator(path: string): string {
    return path.replace(/\\/g, '/');
  }
}