import { exec } from './exec';

describe('exec', function () {
  it('can exec a process and capture output', async function () {
    // Act
    const cmd = process.argv0 + ` --eval "console.log(1); console.error(2); process.exit(3);"`;
    const result = await exec(cmd, process.cwd());

    expect(result.error?.message).toEqual(`Command failed: ${cmd}\n2\n`);
    expect(result.stderr).toEqual('2\n');
    expect(result.stdout).toEqual('1\n');
  });
});
