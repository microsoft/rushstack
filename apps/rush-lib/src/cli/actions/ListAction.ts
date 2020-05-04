import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import * as Table from 'cli-table';

export interface IJsonEntry {
  name: string;
  version: string;
  path: string;
  fullPath: string;
}

export interface IJsonOutput {
  projects: IJsonEntry[];
}

export class ListAction extends BaseRushAction {
  private _version: CommandLineFlagParameter;
  private _path: CommandLineFlagParameter;
  private _fullPath: CommandLineFlagParameter;
  private _jsonFlag: CommandLineFlagParameter;
  private _notTableFormatting: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
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
      description:
        'If this flag is specified, the project version will be ' +
        'displayed in a column along with the package name.'
    });

    this._path = this.defineFlagParameter({
      parameterLongName: '--path',
      parameterShortName: '-p',
      description:
        'If this flag is specified, the project path will be ' +
        'displayed in a column along with the package name.'
    });

    this._fullPath = this.defineFlagParameter({
      parameterLongName: '--full-path',
      parameterShortName: '-f',
      description:
        'If this flag is specified, the project full path will ' +
        'be displayed in a column along with the package name.'
    });

    this._jsonFlag = this.defineFlagParameter({
      parameterLongName: '--json',
      description: 'If this flag is specified, output will be in JSON format.'
    });

    this._notTableFormatting = this.defineFlagParameter({
      parameterLongName: '--no-table-formatting',
      description: 'If this flag is specified, then the output table will not have headers or border characters making it easier to parse (for example, using grep).'
    });
  }

  protected async run(): Promise<void> {
    const allPackages: Map<string, RushConfigurationProject> = this.rushConfiguration.projectsByName;
    if (this._jsonFlag.value) {
      this._printJson(allPackages);
    } else if (this._version.value || this._path.value || this._fullPath.value) {
      this._printListTable(allPackages);
    } else {
      this._printList(allPackages);
    }
  }

  private _printJson(
    allPackages: Map<string, RushConfigurationProject>
  ): void {
    const projects: IJsonEntry[] = [];
    allPackages.forEach((_config: RushConfigurationProject, name: string) => {
      const project: IJsonEntry = {
        name: name,
        version: _config.packageJson.version,
        path: _config.projectRelativeFolder,
        fullPath: _config.projectFolder
      };
      projects.push(project);
    });

    const output: IJsonOutput = {
      projects
    };
    console.log(JSON.stringify(output, undefined, 2));
  }

  private _printList(
    allPackages: Map<string, RushConfigurationProject>
  ): void {
    allPackages.forEach((_config: RushConfigurationProject, name: string) => {
      console.log(name);
    });
  }

  private _printListTable(
    allPackages: Map<string, RushConfigurationProject>
  ): void {
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

    const table: Table = new Table({
      head: this._notTableFormatting.value ? [] : tableHeader,
      chars: this._notTableFormatting.value ? {
        'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
        'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
        'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
        'right': '', 'right-mid': '', 'middle': ' '
      } : {},
      style: this._notTableFormatting ? { 'padding-left': 0, 'padding-right': 0 } : {}
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
  }
}
