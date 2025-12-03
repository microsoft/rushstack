// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const LOCALE_FILENAME_TOKEN: '[locale]' = '[locale]';
export const LOCALE_FILENAME_TOKEN_REGEX: RegExp = /\[locale\]/gi;
export const NO_LOCALE_SOURCE_MAP_FILENAME_TOKEN: '[no-locale-file]' = '[no-locale-file]';
export const NO_LOCALE_SOURCE_MAP_FILENAME_TOKEN_REGEX: RegExp = /\[no-locale-file\]/gi;
export const STRING_PLACEHOLDER_PREFIX: '_LOCALIZED_STRING_f12dy0i7_n4bo_dqwj_39gf_sasqehjmihz9' =
  '_LOCALIZED_STRING_f12dy0i7_n4bo_dqwj_39gf_sasqehjmihz9';

export const RESOURCE_FILE_NAME_REGEXP: RegExp = /\.(resx|resx\.json|loc\.json|resjson)$/i;

export const STRING_PLACEHOLDER_LABEL: 'A' = 'A';
export const LOCALE_NAME_PLACEHOLDER_LABEL: 'B' = 'B';
export const JSONP_PLACEHOLDER_LABEL: 'C' = 'C';
export const CUSTOM_PLACEHOLDER_LABEL: 'D' = 'D';

// _LOCALIZED_STRING_f12dy0i7_n4bo_dqwj_39gf_sasqehjmihz9_B_
export const LOCALE_NAME_PLACEHOLDER: `${typeof STRING_PLACEHOLDER_PREFIX}_${typeof LOCALE_NAME_PLACEHOLDER_LABEL}_` = `${STRING_PLACEHOLDER_PREFIX}_${LOCALE_NAME_PLACEHOLDER_LABEL}_`;

// _LOCALIZED_STRING_f12dy0i7_n4bo_dqwj_39gf_sasqehjmihz9_C_
export const JSONP_PLACEHOLDER: `${typeof STRING_PLACEHOLDER_PREFIX}_${typeof JSONP_PLACEHOLDER_LABEL}_` = `${STRING_PLACEHOLDER_PREFIX}_${JSONP_PLACEHOLDER_LABEL}_`;
