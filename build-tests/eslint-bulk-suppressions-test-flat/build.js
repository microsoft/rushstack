// This project has a duplicate "eslint-bulk-suppressions-test-legacy" intended to test eslint
// against the older version of the TypeScript parser. Any modifications made to this project
// should be reflected in "eslint-bulk-suppressions-test-legacy" as well.

const { FileSystem, Executable, Text, Import } = require('@rushstack/node-core-library');
const path = require('path');
const {
  ESLINT_PACKAGE_NAME_ENV_VAR_NAME
} = require('@rushstack/eslint-patch/lib/eslint-bulk-suppressions/constants');

const eslintBulkStartPath = Import.resolveModule({
  modulePath: '@rushstack/eslint-bulk/lib-commonjs/start',
  baseFolderPath: __dirname
});

function tryLoadSuppressions(suppressionsJsonPath) {
  try {
    return Text.convertToLf(FileSystem.readFile(suppressionsJsonPath)).trim();
  } catch (e) {
    if (FileSystem.isNotExistError(e)) {
      return '';
    } else {
      throw e;
    }
  }
}

const RUN_FOLDER_PATHS = ['client', 'server'];
const ESLINT_PACKAGE_NAMES = ['eslint'];

const updateFilePaths = new Set();

for (const runFolderPath of RUN_FOLDER_PATHS) {
  const folderPath = `${__dirname}/${runFolderPath}`;
  const suppressionsJsonPath = `${folderPath}/.eslint-bulk-suppressions.json`;

  const folderItems = FileSystem.readFolderItems(folderPath);
  for (const folderItem of folderItems) {
    if (folderItem.isFile() && folderItem.name.match(/^\.eslint\-bulk\-suppressions\-[\d.]+\.json$/)) {
      const fullPath = `${folderPath}/${folderItem.name}`;
      updateFilePaths.add(fullPath);
    }
  }

  for (const eslintPackageName of ESLINT_PACKAGE_NAMES) {
    const { version: eslintVersion } = require(`${eslintPackageName}/package.json`);

    const startLoggingMessage = `-- Running eslint-bulk-suppressions for eslint@${eslintVersion} in ${runFolderPath} --`;
    console.log(startLoggingMessage);
    const referenceSuppressionsJsonPath = `${folderPath}/.eslint-bulk-suppressions-${eslintVersion}.json`;
    const existingSuppressions = tryLoadSuppressions(referenceSuppressionsJsonPath);

    // The eslint-bulk-suppressions patch expects to find "eslint" in the shell PATH.  To ensure deterministic
    // test behavior, we need to designate an explicit "node_modules/.bin" folder.
    //
    // Use the ".bin" folder from @rushstack/eslint-patch as a workaround for this PNPM bug:
    // https://github.com/pnpm/pnpm/issues/7833
    const dependencyBinFolder = path.join(
      __dirname,
      'node_modules',
      '@rushstack',
      'eslint-patch',
      'node_modules',
      '.bin'
    );
    const shellPathWithEslint = `${dependencyBinFolder}${path.delimiter}${process.env['PATH']}`;

    const args = [eslintBulkStartPath, 'suppress', '--all', 'src'];
    const executableResult = Executable.spawnSync(process.argv0, args, {
      currentWorkingDirectory: folderPath,
      environment: {
        ...process.env,
        PATH: shellPathWithEslint,
        [ESLINT_PACKAGE_NAME_ENV_VAR_NAME]: eslintPackageName
      }
    });

    if (executableResult.status !== 0) {
      console.error(
        `The eslint-bulk-suppressions command (\`node ${args.join(' ')}\` in ${folderPath}) failed.`
      );
      console.error('STDOUT:');
      console.error(executableResult.stdout.toString());
      console.error('STDERR:');
      console.error(executableResult.stderr.toString());
      process.exit(1);
    }

    const newSuppressions = tryLoadSuppressions(suppressionsJsonPath);
    if (newSuppressions === existingSuppressions) {
      updateFilePaths.delete(referenceSuppressionsJsonPath);
    } else {
      updateFilePaths.add(referenceSuppressionsJsonPath);
      FileSystem.writeFile(referenceSuppressionsJsonPath, newSuppressions);
    }

    FileSystem.deleteFile(suppressionsJsonPath);
  }
}

if (updateFilePaths.size > 0) {
  for (const updateFilePath of updateFilePaths) {
    console.log(`The suppressions file "${updateFilePath}" was updated and must be committed to git.`);
  }

  process.exit(1);
}
