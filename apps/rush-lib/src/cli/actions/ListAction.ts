import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineFlagParameter } from '@microsoft/ts-command-line';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import * as Table from 'cli-table';

export class ListAction extends BaseRushAction {
  private _version: CommandLineFlagParameter;
  private _path: CommandLineFlagParameter;
  private _fullPath: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'list',
      summary: 'List package information for all projects in the repo',
      documentation:
        'List package names, and optionally version (--version) and ' +
        'path (--path) or full path (--full-path), for projects in the ' +
        'current rush config.',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._version = this.defineFlagParameter({
      parameterLongName: '--version',
      parameterShortName: '-v',
      description: 'If this flag is specified, the project version will be ' +
        'displayed in a column along with the package name.'
    });

    this._path = this.defineFlagParameter({
      parameterLongName: '--path',
      parameterShortName: '-p',
      description: 'If this flag is specified, the project path will be ' +
        'displayed in a column along with the package name.'
    });

    this._fullPath = this.defineFlagParameter({
      parameterLongName: '--full-path',
      parameterShortName: '-f',
      description: 'If this flag is specified, the project full path will ' +
        'be displayed in a column along with the package name.'
    });
  }

  protected run(): Promise<void> {
    return Promise.resolve().then(() => {
      const allPackages: Map<string, RushConfigurationProject> = this.rushConfiguration.projectsByName;
      const tableHeader: string[] = ['Project'];
      if (this._version.value) {
        tableHeader.push('Version');
      }
      if (this._path.value) {
        tableHeader.push('Path');
      }
      if (this._fullPath.value) {
        tableHeader.push('Full Path');
      }
      const table: typeof Table = new Table({
        head: tableHeader
      });

      allPackages.forEach((config: RushConfigurationProject, name: string) => {
        const packageRow: string[] = [name];
        if (this._version.value) {
          packageRow.push(config.packageJson.version);
        }
        if (this._path.value) {
          packageRow.push(config.projectRelativeFolder);
        }
        if (this._fullPath.value) {
          packageRow.push(config.projectFolder);
        }
        table.push(packageRow);
      });
      console.log(table.toString());
    });
  }
}
