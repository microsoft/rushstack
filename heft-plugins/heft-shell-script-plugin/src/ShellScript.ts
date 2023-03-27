/**
 * @public
 */
export type WatchOptions = { watchGlobs: string[] } | { watchCommand: string };

/**
 * @public
 */
export type ShellScript = {
  name: string;
  stage: 'clean' | 'pre-compile' | 'compile' | 'bundle' | 'post-build' | 'pre-test' | 'test';
  command: string;
} & WatchOptions;
