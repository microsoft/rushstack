// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// UI Code, Table creation, and choice layout leveraged from npm-check
// https://github.com/dylang/npm-check/blob/master/lib/out/interactive-update.js
// Extended to use one type of text table

/// <reference path="../npm-check-typings.d.ts" preserve="true" />

import inquirer from 'inquirer';
import CliTable from 'cli-table';
import type Separator from 'inquirer/lib/objects/separator';
import type * as NpmCheck from 'npm-check';

import { AnsiEscape, Colorize } from '@rushstack/terminal';

export interface IUIGroup {
  title: string;
  bgColor?: string;
  filter: {
    mismatch?: boolean;
    bump?: undefined | 'major' | 'minor' | 'patch' | 'nonSemver';
    notInstalled?: boolean;
  };
}

export interface IDepsToUpgradeAnswers {
  packages: NpmCheck.INpmCheckPackage[];
}

export interface IUpgradeInteractiveDepChoice {
  value: NpmCheck.INpmCheckPackage;
  name: string | string[];
  short: string;
}

type ChoiceTable = (Separator | IUpgradeInteractiveDepChoice | boolean | undefined)[] | undefined;

function greenUnderlineBold(text: string): string {
  return Colorize.underline(Colorize.bold(Colorize.green(text)));
}

function yellowUnderlineBold(text: string): string {
  return Colorize.underline(Colorize.bold(Colorize.yellow(text)));
}

function redUnderlineBold(text: string): string {
  return Colorize.underline(Colorize.bold(Colorize.red(text)));
}

function magentaUnderlineBold(text: string): string {
  return Colorize.underline(Colorize.bold(Colorize.magenta(text)));
}

export const UI_GROUPS: IUIGroup[] = [
  {
    title: greenUnderlineBold('Update package.json to match version installed.'),
    filter: { mismatch: true, bump: undefined }
  },
  {
    title: `${greenUnderlineBold('Missing.')} ${Colorize.green('You probably want these.')}`,
    filter: { notInstalled: true, bump: undefined }
  },
  {
    title: `${greenUnderlineBold('Patch Update')} ${Colorize.green('Backwards-compatible bug fixes.')}`,
    filter: { bump: 'patch' }
  },
  {
    title: `${yellowUnderlineBold('Minor Update')} ${Colorize.yellow('New backwards-compatible features.')}`,
    bgColor: 'yellow',
    filter: { bump: 'minor' }
  },
  {
    title: `${redUnderlineBold('Major Update')} ${Colorize.red(
      'Potentially breaking API changes. Use caution.'
    )}`,
    filter: { bump: 'major' }
  },
  {
    title: `${magentaUnderlineBold('Non-Semver')} ${Colorize.magenta('Versions less than 1.0.0, caution.')}`,
    filter: { bump: 'nonSemver' }
  }
];

function label(dep: NpmCheck.INpmCheckPackage): string[] {
  const bumpInstalled: string = dep.bump ? dep.installed : '';
  const installed: string = dep.mismatch ? dep.packageJson : bumpInstalled;
  const name: string = Colorize.yellow(dep.moduleName);
  const type: string = dep.devDependency ? Colorize.green(' devDep') : '';
  const missing: string = dep.notInstalled ? Colorize.red(' missing') : '';
  const homepage: string = dep.homepage ? Colorize.blue(Colorize.underline(dep.homepage)) : '';

  return [
    name + type + missing,
    installed,
    installed && '>',
    Colorize.bold(dep.latest || ''),
    dep.latest ? homepage : dep.regError || dep.pkgError
  ];
}

function short(dep: NpmCheck.INpmCheckPackage): string {
  return `${dep.moduleName}@${dep.latest}`;
}

function getChoice(dep: NpmCheck.INpmCheckPackage): IUpgradeInteractiveDepChoice | boolean | Separator {
  if (!dep.mismatch && !dep.bump && !dep.notInstalled) {
    return false;
  }

  return {
    value: dep,
    name: label(dep),
    short: short(dep)
  };
}

function unselectable(options?: { title: string }): Separator {
  return new inquirer.Separator(AnsiEscape.removeCodes(options ? options.title : ''));
}

function createChoices(packages: NpmCheck.INpmCheckPackage[], options: IUIGroup): ChoiceTable {
  const { filter } = options;
  const filteredChoices: NpmCheck.INpmCheckPackage[] = packages.filter((pkg: NpmCheck.INpmCheckPackage) => {
    if ('mismatch' in filter && pkg.mismatch !== filter.mismatch) {
      return false;
    } else if ('bump' in filter && pkg.bump !== filter.bump) {
      return false;
    } else if ('notInstalled' in filter && pkg.notInstalled !== filter.notInstalled) {
      return false;
    } else {
      return true;
    }
  }) as NpmCheck.INpmCheckPackage[];

  const choices: (IUpgradeInteractiveDepChoice | Separator | boolean)[] = filteredChoices
    .map(getChoice)
    .filter(Boolean);

  const cliTable: CliTable = new CliTable({
    chars: {
      top: '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      bottom: '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      left: '',
      'left-mid': '',
      mid: '',
      'mid-mid': '',
      right: '',
      'right-mid': '',
      middle: ' '
    },
    colWidths: [50, 10, 3, 10, 100]
  });

  for (const choice of choices) {
    if (typeof choice === 'object' && 'name' in choice) {
      cliTable.push(choice.name);
    }
  }

  const choicesAsATable: string[] = cliTable.toString().split('\n');
  for (let i: number = 0; i < choices.length; i++) {
    const choice: IUpgradeInteractiveDepChoice | Separator | boolean | undefined = choices[i];
    if (typeof choice === 'object' && 'name' in choice) {
      choice.name = choicesAsATable[i];
    }
  }

  if (choices.length > 0) {
    choices.unshift(unselectable(options));
    choices.unshift(unselectable());
    return choices;
  }
}

export const upgradeInteractive = async (
  pkgs: NpmCheck.INpmCheckPackage[]
): Promise<IDepsToUpgradeAnswers> => {
  const choicesGrouped: ChoiceTable[] = UI_GROUPS.map((group) => createChoices(pkgs, group)).filter(Boolean);

  const choices: ChoiceTable = [];
  for (const choiceGroup of choicesGrouped) {
    if (choiceGroup) {
      choices.push(...choiceGroup);
    }
  }

  if (!choices.length) {
    // eslint-disable-next-line no-console
    console.log('All dependencies are up to date!');
    return { packages: [] };
  }

  choices.push(unselectable());
  choices.push(unselectable({ title: 'Space to select. Enter to start upgrading. Control-C to cancel.' }));

  const promptQuestions: inquirer.QuestionCollection = [
    {
      name: 'packages',
      message: 'Choose which packages to upgrade',
      type: 'checkbox',
      choices: choices.concat(unselectable()),
      pageSize: process.stdout.rows - 2
    }
  ];

  const answers: IDepsToUpgradeAnswers = (await inquirer.prompt(promptQuestions)) as IDepsToUpgradeAnswers;

  return answers;
};
