// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';
import * as Ajv from 'ajv';
import * as resolve from 'resolve';

import { RigConfig } from '../RigConfig';
import { IModuleResolverOptions } from '../ModuleResolver';

const testProjectFolder: string = path.join(__dirname, 'test-project');

function expectEqualPaths(path1: string, path2: string): void {
  if (path.relative(path1, path2) !== '') {
    fail('Expected paths to be equal:\npath1: ' + path1 + '\npath2: ' + path2);
  }
}

describe('RigConfig tests', () => {
  it('loads a rig.json file', () => {
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({ packageJsonFolderPath: testProjectFolder });
    expectEqualPaths(rigConfig.projectFolderPath, testProjectFolder);
    expect(rigConfig.enabled).toBe(true);
    expectEqualPaths(rigConfig.filePath, path.join(testProjectFolder, 'config/rig.json'));
    expect(rigConfig.rigProfile).toBe('web-app');
    expect(rigConfig.rigPackageName).toBe('example-rig');
    expect(rigConfig.relativeProfileFolderPath).toBe('profile/web-app');
  });

  it('handles a missing rig.json file', () => {
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({ packageJsonFolderPath: __dirname });
    expectEqualPaths(rigConfig.projectFolderPath, __dirname);
    expect(rigConfig.enabled).toBe(false);
    expect(rigConfig.filePath).toBe('');
    expect(rigConfig.rigProfile).toBe('');
    expect(rigConfig.rigPackageName).toBe('');
    expect(rigConfig.relativeProfileFolderPath).toBe('');
  });

  it('resolves the profile path', () => {
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
      packageJsonFolderPath: testProjectFolder,
      moduleResolver: (options: IModuleResolverOptions): string => {
        return resolve.sync(options.modulePath, { basedir: options.baseFolderPath });
      }
    });

    expect(rigConfig.enabled).toBe(true);

    expectEqualPaths(
      rigConfig.getResolvedProfileFolder(),
      path.join(testProjectFolder, 'node_modules/example-rig/profile/web-app')
    );
  });

  it('validates a rig.json file using the schema', () => {
    const rigConfigFilePath: string = path.join(testProjectFolder, 'config', 'rig.json');

    const ajv = new Ajv({
      verbose: true,
      strictKeywords: true
    });

    // Delete our older "draft-04/schema" and use AJV's built-in schema
    // eslint-disable-next-line
    delete RigConfig.jsonSchemaObject['$schema'];

    // Compile our schema
    const validateRigFile: Ajv.ValidateFunction = ajv.compile(RigConfig.jsonSchemaObject);

    // Load the rig.json file
    const rigConfigJsonObject: unknown = JSON.parse(fs.readFileSync(rigConfigFilePath).toString());

    // Validate it against our schema
    const valid: boolean = validateRigFile(rigConfigJsonObject) as boolean;

    expect(validateRigFile.errors).toMatchInlineSnapshot(`null`);
    expect(valid).toBe(true);
  });
});
