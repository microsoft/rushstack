import * as path from 'path';
import { GitUtilities } from '../GitUtilities';

describe('GitUtilities', () => {
  describe('checkIgnoreAsync', () => {
    const testFoldersBasePath: string = path.join(__dirname, 'checkIgnoreTests');

    it('returns all files are ignored', async () => {
      const testFolderPath: string = path.join(testFoldersBasePath, 'allIgnored');
      const git = new GitUtilities(testFolderPath);
      const filePaths: string[] = [
        // Ignored
        path.join(testFolderPath, 'a.txt'),
        path.join(testFolderPath, 'b.txt'),
        path.join(testFolderPath, 'c.txt')
      ];
      const ignoredFilePaths: Set<string> = await git.checkIgnoreAsync(filePaths);
      expect(ignoredFilePaths.size).toEqual(filePaths.length);
      expect(ignoredFilePaths.has(filePaths[0])).toEqual(true);
      expect(ignoredFilePaths.has(filePaths[1])).toEqual(true);
      expect(ignoredFilePaths.has(filePaths[2])).toEqual(true);
    });

    it('returns some files are ignored', async () => {
      const testFolderPath: string = path.join(testFoldersBasePath, 'someIgnored');
      const git = new GitUtilities(testFolderPath);
      const filePaths: string[] = [
        // Ignored
        path.join(testFolderPath, 'a.txt'),
        path.join(testFolderPath, 'b', 'c.txt'),
        // Not ignored
        path.join(testFolderPath, 'b', 'd.txt'),
        path.join(testFolderPath, 'e.txt'),
        path.join(testFolderPath, 'f/g.txt')
      ];
      const ignoredFilePaths: Set<string> = await git.checkIgnoreAsync(filePaths);
      expect(ignoredFilePaths.size).toEqual(2);
      expect(ignoredFilePaths.has(filePaths[0])).toEqual(true);
      expect(ignoredFilePaths.has(filePaths[1])).toEqual(true);
    });

    it('returns non-negated files are ignored', async () => {
      const testFolderPath: string = path.join(testFoldersBasePath, 'negateIgnore');
      const git = new GitUtilities(testFolderPath);
      const filePaths: string[] = [
        // Ignored
        path.join(testFolderPath, 'a.txt'),
        path.join(testFolderPath, 'a', 'c.txt'),
        path.join(testFolderPath, 'b', 'c.txt'),
        // Not ignored
        path.join(testFolderPath, 'a', 'b.txt')
      ];
      const ignoredFilePaths: Set<string> = await git.checkIgnoreAsync(filePaths);
      expect(ignoredFilePaths.size).toEqual(3);
      expect(ignoredFilePaths.has(filePaths[0])).toEqual(true);
      expect(ignoredFilePaths.has(filePaths[1])).toEqual(true);
      expect(ignoredFilePaths.has(filePaths[2])).toEqual(true);
    });

    it('returns ignored files specified in the repo gitignore', async () => {
      // <repoRoot>/apps/heft
      const testFolderPath: string = path.resolve(__dirname, '..', '..', '..');
      const git = new GitUtilities(testFolderPath);
      const filePaths: string[] = [
        // Ignored
        path.join(testFolderPath, 'lib', 'a.txt'),
        path.join(testFolderPath, 'temp', 'a.txt'),
        path.join(testFolderPath, 'dist', 'a.txt'),
        // Not ignored
        path.join(testFolderPath, 'src', 'a.txt')
      ];
      const ignoredFilePaths: Set<string> = await git.checkIgnoreAsync(filePaths);
      expect(ignoredFilePaths.size).toEqual(3);
      expect(ignoredFilePaths.has(filePaths[0])).toEqual(true);
      expect(ignoredFilePaths.has(filePaths[1])).toEqual(true);
      expect(ignoredFilePaths.has(filePaths[2])).toEqual(true);
    });
  });
});
