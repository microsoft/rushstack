// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonSchema } from "@microsoft/node-core-library";
import * as lodash from 'lodash';

export class Constants {
  public static LOC_JSON_SCHEMA: JsonSchema = JsonSchema.fromFile(
    path.resolve(__dirname, '..', 'schemas', 'locJson.schema.json')
  );

  public static LOCALE_FILENAME_PLACEHOLDER: string = '[locale]';
  public static LOCALE_FILENAME_PLACEHOLDER_REGEX: RegExp = new RegExp(
    lodash.escapeRegExp(Constants.LOCALE_FILENAME_PLACEHOLDER),
    'gi'
  );
  public static STRING_PLACEHOLDER_PREFIX: string = '_LOCALIZED_STRING_f12dy0i7_n4bo_dqwj_39gf_sasqehjmihz9';

  public static RESX_REGEX: RegExp = /\.resx$/i;
  public static LOC_JSON_REGEX: RegExp = /\.loc\.json$/i;
  public static RESX_OR_LOC_JSON_REGEX: RegExp = /\.(resx|loc\.json)$/i;
}
