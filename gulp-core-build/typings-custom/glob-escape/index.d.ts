// Type definitions for glob-escape 0.0.1
// Definitions by: pgonzal

declare module "glob-escape" {

  function escapeGlob(glob: string): string;
  function escapeGlob(glob: string[]): string[];

  export = escapeGlob;
}
