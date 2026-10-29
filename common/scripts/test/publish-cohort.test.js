const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const scriptPath = path.resolve(__dirname, '../publish-cohort.js');
const includedChange = { packageName: 'individual-package', comment: 'Keep this change.', type: 'none' };
const consumedChange = { packageName: 'individual-package', comment: 'Fix a bug.', type: 'patch' };
const excludedChange = { packageName: 'rush-package', comment: 'Next Rush release.', type: 'minor' };
const metadata = {
  packageName: 'individual-package',
  email: 'author@example.com',
  customMetadata: { source: 'test' }
};

function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertPrettyJson(filePath, expected) {
  const text = fs.readFileSync(filePath, 'utf8');
  assert.deepStrictEqual(JSON.parse(text), expected);
  assert.strictEqual(text, prettyJson(expected));
}

function createFixture(t, changeFileText) {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-cohort-'));
  t.after(() => fs.rmSync(repoPath, { recursive: true, force: true }));

  const scriptsPath = path.join(repoPath, 'common/scripts');
  fs.mkdirSync(scriptsPath, { recursive: true });
  const projectList = {
    projects: [
      { name: 'individual-package' },
      { name: 'rush-package', versionPolicyName: 'rush' }
    ]
  };
  fs.writeFileSync(
    path.join(scriptsPath, 'install-run-rush.js'),
    `console.log(JSON.stringify(${JSON.stringify(projectList)}));\n`
  );

  const relativePath = path.join('@scope', 'package', 'change.json');
  const changeFilePath = path.join(repoPath, 'common/changes', relativePath);
  fs.mkdirSync(path.dirname(changeFilePath), { recursive: true });
  fs.writeFileSync(changeFilePath, changeFileText);

  const backupPath = path.join(repoPath, 'excluded changes');
  return {
    changeFilePath,
    backupPath,
    backupFilePath: path.join(backupPath, relativePath),
    run(command, cohort) {
      const result = childProcess.spawnSync(
        process.execPath,
        [
          scriptPath,
          command,
          '--repo-path',
          repoPath,
          '--backup-path',
          backupPath,
          ...(cohort ? ['--cohort', cohort] : [])
        ],
        { encoding: 'utf8' }
      );
      assert.ifError(result.error);
      assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    }
  };
}

const formats = [
  ['two-space indentation and LF', prettyJson],
  ['tabs and CRLF', (value) => `${JSON.stringify(value, null, '\t').replace(/\n/g, '\r\n')}\r\n`],
  ['compact JSON without a final newline', (value) => JSON.stringify(value)]
];

for (const [description, format] of formats) {
  test(`fully included files retain ${description}`, (t) => {
    const text = format({ ...metadata, changes: [includedChange] });
    const fixture = createFixture(t, text);

    fixture.run('partition-changes', 'noRush');
    assert.strictEqual(fs.readFileSync(fixture.changeFilePath, 'utf8'), text);
    assert.strictEqual(fs.existsSync(fixture.backupFilePath), false);

    fixture.run('restore-changes');
    assert.strictEqual(fs.readFileSync(fixture.changeFilePath, 'utf8'), text);
  });

  test(`fully excluded files retain ${description}`, (t) => {
    const text = format({ ...metadata, changes: [excludedChange] });
    const fixture = createFixture(t, text);

    fixture.run('partition-changes', 'noRush');
    assert.strictEqual(fs.existsSync(fixture.changeFilePath), false);
    assert.strictEqual(fs.readFileSync(fixture.backupFilePath, 'utf8'), text);

    fs.rmdirSync(path.dirname(fixture.changeFilePath));
    fixture.run('restore-changes');
    assert.strictEqual(fs.readFileSync(fixture.changeFilePath, 'utf8'), text);
  });
}

for (const cohort of ['rush', 'all']) {
  test(`${cohort} selects the expected changes without rewriting included files`, (t) => {
    const changes = cohort === 'rush' ? [excludedChange] : [includedChange, excludedChange];
    const text = JSON.stringify({ ...metadata, changes });
    const fixture = createFixture(t, text);

    fixture.run('partition-changes', cohort);
    assert.strictEqual(fs.readFileSync(fixture.changeFilePath, 'utf8'), text);
    assert.strictEqual(fs.existsSync(fixture.backupFilePath), false);
  });
}

test('mixed files preserve metadata and use pretty JSON when split and merged', (t) => {
  const fixture = createFixture(
    t,
    JSON.stringify({ ...metadata, changes: [includedChange, excludedChange] })
  );

  fixture.run('partition-changes', 'noRush');
  assertPrettyJson(fixture.changeFilePath, { ...metadata, changes: [includedChange] });
  assertPrettyJson(fixture.backupFilePath, { ...metadata, changes: [excludedChange] });

  fixture.run('restore-changes');
  assertPrettyJson(fixture.changeFilePath, { ...metadata, changes: [includedChange, excludedChange] });
});

test('mixed files restore excluded entries alongside surviving included entries', (t) => {
  const fixture = createFixture(
    t,
    prettyJson({ ...metadata, changes: [includedChange, excludedChange, consumedChange] })
  );

  fixture.run('partition-changes', 'noRush');
  assertPrettyJson(fixture.changeFilePath, { ...metadata, changes: [includedChange, consumedChange] });
  assertPrettyJson(fixture.backupFilePath, { ...metadata, changes: [excludedChange] });

  fs.writeFileSync(fixture.changeFilePath, prettyJson({ ...metadata, changes: [includedChange] }));
  fixture.run('restore-changes');
  assertPrettyJson(fixture.changeFilePath, { ...metadata, changes: [includedChange, excludedChange] });
});

test('mixed files restore only excluded entries when all included entries were consumed', (t) => {
  const fixture = createFixture(
    t,
    prettyJson({ ...metadata, changes: [consumedChange, excludedChange] })
  );

  fixture.run('partition-changes', 'noRush');
  assertPrettyJson(fixture.changeFilePath, { ...metadata, changes: [consumedChange] });
  assertPrettyJson(fixture.backupFilePath, { ...metadata, changes: [excludedChange] });

  fs.rmSync(fixture.changeFilePath);
  fixture.run('restore-changes');
  assertPrettyJson(fixture.changeFilePath, { ...metadata, changes: [excludedChange] });
});

test('fully included files stay deleted when their changes were consumed', (t) => {
  const fixture = createFixture(t, prettyJson({ ...metadata, changes: [consumedChange] }));

  fixture.run('partition-changes', 'noRush');
  fs.rmSync(fixture.changeFilePath);
  fixture.run('restore-changes');
  assert.strictEqual(fs.existsSync(fixture.changeFilePath), false);
});
