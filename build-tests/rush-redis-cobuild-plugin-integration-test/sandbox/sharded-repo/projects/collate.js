/* eslint-env es6 */
const path = require('path');
const { FileSystem, Async } = require('@rushstack/node-core-library');

const args = process.argv.slice(2);

const getArgument = (argumentName) => {
  const index = args.findIndex((e) => e.includes(argumentName));
  return index >= 0 ? args[index].replace(`${argumentName}=`, '') : undefined;
};

const parentFolder = getArgument('--shard-parent-folder');
const shards = +getArgument('--shard-count');

async function runAsync() {
  await Async.sleepAsync(500);

  let output = '';
  for (let i = 1; i <= shards; i++) {
    const outputFolder = path.resolve(parentFolder, `${i}`);
    const outputFile = path.resolve(outputFolder, 'output.txt');
    FileSystem.ensureFolder(outputFolder);
    output += FileSystem.readFile(outputFile, 'utf-8');
    output += '\n';
  }
  const finalOutputFolder = path.resolve('coverage');
  const outputFile = path.resolve(finalOutputFolder, 'output.txt');
  FileSystem.writeFile(outputFile, output, { ensureFolderExists: true });
}

void runAsync().catch((err) => {
  console.warn(err);
  process.exit(1);
});
