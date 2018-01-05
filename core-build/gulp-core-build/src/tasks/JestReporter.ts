/* tslint:disable-next-line:no-any */
const DEFAULT_REPORTER: any = require('jest-cli/build/reporters/default_reporter').default;

/**
 * Jest logs message to stderr. This class is to override that behavior so that
 * rush does not get confused.
 */
/* tslint:disable-next-line:no-any */
class JestReporter extends (DEFAULT_REPORTER as { new (globalConfig: any): any }) {
  /* tslint:disable-next-line:no-any */
  public constructor(globalConfig: any) {
    super(globalConfig);
  }

  public log(message: string): void {
    process.stdout.write(message + '\n');
  }
}

module.exports = JestReporter;