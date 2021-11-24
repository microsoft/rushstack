import * as path from 'path';

import { Config } from '@jest/types';

import Resolver from 'jest-resolve';
import { ValidationError } from 'jest-validate';

import chalk from 'chalk';

const BULLET: string = chalk.bold('\u25cf ');
const DOCUMENTATION_NOTE: string = `  ${chalk.bold('Configuration Documentation:')}
  https://jestjs.io/docs/configuration
`;

function createValidationError(message: string): ValidationError {
  return new ValidationError(`${BULLET}Validation Error`, message, DOCUMENTATION_NOTE);
}

function replaceRootDirInPath(rootDir: Config.Path, filePath: Config.Path): string {
  if (!/^<rootDir>/.test(filePath)) {
    return filePath;
  }

  return path.resolve(rootDir, path.normalize('./' + filePath.substr('<rootDir>'.length)));
}

export function jestResolveWithPrefix(
  // eslint-disable-next-line @rushstack/no-new-null
  resolver: string | undefined | null,
  {
    filePath,
    humanOptionName,
    optionName,
    prefix,
    requireResolveFunction,
    rootDir
  }: {
    filePath: string;
    humanOptionName: string;
    optionName: string;
    prefix: string;
    requireResolveFunction?: (moduleName: string) => string;
    rootDir: Config.Path;
  }
): string {
  const fileName: string = replaceRootDirInPath(rootDir, filePath);
  let module: string | null = Resolver.findNodeModule(`${prefix}${fileName}`, {
    basedir: rootDir,
    resolver: resolver || undefined
  });
  if (module) {
    return module;
  }

  try {
    return requireResolveFunction?.(`${prefix}${fileName}`) ?? '';
    // eslint-disable-next-line no-empty
  } catch {}

  module = Resolver.findNodeModule(fileName, {
    basedir: rootDir,
    resolver: resolver || undefined
  });
  if (module) {
    return module;
  }

  try {
    return requireResolveFunction?.(fileName) ?? '';
    // eslint-disable-next-line no-empty
  } catch {}

  throw createValidationError(
    `  ${humanOptionName} ${chalk.bold(fileName)} cannot be found. Make sure the ${chalk.bold(
      optionName
    )} configuration option points to an existing node module.`
  );
}
