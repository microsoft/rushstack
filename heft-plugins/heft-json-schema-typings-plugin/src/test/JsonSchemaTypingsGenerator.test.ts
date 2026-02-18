// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';

import { JsonSchemaTypingsGenerator } from '../JsonSchemaTypingsGenerator';

const projectFolder: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
const schemasFolder: string = `${__dirname}/schemas`;
const outputFolder: string = `${projectFolder}/temp/test-typings-output`;

async function readGeneratedTypings(schemaRelativePath: string): Promise<string> {
  const outputPath: string = `${outputFolder}/${schemaRelativePath}.d.ts`;
  return await FileSystem.readFileAsync(outputPath);
}

describe('JsonSchemaTypingsGenerator', () => {
  beforeEach(async () => {
    await FileSystem.ensureEmptyFolderAsync(outputFolder);
  });

  it('generates typings for a basic object schema', async () => {
    const generator = new JsonSchemaTypingsGenerator({
      srcFolder: schemasFolder,
      generatedTsFolder: outputFolder
    });

    await generator.generateTypingsAsync(['basic.schema.json']);
    const typings: string = await readGeneratedTypings('basic.schema.json');
    expect(typings).toMatchSnapshot();
  });

  it('injects x-tsdoc-release-tag into exported declarations', async () => {
    const generator = new JsonSchemaTypingsGenerator({
      srcFolder: schemasFolder,
      generatedTsFolder: outputFolder
    });

    await generator.generateTypingsAsync(['with-tsdoc-tag.schema.json']);
    const typings: string = await readGeneratedTypings('with-tsdoc-tag.schema.json');
    expect(typings).toMatchSnapshot();
    expect(typings).toContain('@public');
  });

  it('resolves cross-file $ref between schema files', async () => {
    const generator = new JsonSchemaTypingsGenerator({
      srcFolder: schemasFolder,
      generatedTsFolder: outputFolder
    });

    await generator.generateTypingsAsync(['child.schema.json', 'parent.schema.json']);
    const [parentTypings, childTypings]: string[] = await Promise.all([
      readGeneratedTypings('parent.schema.json'),
      readGeneratedTypings('child.schema.json')
    ]);

    expect(childTypings).toMatchSnapshot('child output');
    expect(parentTypings).toMatchSnapshot('parent output');

    // The parent typings should reference the child type
    expect(parentTypings).toContain('ChildType');
  });

  it('strips the $schema property from generated typings', async () => {
    const generator = new JsonSchemaTypingsGenerator({
      srcFolder: schemasFolder,
      generatedTsFolder: outputFolder
    });

    await generator.generateTypingsAsync(['with-schema-field.schema.json']);
    const typings: string = await readGeneratedTypings('with-schema-field.schema.json');
    expect(typings).toMatchSnapshot();
    expect(typings).not.toContain('$schema');
  });

  it('succeeds with includeSchemaMetadata enabled', async () => {
    const generator = new JsonSchemaTypingsGenerator({
      srcFolder: schemasFolder,
      generatedTsFolder: outputFolder,
      includeSchemaMetadata: true
    });

    await generator.generateTypingsAsync(['with-schema-field.schema.json']);
    const typings: string = await readGeneratedTypings('with-schema-field.schema.json');
    expect(typings).toMatchSnapshot();
  });
});
