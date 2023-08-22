import {
  CommandLineAction,
  CommandLineParameter,
  CommandLineParameterKind
} from '@rushstack/ts-command-line';
import { RushCommandLineParser } from './RushCommandLineParser';

export type CliParameterKind = 'flag' | 'string';

// interface RushCliJsonSpec {
//   kind: CliParameterKind;

//   /**
//    * The long name of the flag including double dashes, e.g. "--do-something"
//    */
//   longName: string;

//   /**
//    * An optional short name for the flag including the dash, e.g. "-d"
//    */
//   shortName?: string;

//   /**
//    * Documentation for the parameter that will be shown when invoking the tool with "--help"
//    */
//   description: string;

//   /**
//    * If true, then an error occurs if the parameter was not included on the command-line.
//    */
//   required?: boolean;
// }

interface ICommandLineParameter {
  readonly kind: CommandLineParameterKind;
  readonly longName: string;
  readonly shortName: string | undefined;
  readonly description: string;
  readonly required: boolean;
}

interface IRushCliJsonSpec {
  actionName: string;
  parameters: ICommandLineParameter[];
}

/**
 * Information about the available CLI commands
 *
 * @beta
 */
export class RushCommandLine {
  public getSpec(workspaceFolder: string): IRushCliJsonSpec[] {
    const commandLineParser: RushCommandLineParser = new RushCommandLineParser({ cwd: workspaceFolder });

    // Copy the actions
    const commandLineActions: CommandLineAction[] = commandLineParser.actions.slice();

    // extract the set of command line elements from the command line parser
    const filledCommandLineActions: IRushCliJsonSpec[] = [];
    for (const commandLineAction of commandLineActions) {
      const parameters: ICommandLineParameter[] = commandLineAction.parameters
        .slice()
        .map((parameter: CommandLineParameter) => {
          const o: ICommandLineParameter = {
            ...parameter,
            // kind is a getter in CommandLineParameter
            kind: parameter.kind,
            shortName: parameter.shortName
          };
          return o;
        });
      filledCommandLineActions.push({
        actionName: commandLineAction.actionName,
        parameters
      });
    }

    return filledCommandLineActions;
  }
}
