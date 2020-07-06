import { CommandLineStringParameter } from '@rushstack/ts-command-line';

import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { Autoinstaller } from '../../logic/Autoinstaller';

export class UpdateAutoinstallerAction extends BaseRushAction {
  private _name: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'update-autoinstaller',
      summary: 'Updates autoinstaller package dependenices',
      documentation: 'Use this command to regenerate the shrinkwrap file for an autoinstaller folder.',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._name = this.defineStringParameter({
      parameterLongName: '--name',
      argumentName: 'AUTOINSTALLER_NAME',
      required: true,
      description:
        'Specifies the name of the autoinstaller, which must be one of the folders under common/autoinstallers.'
    });
  }

  protected async run(): Promise<void> {
    const autoinstallerName: string = this._name.value!;

    const autoinstaller: Autoinstaller = new Autoinstaller(autoinstallerName, this.rushConfiguration);
    autoinstaller.update();

    console.log('\nSuccess.');
  }
}
