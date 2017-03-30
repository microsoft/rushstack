import Utilities from './Utilities';
import * as semver from 'semver';

export default class Npm {
  public static publishedVersions(
    packageName: string,
    cwd: string,
    env: { [key: string]: string }
  ): string[] {
    const versions: string[] = [];
    try {
      const packageTime: string = Utilities.executeCommandAndCaptureOutput('npm',
        `view ${packageName} time --json`.split(' '),
        cwd,
        env);
      if (packageTime && packageTime !== '') {
        Object.keys(JSON.parse(packageTime)).forEach(v => {
          if (semver.valid(v)) {
            versions.push(v);
          }
        });
      } else {
        console.log(`Package ${packageName} time value does not exist. Fall back to versions.`);
        // time property does not exist. It happens sometimes. Fall back to versions.
        const packageVersions: string = Utilities.executeCommandAndCaptureOutput('npm',
          `view ${packageName} versions --json`.split(' '),
          cwd,
          env);
        (JSON.parse(packageVersions)).forEach(v => {
          versions.push(v);
        });
      }
    } catch (error) {
      if (error.message.indexOf('npm ERR! 404') >= 0) {
        console.log(`Package ${packageName} does not exist in the registry.`);
      } else {
        console.log(`Failed to get npm information about ${packageName}.`);
        throw error;
      }
    }
    return versions;
  }
}
