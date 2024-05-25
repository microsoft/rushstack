/* eslint-env es6 */
const path = require('path');
const { FileSystem, Async } = require('@rushstack/node-core-library');

const args = process.argv.slice(2);

const getArgument = (argumentName) => {
  const index = args.findIndex((e) => e.includes(argumentName));
  return index >= 0 ? args[index].replace(`${argumentName}=`, '') : undefined;
};

const shard = getArgument('--shard');

const outputDir = getArgument('--output-directory');

const shardOutputDir = getArgument('--shard-output-directory');

const outputDirectory = shard ? (shardOutputDir ? shardOutputDir : outputDir) : undefined;

async function runAsync() {
  await Async.sleepAsync(500);
  const outputFolder = shard ? path.resolve(outputDirectory) : path.resolve('dist');
  const outputFile = path.resolve(outputFolder, 'output.txt');
  FileSystem.writeFile(outputFile, `Hello world! ${args.join(' ')}`, { ensureFolderExists: true });
}

void runAsync().catch((err) => {
  console.warn(err);
  process.exit(1);
});
