import * as child_process from 'child_process';

export default class VersionControl {
  public static getChangedFolders(): string[] {
    const output: string = child_process.execSync('git diff master --dirstat=files')
      .toString();
    return output.split('\n').map(s => {
        if (s) {
          const delimiterIndex: number = s.indexOf('%');
          if (delimiterIndex > 0 && delimiterIndex + 1 < s.length) {
            return s.substring(delimiterIndex + 1).trim();
          }
        }
        return undefined;
      });
  }
}