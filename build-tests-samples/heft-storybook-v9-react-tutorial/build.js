// TODO: Remove this and change the _phase:build script back to "heft run --only build -- --clean --storybook"
// when we drop support for Node 18

const { Executable, Import } = require('@rushstack/node-core-library');

const heftBinPath = Import.resolveModule({
  modulePath: '@rushstack/heft/bin/heft',
  baseFolderPath: __dirname
});

const heftArgs = [
  heftBinPath,
  'run',
  '--only',
  'build',
  '--',
  '--clean',
  ...(process.version.startsWith('v18.')
    ? [] // Under Node 18, don't run storybook
    : ['--storybook'])
];

const { signal, status } = Executable.spawnSync(process.argv0, heftArgs, {
  stdio: 'inherit',
  environment: process.env
});

if (signal) {
  process.kill(process.pid, signal);
} else {
  process.exit(status);
}
