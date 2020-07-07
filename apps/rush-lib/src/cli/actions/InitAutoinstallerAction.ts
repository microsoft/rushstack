import * as colors from 'colors';

import { CommandLineStringParameter } from '@rushstack/ts-command-line';
import { FileSystem, NewlineKind, IPackageJson, JsonFile } from '@rushstack/node-core-library';

import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { Autoinstaller } from '../../logic/Autoinstaller';

export class InitAutoinstallerAction extends BaseRushAction {
  private _name: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'init-autoinstaller',
      summary: 'Initializes a new autoinstaller',
      documentation:
        'Use this command to initialize a new autoinstaller folder.  Autoinstallers provide a way to' +
        ' manage a set of related dependencies that are used for scripting scenarios outside of the usual' +
        ' "rush install" context.  See the command-line.json documentation for an example.',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._name = this.defineStringParameter({
      parameterLongName: '--name',
      argumentName: 'AUTOINSTALLER_NAME',
      required: true,
      description:
        'Specifies the name of the autoinstaller folder, which must conform to the naming rules for NPM packages.'
    });
  }

  protected async run(): Promise<void> {
    const autoinstallerName: string = this._name.value!;

    const autoinstaller: Autoinstaller = new Autoinstaller(autoinstallerName, this.rushConfiguration);

    if (FileSystem.exists(autoinstaller.folderFullPath)) {
      // It's okay if the folder is empty
      if (FileSystem.readFolder(autoinstaller.folderFullPath).length > 0) {
        throw new Error('The target folder already exists: ' + autoinstaller.folderFullPath);
      }
    }

    const packageJson: IPackageJson = {
      name: autoinstallerName,
      version: '1.0.0',
      private: true,
      dependencies: {}
    };

    console.log(colors.green('Creating package: ') + autoinstaller.packageJsonPath);

    JsonFile.save(packageJson, autoinstaller.packageJsonPath, {
      ensureFolderExists: true,
      newlineConversion: NewlineKind.OsDefault
    });

    console.log('\nFile successfully written. Add your dependencies before committing.');
  }
}
