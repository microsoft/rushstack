import * as child_process from 'child_process';
import { once } from 'events';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';

import * as prettier from 'prettier';

import type { IPackageJson } from '@rushstack/node-core-library';

// If specified, format files that have been changed since the specified revision
const revisionIndex: number = process.argv.indexOf('--since');
// If true, report errors to Azure DevOps for mismatches, but don't update the index
const check: boolean = process.argv.includes('--check');
// If true, silence all non-essential logging, e.g. for use in pre-commit hook
const isInQuietMode: boolean = process.argv.includes('--quiet');
// If true (default), mirror the index back to the working tree. Disabled if --check.
const syncWorkingTree: boolean = !process.argv.includes('--no-sync') && !check;

process.exitCode = 1;

/* eslint-disable no-console */

const revision: string = revisionIndex < 0 ? 'HEAD' : process.argv[revisionIndex + 1];
if (!revision) {
  console.error(
    `Usage: node apps/prettier-git/prettier-git.js [--since <rev>] [--check] [--quiet] [--no-sync]\n` +
      `For pre-commit, do: node apps/prettier-git/prettier-git.js --quiet\n` +
      `To format files, do: node apps/prettier-git/prettier-git.js`
  );
  process.exit(1);
}

const prettierPackageJson: IPackageJson = require('prettier/package.json');
const prettierVersion: string = prettierPackageJson.version;

if (!isInQuietMode) {
  console.log(`Using prettier@${prettierVersion}`);
}

const targetRef: string | undefined = process.env.SYSTEM_PULLREQUEST_TARGETBRANCH;
const revisionForError: string = targetRef ? targetRef.replace('refs/heads/', 'origin/') : revision;

const mergeRevision: string = /^HEAD(?:~\d+|$)/.test(revision) ? revision : getMergeBase(revision);
const tip: string = getTipOfBranch(revision);

if (!isInQuietMode) {
  console.log(`Target revision specifier: ${revision}`);
  console.log(`Target commit: ${tip}`);
  if (revision !== mergeRevision) {
    console.log(`Base commit: ${mergeRevision}`);
  }
}

function getTipOfBranch(branch: string): string {
  const revParseResult: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
    'git',
    ['--no-optional-locks', 'rev-parse', branch],
    {
      encoding: 'utf-8'
    }
  );
  return revParseResult.stdout.trim();
}

function getMergeBase(branch: string): string {
  /**
   * @see https://git-scm.com/docs/git-merge-base
   */
  const mergeBaseResult: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
    'git',
    ['--no-optional-locks', 'merge-base', 'HEAD', branch],
    { encoding: 'utf-8' }
  );
  return mergeBaseResult.stdout.trim();
}

const fixInstructions: string =
  revision === 'HEAD'
    ? `Run "rush prettier" and commit the staged changes to fix.`
    : `Rebase your branch onto latest ${revisionForError} (or merge) then run "rush prettier --since ${revisionForError}" and commit the staged changes to fix.`;

interface IFileInfo {
  /**
   * The file mode of the new file version
   */
  mode: string;

  /**
   * The git hash of the file
   */
  hash: string;

  /**
   * True if the file is staged, false if it is just the working tree
   */
  staged: boolean;

  /**
   * True if the staged version matches the working tree
   */
  fullyStaged: boolean;
}

interface IFileWithContents {
  /**
   * The path to the file, as known to Git
   */
  filePath: string;

  /**
   * Other metadata about the file, for writing the index
   */
  metadata: IFileInfo;

  /**
   * The content of the file, as known to Git
   */
  content: string;
}

// This is the null hash, for unstaged files
const ZERO_HASH: string = '0'.repeat(40);
/**
 * Reads the diff between the git index or working tree and the target revision
 * @see https://git-scm.com/docs/git-diff-index
 *
 * @param cached - If true, ignore files on disk and use only the git index
 * @param shouldIgnoreFile - Function to determine to ignore the file
 */
async function readIndexDiff(
  cached: boolean,
  shouldIgnoreFile: (filePath: string) => boolean,
  quiet: boolean
): Promise<Map<string, IFileInfo>> {
  const result: Map<string, IFileInfo> = new Map();

  const diffIndexProcess: child_process.ChildProcessWithoutNullStreams = child_process.spawn('git', [
    '--no-optional-locks',
    'diff-index',
    '--color=never',
    '--no-renames',
    '--no-commit-id',
    ...(cached ? ['--cached'] : []),
    '-z',
    mergeRevision,
    '--'
  ]);

  diffIndexProcess.stderr.setEncoding('utf-8');
  diffIndexProcess.stderr.on('data', (data) => {
    console.error(`Error in git diff-index: `, data);
  });

  // This is equivalent to having used spawnSync except doesn't block
  let output: string = '';
  const decoder: StringDecoder = new StringDecoder('utf-8');
  for await (const data of diffIndexProcess.stdout) {
    output += decoder.write(data);
  }
  output += decoder.end();

  // Parse the output
  // With the -z modifier, paths are delimited by nulls
  // A line looks like:
  // :<oldmode> <newmode> <oldhash> <newhash> <status>\0<path>\0
  // :100644 100644 a300ccb0b36bd2c85ef18e3c619a2c747f95959e 0000000000000000000000000000000000000000 M\0tools/prettier-git/prettier-git.js\0

  let last: number = 0;
  let index: number = output.indexOf('\0', last);
  while (index >= 0) {
    const header: string = output.slice(last, index);
    const status: string = header.slice(-1);
    last = index + 1;
    index = output.indexOf('\0', last);
    const filePath: string = output.slice(last, index);
    if (shouldIgnoreFile(filePath)) {
      // Skip emitting files for processing early
      if (!quiet) {
        console.log(`Ignoring: ${filePath}`);
      }
    } else if (status === 'A' || status === 'M') {
      // We only care about files that were added or modified, since deleted files don't need formatting.
      // We passed --no-renames above, so a rename will be a delete of the old location and an add at the new.
      // The newHash will be all zeros if the file is unstaged, or a hash if it is staged
      const mode: string = header.slice(8, 14);
      const newHash: string = header.slice(56, 96);
      const staged: boolean = newHash !== ZERO_HASH;
      if (!quiet) {
        console.log(`Checking: ${filePath}`);
      }

      result.set(filePath, {
        mode,
        hash: newHash,
        staged,
        // This value is used when `cached` and `clean` are both set, so that we don't reset partially staged files
        fullyStaged: staged
      });
    }
    last = index + 1;
    index = output.indexOf('\0', last);
  }

  await once(diffIndexProcess, 'close');

  return result;
}

/**
 * Iterates over the file map and yields entries with file contents for formatting.
 * Uses a single batch invocation of `git cat-file` to reduce overhead of starting processes.
 */
async function* readFileContents(fileMap: Map<string, IFileInfo>): AsyncIterableIterator<IFileWithContents> {
  for (const [filePath, metadata] of fileMap) {
    const catFileProcess: child_process.ChildProcessWithoutNullStreams = child_process.spawn('git', [
      '--no-optional-locks',
      'cat-file',
      'blob',
      metadata.hash
    ]);

    catFileProcess.stderr.setEncoding('utf-8');
    catFileProcess.stderr.on('data', (data) => {
      console.error(`Error in git cat-file: ${data.toString()}`);
    });

    // This is equivalent to having used spawnSync except doesn't block
    let content: string = '';
    const decoder: StringDecoder = new StringDecoder('utf-8');
    for await (const data of catFileProcess.stdout) {
      content += decoder.write(data);
    }
    content += decoder.end();

    await once(catFileProcess, 'close');

    yield {
      filePath,
      metadata,
      content
    };
  }
}

function showDiff(filePath: string, formatted: string): number {
  // Checkout the files in the index to the working tree
  const contextLines: number = 3;
  const diffProcess: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
    'git',
    [
      '--no-optional-locks',
      'diff',
      '--no-index',
      '--minimal',
      '--color=always',
      `--src-prefix=original/`,
      `--dst-prefix=prettier/`,
      `--unified=${contextLines}`,
      '--',
      filePath,
      '-'
    ],
    {
      input: formatted,
      encoding: 'utf-8'
    }
  );
  const output: string = diffProcess.stdout.toString();
  const diffLine: string[] = /@@\s+[-](\d+),(\d+)/.exec(output)!;
  let affectedLine: number = Number(diffLine[1]);
  const lineCount: number = Number(diffLine[2]);

  // Compensate for the context (imperfect at start of file)
  affectedLine += Math.min(contextLines, lineCount - contextLines - 1);

  console.log(output);
  return affectedLine;
}

(async () => {
  interface IPrettierIgnorer {
    ignores(filePath: string): boolean;
  }

  interface IPrettierInternal {
    __internal: {
      createIgnorer(ignorePath: string, withNodeModules: boolean): IPrettierIgnorer;
    };
  }
  const ignorer: IPrettierIgnorer = await (prettier as unknown as IPrettierInternal).__internal.createIgnorer(
    path.resolve(process.cwd(), '.prettierignore'),
    false
  );
  const shouldIgnoreFile: (filePath: string) => boolean = (filePath) => ignorer.ignores(filePath);

  const fileMap: Map<string, IFileInfo> = await readIndexDiff(true, shouldIgnoreFile, isInQuietMode);
  if (syncWorkingTree) {
    // If asked to sync the working tree, we need to know if files are fully staged or not
    // We do this by comparing the staged-only diff to the working tree diff
    const partialMeta: Map<string, IFileInfo> = await readIndexDiff(false, shouldIgnoreFile, true);
    for (const [filePath, item] of partialMeta) {
      const entry: IFileInfo | undefined = fileMap.get(filePath);
      if (entry && !item.staged) {
        entry.fullyStaged = false;
      }
    }
  }

  const indexInfoLines: string[] = [];
  const filesToClean: string[] = [];
  let checkFailed: boolean = false;
  let hasErrors: boolean = false;

  const configPath: string = path.resolve(process.cwd(), '.prettierrc.js');

  for await (const file of readFileContents(fileMap)) {
    const { filePath, metadata, content } = file;

    try {
      const prettierConfig: prettier.Options | null = await prettier.resolveConfig(filePath, {
        config: configPath
      });

      const formatted: string = prettier.format(content, {
        ...prettierConfig,
        filepath: filePath
      });

      if (formatted !== content) {
        if (check) {
          checkFailed = true;

          const firstLine: number = showDiff(filePath, formatted);

          // Surface the formatting issue in Azure DevOps PR view
          console.error(
            `##vso[task.logissue type=error;sourcepath=${filePath};linenumber=${firstLine}]${fixInstructions}`
          );
        } else {
          // If prettier touched the file, get the needed data to update the Git index
          // Unfortunately there's no batch version of this call without writing to disk
          // So call once per file
          /**
           * @see https://git-scm.com/docs/git-hash-object
           */
          const hashResult: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
            'git',
            ['--no-optional-locks', 'hash-object', '-w', '--stdin', '--path', filePath],
            { encoding: 'utf-8', input: formatted }
          );
          const newHash: string = hashResult.stdout.trim();
          indexInfoLines.push(`${metadata.mode} blob ${newHash}\t${filePath}`);

          if (metadata.fullyStaged) {
            // Only safe to sync if the file was fully staged, otherwise unstaged edits will get reverted
            filesToClean.push(filePath);
          }
        }
      }
    } catch (e) {
      const error: Error = e as Error;
      if (check) {
        console.error(`##vso[task.logissue type=error;sourcepath=${filePath}]${error.message}`);
      } else {
        console.error(`Error parsing '${filePath}': ${error.message}`);
      }
      hasErrors = true;
    }
  }

  if (indexInfoLines.length) {
    // We have files to update in the git index, push the updates
    if (!isInQuietMode) {
      console.log(`Updating ${indexInfoLines.length} ${indexInfoLines.length === 1 ? 'file' : 'files'}`);
    }
    const indexInfo: string = indexInfoLines.join('\n');
    /** @see https://git-scm.com/docs/git-update-index */
    const result: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
      'git',
      ['update-index', '--index-info'],
      {
        input: indexInfo,
        encoding: 'utf-8'
      }
    );

    if (result.status) {
      throw result.stderr;
    }
  }

  if (syncWorkingTree) {
    // We were asked to keep the working tree in sync with the index
    if (filesToClean.length) {
      // Clean working tree for any files we updated
      if (!isInQuietMode) {
        console.log(
          `Reverting ${filesToClean.length} ${
            filesToClean.length === 1 ? 'file' : 'files'
          } in working tree to match the index.`
        );
      }
      // Checkout the files in the index to the working tree
      const cleanFiles: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
        'git',
        ['checkout-index', '--stdin', '-f'],
        {
          input: filesToClean.join('\n'),
          encoding: 'utf-8'
        }
      );

      if (cleanFiles.status) {
        throw cleanFiles.status;
      }
    }
  }

  if (!isInQuietMode) {
    console.log(`Finished checking ${fileMap.size} ${fileMap.size === 1 ? 'file' : 'files'}`);
  }

  if (hasErrors) {
    // Tell Azure DevOps that the verification task failed.
    console.error(
      `##vso[task.complete result=Failed;]One or more files could not be formatted. Please fix them manually.`
    );
    return;
  }

  if (checkFailed) {
    // Tell Azure DevOps that the verification task failed.
    console.error(`##vso[task.complete result=Failed;]${fixInstructions}`);
  }

  if (mergeRevision !== revision && mergeRevision !== tip && !isInQuietMode) {
    console.warn(
      `\x1b[33m\nWARNING: Current branch is behind ${revision}. Merge base is ${mergeRevision} but latest commit is ${tip}.` +
        `\nIf your PR has prettier formatting issues, you will need to rebase onto (or merge with) latest ${revision}.\x1b[0m`
    );
  }

  // Exit with code 0 if no exceptions occurred.
  process.exitCode = 0;
})().catch((err) => {
  console.error(`ERROR: `, err);
  process.exit(1);
});
