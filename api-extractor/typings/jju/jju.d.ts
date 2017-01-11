// Type definitions for jju 1.3.0
// Project: https://www.npmjs.com/package/jju
// Definitions by: pgonzal

interface IJjuOptions {
  reserved_keys? : 'ignore' | 'throw' | 'replace';
  mode?: 'json';
  reviver?: (key: any, value: any) => any;
}

declare module 'jju' {
  export function parse(text: string, options?: IJjuOptions): any;
}
