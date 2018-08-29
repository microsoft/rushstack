// Type definitions for wordwrap 1.0.0
// Project: https://www.npmjs.com/package/wordwrap
// Definitions by: pgonzal

declare module 'wordwrap' {
    namespace wrap {
      export function hard(start: number, stop: number): (textToWrap: string) => string;
      export function hard(stop: number): (textToWrap: string) => string;

      export function soft(start: number, stop: number): (textToWrap: string) => string;
      export function soft(stop: number): (textToWrap: string) => string;
    }

    export = wrap;
}
