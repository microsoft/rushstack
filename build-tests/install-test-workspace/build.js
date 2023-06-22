const path = require('path');
const { RushConfiguration } = require('@microsoft/rush-lib');
const { Executable, FileSystem, JsonFile } = require('@rushstack/node-core-library');

function collect(project) {
  if (allDependencyProjects.has(project)) {
    return;
  }
  allDependencyProjects.add(project);

  for (const dependencyProject of project.dependencyProjects) {
    collect(dependencyProject);
  }
}

function checkSpawnResult(result, commandName) {
  if (result.status !== 0) {
    if (result.stderr) {
      console.error('-----------------------');
      console.error(result.stderr);
      console.error('-----------------------');
    } else {
      if (result.stdout) {
        console.error('-----------------------');
        console.error(result.stdout);
        console.error('-----------------------');
      }
    }
    throw new Error(`Failed to execute command "${commandName}"`);
  }
}

process.exitCode = 1;

const productionMode = process.argv.indexOf('--production') >= 0;
const skipPack = process.argv.indexOf('--skip-pack') >= 0;

const rushConfiguration = RushConfiguration.loadFromDefaultLocation();
const currentProject = rushConfiguration.tryGetProjectForPath(__dirname);
if (!currentProject) {
  throw new Error('Cannot find current project');
}

const allDependencyProjects = new Set();
collect(currentProject);

const tarballFolder = path.join(__dirname, 'temp/tarballs');

if (!skipPack) {
  FileSystem.ensureEmptyFolder(tarballFolder);

  const tarballsJson = {};

  for (const project of allDependencyProjects) {
    if (project.versionPolicy || project.shouldPublish) {
      console.log('Invoking "pnpm pack" in ' + project.publishFolder);

      const packageJsonFilename = path.join(project.projectFolder, 'package.json');
      const packageJson = FileSystem.readFile(packageJsonFilename);

      let result;

      try {
        result = Executable.spawnSync(rushConfiguration.packageManagerToolFilename, ['pack'], {
          currentWorkingDirectory: project.publishFolder,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } finally {
        // This is a workaround for an issue where "pnpm pack" modifies the project's package.json file
        // before invoking "npm pack", and then does not restore it afterwards.
        try {
          FileSystem.writeFile(packageJsonFilename, packageJson);
        } catch (error) {
          console.error('Error restoring ' + packageJsonFilename);
        }
      }
      checkSpawnResult(result, 'pnpm pack');
      const tarballFilename = result.stdout.trimRight().split().pop().trim();
      if (!tarballFilename) {
        throw new Error('Failed to parse "pnpm pack" output');
      }
      const tarballPath = path.join(project.publishFolder, tarballFilename);
      if (!FileSystem.exists(tarballPath)) {
        throw new Error('Expecting a tarball: ' + tarballPath);
      }

      tarballsJson[project.packageName] = tarballFilename;

      const targetPath = path.join(tarballFolder, tarballFilename);
      FileSystem.move({
        sourcePath: tarballPath,
        destinationPath: targetPath,
        overwrite: true
      });
    }
  }

  JsonFile.save(tarballsJson, path.join(tarballFolder, 'tarballs.json'));
}

// Look for folder names like this:
//   local+C++Git+rushstack+build-tests+install-test-wo_7efa61ad1cd268a0ef451c2450ca0351
//
// This caches the tarball contents, ignoring the integrity hashes.
const dotPnpmFolderPath = path.resolve(__dirname, 'workspace/node_modules/.pnpm');

console.log('\nCleaning cached tarballs...');
if (FileSystem.exists(dotPnpmFolderPath)) {
  for (const filename of FileSystem.readFolderItemNames(dotPnpmFolderPath)) {
    if (filename.startsWith('local+')) {
      const filePath = path.join(dotPnpmFolderPath, filename);
      console.log('  Deleting ' + filePath);
      FileSystem.deleteFolder(filePath);
    }
  }
}

const pnpmLockBeforePath = path.join(__dirname, 'workspace/common/pnpm-lock.yaml');
const pnpmLockAfterPath = path.join(__dirname, 'workspace/pnpm-lock.yaml');
let pnpmLockBeforeContent = '';

if (FileSystem.exists(pnpmLockBeforePath)) {
  pnpmLockBeforeContent = FileSystem.readFile(pnpmLockBeforePath).toString().replace(/\s+/g, ' ').trim();
  FileSystem.copyFile({
    sourcePath: pnpmLockBeforePath,
    destinationPath: pnpmLockAfterPath,
    alreadyExistsBehavior: 'overwrite'
  });
} else {
  pnpmLockBeforeContent = '';
  FileSystem.deleteFile(pnpmLockAfterPath);
}

const pnpmInstallArgs = [
  'install',
  '--store',
  rushConfiguration.pnpmOptions.pnpmStorePath,
  '--strict-peer-dependencies',
  '--recursive',
  '--link-workspace-packages=false',
  // PNPM gets confused by the rewriting performed by our .pnpmfile.cjs afterAllResolved hook
  '--frozen-lockfile=false'
];

console.log('\nInstalling:');
console.log('  pnpm ' + pnpmInstallArgs.join(' '));

checkSpawnResult(
  Executable.spawnSync(rushConfiguration.packageManagerToolFilename, pnpmInstallArgs, {
    currentWorkingDirectory: path.join(__dirname, 'workspace'),
    stdio: 'inherit'
  }),
  'pnpm install'
);

// Now compare the before/after
const pnpmLockAfterContent = FileSystem.readFile(pnpmLockAfterPath).toString().replace(/\s+/g, ' ').trim();

let shrinkwrapUpdatedNotice = false;

if (pnpmLockBeforeContent !== pnpmLockAfterContent) {
  if (productionMode) {
    // TODO: Re-enable when issue with lockfile diffing is resolved
    // console.error('The shrinkwrap file is not up to date:');
    // console.error('  Git copy:     ' + pnpmLockBeforePath);
    // console.error('  Current copy: ' + pnpmLockAfterPath);
    // console.error('\nPlease commit the updated copy to Git\n');
    // process.exitCode = 1;
    // return;
  } else {
    // Automatically update the copy
    FileSystem.copyFile({
      sourcePath: pnpmLockAfterPath,
      destinationPath: pnpmLockBeforePath,
      alreadyExistsBehavior: 'overwrite'
    });

    // Show the notice at the very end
    shrinkwrapUpdatedNotice = true;
  }
}

console.log('\n\nInstallation completed successfully.');

console.log('\nBuilding projects...\n');

checkSpawnResult(
  Executable.spawnSync(rushConfiguration.packageManagerToolFilename, ['run', '--recursive', 'build'], {
    currentWorkingDirectory: path.join(__dirname, 'workspace'),
    stdio: 'inherit'
  }),
  'pnpm run'
);

if (shrinkwrapUpdatedNotice) {
  console.error('\n==> The shrinkwrap file has been updated.  Please commit the changes to Git:');
  console.error(`  ${pnpmLockBeforePath}`);
}

console.log('\n\nFinished build.js');

process.exitCode = 0;
