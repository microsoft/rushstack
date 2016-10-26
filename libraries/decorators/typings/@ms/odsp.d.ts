// Type definitions for Microsoft ODSP projects
// Project: ODSP

/// <reference path="odsp-webpack.d.ts" />

/* Global definition for DEBUG builds */
declare const DEBUG: boolean;

/* Global definition for UNIT_TEST builds */
declare const UNIT_TEST: boolean;

/**
 * Default TypeScript typings have an incomplete definition of the Error interface.
 * Issue link: https://github.com/Microsoft/TypeScript/issues/8582
 */
interface Error {
  stack?: string;
}