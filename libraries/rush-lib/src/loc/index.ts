import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration';
import enStrings from './en.loc.json';

export type RushLibStrings = typeof enStrings;

// Don't load this via `EnvironmentConfiguration`. This is a static member, so it shouldn't
// call `EnvironmentConfiguration.validate()`.
const localeFromEnv: string | undefined = process.env[EnvironmentVariableNames.RUSH_LOCALE];

let translations: RushLibStrings | undefined;
switch (localeFromEnv) {
  case 'en':
  case undefined: {
    // Default - no translations
    break;
  }

  // Add additional locales here
  // case 'locale': {
  //   translations = require('./locale.loc.json');
  //   break;
  // }

  default: {
    console.warn(`Locale ${localeFromEnv} is not supported. Falling back to "en".`);
  }
}

/**
 * @remarks
 * This object should not be exported outside rush-lib.
 *
 * @internal
 */
export const strings: RushLibStrings = {
  ...translations,
  ...enStrings
};

export function getFilledCompositeString(stringValue: string, ...values: (string | number)[]): string {
  return stringValue.replace(/\{(\d+)\}/g, (substr, index) => values[index] as string);
}
