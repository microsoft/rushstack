// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { compile } from 'json-schema-to-typescript';

import { type ITypingsGeneratorBaseOptions, TypingsGenerator } from '@rushstack/typings-generator';

import {
  _addTsDocReleaseTagToExports,
  _validateTsDocReleaseTag,
  X_TSDOC_RELEASE_TAG_KEY
} from './TsDocReleaseTagHelpers';

interface IJsonSchemaTypingsGeneratorBaseOptions extends ITypingsGeneratorBaseOptions {
  /**
   * If true, format generated typings with prettier.  Defaults to false.
   *
   * @remarks
   * Enabling this requires the `prettier` package to be installed as a dependency.
   */
  formatWithPrettier?: boolean;

  /**
   * If true, include the `$schema` property in the generated typings.  Defaults to false.
   *
   * @remarks
   * By default, the `$schema` metadata property is stripped from the JSON schema before
   * generating TypeScript declarations so that it does not appear as a field in the
   * emitted types.  Set this to `true` if you need the `$schema` property to be
   * part of the generated interface.
   */
  includeSchemaMetadata?: boolean;
}

const SCHEMA_FILE_EXTENSION: '.schema.json' = '.schema.json';

type Json4Schema = Parameters<typeof compile>[0];
interface IExtendedJson4Schema extends Json4Schema {
  [X_TSDOC_RELEASE_TAG_KEY]?: string;
}

export class JsonSchemaTypingsGenerator extends TypingsGenerator {
  public constructor(options: IJsonSchemaTypingsGeneratorBaseOptions) {
    const { formatWithPrettier = false, includeSchemaMetadata = false, ...otherOptions } = options;
    super({
      ...otherOptions,
      fileExtensions: [SCHEMA_FILE_EXTENSION],
      // eslint-disable-next-line @typescript-eslint/naming-convention
      parseAndGenerateTypings: async (
        fileContents: string,
        filePath: string,
        relativePath: string
      ): Promise<string> => {
        const parsedFileContents: IExtendedJson4Schema = JSON.parse(fileContents);
        const { [X_TSDOC_RELEASE_TAG_KEY]: tsdocReleaseTag, ...jsonSchemaWithoutReleaseTag } =
          parsedFileContents;

        // Unless includeSchemaMetadata is true, strip $schema from the schema's
        // "properties" object so it doesn't appear as a field in the generated types.
        const schemaForCompilation: Json4Schema = jsonSchemaWithoutReleaseTag;
        if (!includeSchemaMetadata && schemaForCompilation.properties) {
          const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            $schema,
            ...otherProperties
          } = schemaForCompilation.properties;
          schemaForCompilation.properties = otherProperties;
        }

        // Use the absolute directory of the schema file so that cross-file $ref
        // (e.g. { "$ref": "./other.schema.json" }) resolves correctly.
        const dirname: string = path.dirname(filePath);
        const filenameWithoutExtension: string = filePath.slice(
          dirname.length + 1,
          -SCHEMA_FILE_EXTENSION.length
        );
        let typings: string = await compile(schemaForCompilation, filenameWithoutExtension, {
          // The typings generator adds its own banner comment
          bannerComment: '',
          cwd: dirname,
          format: formatWithPrettier
        });

        // Check for an "x-tsdoc-release-tag" property in the schema (e.g. "@public" or "@beta").
        // If present, inject the tag into JSDoc comments for all exported declarations.
        if (tsdocReleaseTag) {
          _validateTsDocReleaseTag(tsdocReleaseTag, relativePath);
          typings = _addTsDocReleaseTagToExports(typings, tsdocReleaseTag);
        }

        return typings;
      }
    });
  }
}
