import { execSync } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execSync);

export function findPatch(): string {
  try {
    const env = { ...process.env, ESLINT_BULK_FIND: 'true' };
    const stdout = execSync('echo "" | eslint --stdin --no-eslintrc', { env, stdio: 'pipe' });

    const startDelimiter = 'ESLINT_BULK_STDOUT_START';
    const endDelimiter = 'ESLINT_BULK_STDOUT_END';

    const regex = new RegExp(`${startDelimiter}(.*?)${endDelimiter}`);
    const match = stdout.toString().match(regex);

    if (match) {
      const filePath = match[1].trim();
      console.log(filePath);
      return filePath;
    }

    throw new Error(
      '@rushstack/eslint-bulk: Error finding patch path. Are you sure the eslint-bulk is installed in the package that you are trying to lint?'
    );
  } catch (e: unknown) {
    throw new Error('@rushstack/eslint-bulk: Error finding patch path: ' + (e as Error).message);
  }
}
