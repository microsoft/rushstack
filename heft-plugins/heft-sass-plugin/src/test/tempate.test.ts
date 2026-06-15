// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import schema from '../schemas/heft-sass-plugin.schema.json';
import type { ISassConfigurationJson } from '../SassPlugin';

describe('sass.json template', () => {
  it('should match the schema', async () => {
    const templateText: string = await FileSystem.readFileAsync(`${__dirname}/../templates/sass.json`);
    let uncommentedTemplateText: string = templateText.replace(/$\s*\/\/\s*/gm, '');
    uncommentedTemplateText = uncommentedTemplateText.replace('"extends":', ',"extends":');
    const template: ISassConfigurationJson = JsonFile.parseString(uncommentedTemplateText);
    const jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schema);
    expect(() => jsonSchema.validateObject(template, `${__dirname}/../templates/sass.json`)).not.toThrow();
  });
});
