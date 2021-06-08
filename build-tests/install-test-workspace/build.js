const path = require('path');
const { RushConfiguration } = require('@microsoft/rush-lib');
const { Executable, FileSystem, JsonFile } = require('@rushstack/node-core-library');

const rushConfiguration = RushConfiguration.loadFromDefaultLocation();
const currentProject = rushConfiguration.tryGetProjectForPath(__dirname);
if (!currentProject) {
  throw new Error('Cannot find current project');
}

const allDependencyProjects = new Set();
function collect(project) {
  if (allDependencyProjects.has(project)) {
    return;
  }
  allDependencyProjects.add(project);

  for (const dependencyProject of project.dependencyProjects) {
    collect(dependencyProject);
  }
}
collect(currentProject);

const tarballFolder = path.join(__dirname, 'temp/tarballs');
FileSystem.ensureEmptyFolder(tarballFolder);

const tarballsJson = {};

for (const project of allDependencyProjects) {
  if (project.versionPolicy || project.shouldPublish) {
    console.log(project.publishFolder);
    const result = Executable.spawnSync(rushConfiguration.packageManagerToolFilename, ['pack'], {
      currentWorkingDirectory: project.publishFolder,
      stdio: ['ignore', 'pipe', 'inherit']
    });
    if (result.status !== 0) {
      throw new Error('Failed to execute "pnpm pack"');
    }
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

// Look for folder names like this:
//   local+C++Git+rushstack+build-tests+install-test-wo_7efa61ad1cd268a0ef451c2450ca0351
//
// This caches the tarball contents, ignoring the integrity hashes.
const dotPnpmFolderPath = path.resolve(__dirname, 'workspace/node_modules/.pnpm');

console.log('Cleaning cached tarballs');
for (const filename of FileSystem.readFolder(dotPnpmFolderPath)) {
  if (filename.startsWith('local+')) {
    const filePath = path.join(dotPnpmFolderPath, filename);
    console.log('Deleting ' + filePath);
    FileSystem.deleteFolder(filePath);
  }
}

console.log('Invoking "pnpm install"');
Executable.spawnSync(rushConfiguration.packageManagerToolFilename, ['install'], {
  currentWorkingDirectory: path.join(__dirname, 'workspace'),
  stdio: 'inherit'
});
