import * as path from 'path';
import { Executable } from '@rushstack/node-core-library';

const rushSdkPath: string = path.join(__dirname, '../../lib-shim/index.js');
const sandboxRepoPath: string = `${__dirname}/sandbox`;
const mockPackageFolder: string = `${sandboxRepoPath}/mock-package`;
const mockRushLibPath: string = `${__dirname}/fixture/mock-rush-lib.js`;

const coreLibPath: string = require.resolve('@rushstack/node-core-library');

describe('@rushstack/rush-sdk', () => {
  it('Should load via global (for plugins)', () => {
    const result = Executable.spawnSync(
      'node',
      [
        '-e',
        `
global.___rush___rushLibModule = { foo: 1 };
console.log(Object.keys(require(${JSON.stringify(rushSdkPath)})));`
      ],
      {
        currentWorkingDirectory: mockPackageFolder,
        environment: {
          ...process.env,
          RUSH_SDK_DEBUG: '1',
          _RUSH_LIB_PATH: '' // Need to clear if invoked via Rush
        }
      }
    );
    expect(result.stderr.trim()).toMatchSnapshot('stderr');
    expect(result.stdout.trim()).toMatchSnapshot('stdout');
    expect(result.status).toBe(0);
  });

  it('Should load via env when Rush has loaded (for child processes)', () => {
    const result = Executable.spawnSync(
      'node',
      [
        '-e',
        `
require('@microsoft/rush-lib');
console.log(Object.keys(require(${JSON.stringify(rushSdkPath)})));`
      ],
      {
        currentWorkingDirectory: mockPackageFolder,
        environment: {
          ...process.env,
          RUSH_SDK_DEBUG: '1',
          _RUSH_LIB_PATH: '' // Need to clear if invoked via Rush
        }
      }
    );
    expect(result.stderr.trim()).toMatchSnapshot('stderr');
    expect(result.stdout.trim()).toMatchSnapshot('stdout');
    expect(result.status).toBe(0);
  });

  it('Should load via process.env._RUSH_LIB_PATH (for child processes)', () => {
    const result = Executable.spawnSync(
      'node',
      ['-e', `console.log(Object.keys(require(${JSON.stringify(rushSdkPath)})));`],
      {
        currentWorkingDirectory: mockPackageFolder,
        environment: {
          ...process.env,
          RUSH_SDK_DEBUG: '1',
          _RUSH_LIB_PATH: mockRushLibPath
        }
      }
    );
    expect(result.stderr.trim()).toMatchSnapshot('stderr');
    expect(result.stdout.trim()).toMatchSnapshot('stdout');
    expect(result.status).toBe(0);
  });

  it('Should load via install-run (for standalone tools)', () => {
    const result = Executable.spawnSync(
      'node',
      [
        '-e',
        `
const { Import } = require(${JSON.stringify(coreLibPath)});
const originalResolveModule = Import.resolveModule;
const mockResolveModule = (options) => {
  if (options.baseFolderPath.includes('install-run') && options.modulePath === '@microsoft/rush-lib') {
    return ${JSON.stringify(mockRushLibPath)};
  }
  return originalResolveModule(options);
}
Import.resolveModule = mockResolveModule;
console.log(Object.keys(require(${JSON.stringify(rushSdkPath)})));
`
      ],
      {
        currentWorkingDirectory: mockPackageFolder,
        environment: {
          ...process.env,
          RUSH_SDK_DEBUG: '1',
          _RUSH_LIB_PATH: '' // Need to clear if invoked via Rush
        }
      }
    );
    expect(result.stderr.trim()).toMatchSnapshot('stderr');
    expect(result.stdout.trim()).toMatchSnapshot('stdout');
    expect(result.status).toBe(0);
  });
});
