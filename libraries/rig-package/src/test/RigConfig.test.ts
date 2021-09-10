// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';
import Ajv from 'ajv';
import stripJsonComments from 'strip-json-comments';

import { RigConfig } from '../RigConfig';

const testProjectFolder: string = path.join(__dirname, 'test-project');

function expectEqualPaths(path1: string, path2: string): void {
  if (path.relative(path1!, path2) !== '') {
    fail('Expected paths to be equal:\npath1: ' + path1 + '\npath2: ' + path2);
  }
}

describe('RigConfig tests', () => {
  describe('loads a rig.json file', () => {
    function validate(rigConfig: RigConfig): void {
      expectEqualPaths(rigConfig.projectFolderPath, testProjectFolder);
      expect(rigConfig.rigFound).toBe(true);
      expectEqualPaths(rigConfig.filePath, path.join(testProjectFolder, 'config/rig.json'));
      expect(rigConfig.rigProfile).toBe('web-app');
      expect(rigConfig.rigPackageName).toBe('example-rig');
      expect(rigConfig.relativeProfileFolderPath).toBe('profiles/web-app');
    }

    it('synchronously', () => {
      const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
        projectFolderPath: testProjectFolder,
        bypassCache: true
      });
      validate(rigConfig);

      // Should cache result
      const rigConfig2: RigConfig = RigConfig.loadForProjectFolder({ projectFolderPath: testProjectFolder });
      expect(rigConfig2).toBe(rigConfig);
    });

    it('asynchronously', async () => {
      const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
        projectFolderPath: testProjectFolder,
        bypassCache: true
      });
      validate(rigConfig);

      // Should cache result
      const rigConfig2: RigConfig = await RigConfig.loadForProjectFolderAsync({
        projectFolderPath: testProjectFolder
      });
      expect(rigConfig2).toBe(rigConfig);
    });
  });

  describe('handles a missing rig.json file', () => {
    function validate(rigConfig: RigConfig): void {
      expectEqualPaths(rigConfig.projectFolderPath, __dirname);
      expect(rigConfig.rigFound).toBe(false);
      expect(rigConfig.filePath).toBe('');
      expect(rigConfig.rigProfile).toBe('');
      expect(rigConfig.rigPackageName).toBe('');
      expect(rigConfig.relativeProfileFolderPath).toBe('');
    }

    it('synchronously', () => {
      const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
        projectFolderPath: __dirname,
        bypassCache: true
      });
      validate(rigConfig);

      // Should cache result
      const rigConfig2: RigConfig = RigConfig.loadForProjectFolder({ projectFolderPath: __dirname });
      expect(rigConfig2).toBe(rigConfig);
    });

    it('asynchronously', async () => {
      const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
        projectFolderPath: __dirname,
        bypassCache: true
      });
      validate(rigConfig);

      // Should cache result
      const rigConfig2: RigConfig = await RigConfig.loadForProjectFolderAsync({
        projectFolderPath: __dirname
      });
      expect(rigConfig2).toBe(rigConfig);
    });
  });

  describe(`resolves the profile path`, () => {
    it('synchronously', () => {
      const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
        projectFolderPath: testProjectFolder
      });

      expect(rigConfig.rigFound).toBe(true);

      expectEqualPaths(
        rigConfig.getResolvedProfileFolder(),
        path.join(testProjectFolder, 'node_modules/example-rig/profiles/web-app')
      );
    });

    it('asynchronously', async () => {
      const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
        projectFolderPath: testProjectFolder
      });

      expect(rigConfig.rigFound).toBe(true);

      expectEqualPaths(
        await rigConfig.getResolvedProfileFolderAsync(),
        path.join(testProjectFolder, 'node_modules/example-rig/profiles/web-app')
      );
    });
  });

  describe(`reports an undefined profile`, () => {
    it('synchronously', () => {
      const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
        projectFolderPath: testProjectFolder,
        overrideRigJsonObject: {
          rigPackageName: 'example-rig',
          rigProfile: 'missing-profile'
        }
      });

      expect(rigConfig.rigFound).toBe(true);

      expect(() => rigConfig.getResolvedProfileFolder()).toThrowError(
        'The rig profile "missing-profile" is not defined by the rig package "example-rig"'
      );
    });

    it('asynchronously', async () => {
      const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
        projectFolderPath: testProjectFolder,
        overrideRigJsonObject: {
          rigPackageName: 'example-rig',
          rigProfile: 'missing-profile'
        }
      });

      await expect(rigConfig.getResolvedProfileFolderAsync()).rejects.toThrowError(
        'The rig profile "missing-profile" is not defined by the rig package "example-rig"'
      );
    });
  });

  describe(`resolves a config file path`, () => {
    it('synchronously', () => {
      const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
        projectFolderPath: testProjectFolder,
        bypassCache: true
      });

      expect(rigConfig.rigFound).toBe(true);

      const resolvedPath: string | undefined = rigConfig.tryResolveConfigFilePath('example-config.json');

      expect(resolvedPath).toBeDefined();
      expectEqualPaths(
        resolvedPath!,
        path.join(testProjectFolder, 'node_modules/example-rig/profiles/web-app/example-config.json')
      );
    });

    it('asynchronously', async () => {
      const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
        projectFolderPath: testProjectFolder,
        bypassCache: true
      });

      expect(rigConfig.rigFound).toBe(true);

      const resolvedPath: string | undefined = await rigConfig.tryResolveConfigFilePathAsync(
        'example-config.json'
      );

      expect(resolvedPath).toBeDefined();
      expectEqualPaths(
        resolvedPath!,
        path.join(testProjectFolder, 'node_modules/example-rig/profiles/web-app/example-config.json')
      );
    });
  });
  it('validates a rig.json file using the schema', () => {
    const rigConfigFilePath: string = path.join(testProjectFolder, 'config', 'rig.json');

    const ajv = new Ajv({
      verbose: true,
      strictKeywords: true
    });

    // Delete our older "draft-04/schema" and use AJV's built-in schema
    // eslint-disable-next-line
    delete (RigConfig.jsonSchemaObject as any)['$schema'];

    // Compile our schema
    const validateRigFile: Ajv.ValidateFunction = ajv.compile(RigConfig.jsonSchemaObject);

    // Load the rig.json file
    const rigConfigFileContent: string = fs.readFileSync(rigConfigFilePath).toString();
    const rigConfigJsonObject: unknown = JSON.parse(stripJsonComments(rigConfigFileContent));

    // Validate it against our schema
    const valid: boolean = validateRigFile(rigConfigJsonObject) as boolean;

    expect(validateRigFile.errors).toMatchInlineSnapshot(`null`);
    expect(valid).toBe(true);
  });
});
