#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

function parseArguments() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      'backup-path': { type: 'string' },
      cohort: { type: 'string' },
      'packages-path': { type: 'string' },
      'repo-path': { type: 'string' }
    }
  });
  if (positionals.length !== 1) {
    throw new Error('Expected exactly one command.');
  }

  return { command: positionals[0], options: values };
}

function getRequiredOption(options, name) {
  const value = options[name];
  if (!value) {
    throw new Error(`Missing required option: --${name}`);
  }
  return value;
}

function loadProjects(repoPath) {
  const result = childProcess.spawnSync(
    process.execPath,
    [path.join(repoPath, 'common/scripts/install-run-rush.js'), 'list', '--json'],
    {
      cwd: repoPath,
      encoding: 'utf8',
      env: process.env
    }
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error('Unable to read the Rush project list.');
  }

  const jsonStart = result.stdout.indexOf('{');
  if (jsonStart < 0) {
    throw new Error('Rush list did not produce JSON output.');
  }

  const projectList = JSON.parse(result.stdout.slice(jsonStart));
  return new Map(projectList.projects.map((project) => [project.name, project]));
}

function isProjectInCohort(project, cohort) {
  if (cohort === 'all') {
    return true;
  }
  if (cohort === 'rush') {
    return project.versionPolicyName === 'rush';
  }
  if (cohort === 'noRush') {
    return !project.versionPolicyName;
  }
  throw new Error(`Unsupported publishing cohort: ${cohort}`);
}

function forEachFileRecursive(folderPath, extension, callback) {
  const pendingFolders = [{ absolutePath: folderPath, relativePath: '' }];
  while (pendingFolders.length > 0) {
    const currentFolder = pendingFolders.pop();
    let entries;
    try {
      entries = fs.readdirSync(currentFolder.absolutePath, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentFolder.absolutePath, entry.name);
      const relativePath = path.join(currentFolder.relativePath, entry.name);
      if (entry.isDirectory()) {
        pendingFolders.push({ absolutePath, relativePath });
      } else if (entry.isFile() && (!extension || entry.name.endsWith(extension))) {
        callback(absolutePath, relativePath);
      }
    }
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function partitionChanges(repoPath, backupPath, cohort) {
  const projects = loadProjects(repoPath);
  const changesPath = path.join(repoPath, 'common/changes');

  fs.rmSync(backupPath, { recursive: true, force: true });

  forEachFileRecursive(changesPath, '.json', (changeFilePath, relativePath) => {
    const changeFileText = fs.readFileSync(changeFilePath, 'utf8');
    const changeFile = JSON.parse(changeFileText);
    const includedChanges = [];
    const excludedChanges = [];

    for (const change of changeFile.changes) {
      const project = projects.get(change.packageName);
      if (!project) {
        throw new Error(`${changeFilePath} references unknown project ${change.packageName}.`);
      }

      (isProjectInCohort(project, cohort) ? includedChanges : excludedChanges).push(change);
    }

    if (excludedChanges.length > 0) {
      const backupFilePath = path.join(backupPath, relativePath);
      if (includedChanges.length === 0) {
        fs.mkdirSync(path.dirname(backupFilePath), { recursive: true });
        fs.writeFileSync(backupFilePath, changeFileText);
      } else {
        writeJson(backupFilePath, { ...changeFile, changes: excludedChanges });
      }
    }

    if (includedChanges.length > 0) {
      writeJson(changeFilePath, { ...changeFile, changes: includedChanges });
    } else {
      fs.rmSync(changeFilePath);
    }
  });
}

function restoreChanges(repoPath, backupPath) {
  const changesPath = path.join(repoPath, 'common/changes');

  forEachFileRecursive(backupPath, '.json', (backupFilePath, relativePath) => {
    const changeFilePath = path.join(changesPath, relativePath);
    const backupChangeFile = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));

    if (fs.existsSync(changeFilePath)) {
      const currentChangeFile = JSON.parse(fs.readFileSync(changeFilePath, 'utf8'));
      writeJson(changeFilePath, {
        ...backupChangeFile,
        changes: [...currentChangeFile.changes, ...backupChangeFile.changes]
      });
    } else {
      writeJson(changeFilePath, backupChangeFile);
    }
  });
}

function readPackageJsonFromTarball(tarballPath) {
  const result = childProcess.spawnSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`Unable to read package.json from ${tarballPath}.`);
  }
  return JSON.parse(result.stdout);
}

function packageIsPublished(packageName, version, repoPath, registryUrl) {
  const result = childProcess.spawnSync(
    'npm',
    ['view', `${packageName}@${version}`, 'version', '--json', '--registry', registryUrl],
    {
      cwd: repoPath,
      encoding: 'utf8',
      env: process.env
    }
  );

  if (result.status === 0) {
    return true;
  }
  if (result.stderr.includes('E404')) {
    return false;
  }

  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  throw new Error(`Unable to determine whether ${packageName}@${version} is published.`);
}

function filterPackages(repoPath, packagesPath, cohort) {
  const projects = loadProjects(repoPath);
  const npmrcPublish = fs.readFileSync(path.join(repoPath, 'common/config/rush/.npmrc-publish'), 'utf8');
  const registryMatch = npmrcPublish.match(/^registry=(.+)$/m);
  if (!registryMatch) {
    throw new Error('Unable to determine the publish registry from .npmrc-publish.');
  }
  const registryUrl = registryMatch[1].trim();
  let retainedPackageCount = 0;

  forEachFileRecursive(packagesPath, '.tgz', (tarballPath) => {
    const packageJson = readPackageJsonFromTarball(tarballPath);
    const project = projects.get(packageJson.name);
    if (!project) {
      throw new Error(`${tarballPath} contains unknown project ${packageJson.name}.`);
    }

    const retainPackage =
      isProjectInCohort(project, cohort) &&
      project.shouldPublish &&
      !packageIsPublished(packageJson.name, packageJson.version, repoPath, registryUrl);

    if (retainPackage) {
      retainedPackageCount++;
      console.log(`Retaining ${packageJson.name}@${packageJson.version}`);
    } else {
      fs.rmSync(tarballPath);
    }
  });

  console.log(`Retained ${retainedPackageCount} unpublished ${cohort} package(s).`);
  console.log(
    `##vso[task.setvariable variable=HasPackages]${retainedPackageCount > 0 ? 'true' : 'false'}`
  );
}

function main() {
  const { command, options } = parseArguments();
  const repoPath = path.resolve(options['repo-path'] || process.cwd());

  switch (command) {
    case 'partition-changes':
      partitionChanges(
        repoPath,
        path.resolve(getRequiredOption(options, 'backup-path')),
        getRequiredOption(options, 'cohort')
      );
      break;
    case 'restore-changes':
      restoreChanges(repoPath, path.resolve(getRequiredOption(options, 'backup-path')));
      break;
    case 'filter-packages':
      filterPackages(
        repoPath,
        path.resolve(getRequiredOption(options, 'packages-path')),
        getRequiredOption(options, 'cohort')
      );
      break;
    default:
      throw new Error(`Unsupported command: ${command || '<missing>'}`);
  }
}

main();
