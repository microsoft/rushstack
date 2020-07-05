import * as path from 'path';
import * as colors from 'colors';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineStringParameter } from '@rushstack/ts-command-line';
import {
  FileSystem,
  NewlineKind,
  PackageName,
  IParsedPackageNameOrError,
  IPackageJson,
  JsonFile
} from '@rushstack/node-core-library';

export class InitAutoinstallerAction extends BaseRushAction {
  private _name: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'init-autoinstaller',
      summary: 'Creates a new autoinstaller',
      documentation: 'Use this command to initialize a new autoinstaller.',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._name = this.defineStringParameter({
      parameterLongName: '--name',
      argumentName: 'AUTOINSTALLER_NAME',
      required: true,
      description:
        'Specifies the name of the autoinstaller, which must conform to the naming rules for NPM packages.'
    });
  }

  protected async run(): Promise<void> {
    const autoinstallerName: string = this._name.value!;
    const nameOrError: IParsedPackageNameOrError = PackageName.tryParse(autoinstallerName);
    if (nameOrError.error) {
      throw new Error(
        `The specified name "${autoinstallerName}" contains invalid characters: ` + nameOrError.error
      );
    }
    if (nameOrError.scope) {
      throw new Error(`The specified name "${autoinstallerName}" must not contain an NPM scope`);
    }

    // Example: .../common/autoinstallers/my-task
    const autoinstallerFullPath: string = path.join(
      this.rushConfiguration.commonAutoinstallersFolder,
      nameOrError.unscopedName
    );

    if (FileSystem.exists(autoinstallerFullPath)) {
      throw new Error('The target folder already exists: ' + autoinstallerFullPath);
    }

    const packageJson: IPackageJson = {
      name: nameOrError.unscopedName,
      version: '1.0.0',
      private: true,
      dependencies: {}
    };
    const packageJsonPath: string = path.join(autoinstallerFullPath, 'package.json');

    console.log(colors.green('Creating package: ') + packageJsonPath);

    JsonFile.save(packageJson, packageJsonPath, {
      ensureFolderExists: true,
      newlineConversion: NewlineKind.OsDefault
    });

    console.log('\nFile successfully written. Add your dependencies before committing.');
  }
}
