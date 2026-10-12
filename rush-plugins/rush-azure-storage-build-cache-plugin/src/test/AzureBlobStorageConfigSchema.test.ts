// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { JsonFile, JsonSchema, type JsonObject } from '@rushstack/node-core-library';

const PACKAGE_FOLDER: string = path.resolve(__dirname, '../..');
const PLUGIN_NAME: string = 'rush-azure-storage-build-cache-plugin';
const OPTIONS_FILE_PATH: string = `common/config/rush-plugins/${PLUGIN_NAME}.json`;
const PATTERN_ERROR: RegExp =
  /#\/storageEndpoint\s+must match pattern "\^\[Hh\]\[Tt\]\[Tt\]\[Pp\]\[Ss\]\?:\/\/"/;

interface IRushPluginManifestJson {
  plugins: { pluginName: string; optionsSchema?: string }[];
}

// Rush validates common/config/rush-plugins/<plugin>.json with the schema that the plugin's manifest names.
function loadOptionsSchema(): JsonSchema {
  const manifest: IRushPluginManifestJson = JsonFile.load(`${PACKAGE_FOLDER}/rush-plugin-manifest.json`);
  const optionsSchema: string | undefined = manifest.plugins.find(
    (plugin) => plugin.pluginName === PLUGIN_NAME
  )?.optionsSchema;
  if (!optionsSchema) {
    throw new Error(`The manifest names no optionsSchema for ${PLUGIN_NAME}`);
  }

  return JsonSchema.fromFile(path.join(PACKAGE_FOLDER, optionsSchema));
}

describe('the options schema of rush-azure-storage-build-cache-plugin', () => {
  let schema: JsonSchema;

  beforeAll(() => {
    schema = loadOptionsSchema();
  });

  function validate(storageEndpoint: string | undefined): void {
    const options: JsonObject = { storageAccountName: 'example', storageContainerName: 'build-cache' };
    if (storageEndpoint !== undefined) {
      options.storageEndpoint = storageEndpoint;
    }

    schema.validateObject(options, OPTIONS_FILE_PATH);
  }

  it.each([
    // "localhost:" parses as a URI scheme, so only the pattern catches this common mistake.
    { kind: 'no scheme', storageEndpoint: 'localhost:10000/devstoreaccount1' },
    { kind: 'another scheme', storageEndpoint: 'ftp://example.com/devstoreaccount1' },
    { kind: 'a scheme that only ends in https', storageEndpoint: 'git+https://example.com/devstoreaccount1' }
  ])('rejects a storageEndpoint with $kind', ({ storageEndpoint }) => {
    expect(() => validate(storageEndpoint)).toThrow(PATTERN_ERROR);
  });

  it('rejects a storageEndpoint that is not a URI', () => {
    expect(() => validate('http://127.0.0.1 port 10000')).toThrow(
      /#\/storageEndpoint\s+must match format "uri"/
    );
  });

  it.each([
    { kind: 'no storageEndpoint', storageEndpoint: undefined },
    { kind: 'an http storageEndpoint', storageEndpoint: 'http://127.0.0.1:10000/devstoreaccount1' },
    { kind: 'an https storageEndpoint', storageEndpoint: 'https://my-proxy.example.com/devstoreaccount1' },
    // URI schemes are case-insensitive, and Rush accepted this before the pattern existed.
    { kind: 'a storageEndpoint with an uppercase scheme', storageEndpoint: 'HTTP://127.0.0.1:10000/x' },
    { kind: 'a storageEndpoint with a mixed-case scheme', storageEndpoint: 'hTtPs://example.com/x' }
  ])('accepts $kind', ({ storageEndpoint }) => {
    expect(() => validate(storageEndpoint)).not.toThrow();
  });
});
