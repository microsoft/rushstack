// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonSchema } from "@microsoft/node-core-library";

export class Constants {
  public static LOC_JSON_SCHEMA: JsonSchema = JsonSchema.fromFile(
    path.resolve(__dirname, '..', 'schemas', 'locJson.schema.json')
  );
}
