// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';

import { ZodSchemaGenerator, type IGeneratedSchema } from '../ZodSchemaGenerator';

const projectFolder: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
const compiledFixturesFolder: string = `${__dirname}/fixtures`;
const outputFolder: string = `${projectFolder}/temp/test-zod-schema-output`;

async function readJsonAsync(absolutePath: string): Promise<unknown> {
  const text: string = await FileSystem.readFileAsync(absolutePath);
  return JSON.parse(text);
}

describe(ZodSchemaGenerator.name, () => {
  beforeEach(async () => {
    await FileSystem.ensureEmptyFolderAsync(outputFolder);
  });

  it('emits a JSON schema for a basic zod default export', async () => {
    const generator: ZodSchemaGenerator = new ZodSchemaGenerator({
      buildFolderPath: projectFolder,
      inputGlobs: [`${compiledFixturesFolder}/basic.zod.js`],
      outputFolder,
      exportName: 'default',
      indent: 2
    });

    const results: IGeneratedSchema[] = await generator.generateAsync();
    expect(results).toHaveLength(1);
    expect(results[0].outputFilePath.endsWith('basic.schema.json')).toBe(true);

    const written: unknown = await readJsonAsync(results[0].outputFilePath);
    expect(written).toMatchSnapshot();
  });

  it('applies withSchemaMeta() metadata, including the TSDoc release tag', async () => {
    const generator: ZodSchemaGenerator = new ZodSchemaGenerator({
      buildFolderPath: projectFolder,
      inputGlobs: [`${compiledFixturesFolder}/with-tsdoc-tag.zod.js`],
      outputFolder,
      exportName: 'default',
      indent: 2
    });

    const results: IGeneratedSchema[] = await generator.generateAsync();
    expect(results).toHaveLength(1);

    const written: Record<string, unknown> = (await readJsonAsync(
      results[0].outputFilePath
    )) as Record<string, unknown>;
    expect(written).toMatchSnapshot();
    expect(written['x-tsdoc-release-tag']).toBe('@public');
    expect(written.title).toBe('Public Config');
    expect(written.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });

  it('emits one schema file per named ZodType export when exportName is "*"', async () => {
    const generator: ZodSchemaGenerator = new ZodSchemaGenerator({
      buildFolderPath: projectFolder,
      inputGlobs: [`${compiledFixturesFolder}/named-exports.zod.js`],
      outputFolder,
      exportName: '*',
      indent: 2
    });

    const results: IGeneratedSchema[] = await generator.generateAsync();
    expect(results).toHaveLength(2);
    const fileNames: string[] = results.map((r) => r.outputFilePath.split(/[\\/]/).pop()!).sort();
    expect(fileNames).toEqual(['named-exports.alphaSchema.schema.json', 'named-exports.betaSchema.schema.json']);
  });

  it('produces deterministic output and skips writes when contents are unchanged', async () => {
    const generator: ZodSchemaGenerator = new ZodSchemaGenerator({
      buildFolderPath: projectFolder,
      inputGlobs: [`${compiledFixturesFolder}/basic.zod.js`],
      outputFolder,
      exportName: 'default',
      indent: 2
    });

    const first: IGeneratedSchema[] = await generator.generateAsync();
    expect(first[0].wasWritten).toBe(true);

    const second: IGeneratedSchema[] = await generator.generateAsync();
    expect(second[0].wasWritten).toBe(false);
    expect(second[0].contents).toEqual(first[0].contents);
  });

  it('throws a clear error when the requested export is not a zod schema', async () => {
    const generator: ZodSchemaGenerator = new ZodSchemaGenerator({
      buildFolderPath: projectFolder,
      inputGlobs: [`${compiledFixturesFolder}/basic.zod.js`],
      outputFolder,
      exportName: 'doesNotExist',
      indent: 2
    });

    await expect(generator.generateAsync()).rejects.toThrow(/does not export a zod schema/);
  });
});
