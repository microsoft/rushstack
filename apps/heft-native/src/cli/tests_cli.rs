use super::invocation::{interpret_with_output, interpret_with_width};
use super::model::{CliModel, ParameterKind, PhaseModel, PluginModel, PluginParameterDefinition};
use super::outcome::{CliOutcome, PrintedOutput};
use super::width::help_width_from_columns;

const FIX_DESCRIPTION: &str = "Fix all encountered rule violations where the violated rule provides a fixer. When running in production mode, fixes will be disabled regardless of this parameter.";
const ROOT_USAGE: &str = "usage: heft [-h] [--debug] [--unmanaged] <command> ...\n";
const UNKNOWN_ACTION_ERROR: &str = "heft: error: argument \"<command>\": Invalid choice: nosuch-action (choose from [clean, run, build, test, run-watch, build-watch, test-watch])\n\n";
const LOCALES_ERROR: &str = "heft build: error: argument \"--locales\": Expected one argument. null\n\n";
const NO_PHASES_ERROR: &str = "\n\u{1b}[31mError: No phases were selected. Provide at least one phase to the \"--to\", \"--to-except\", or \"--only\" parameters.\u{1b}[39m\n";
const ROOT_HELP_120: &str = concat!(
    "usage: heft [-h] [--debug] [--unmanaged] <command> ...\n",
    "\n",
    "Heft is a pluggable build system designed for web projects.\n",
    "\n",
    "Positional arguments:\n",
    "  <command>\n",
    "    clean      Clean the project, removing temporary task folders and specified clean paths.\n",
    "    run        Run a provided selection of Heft phases.\n",
    "    build      Runs to the build phase, including all transitive dependencies.\n",
    "    test       Runs to the test phase, including all transitive dependencies.\n",
    "    run-watch  Run a provided selection of Heft phases in watch mode..\n",
    "    build-watch\n",
    "               Runs to the build phase, including all transitive dependencies, in watch mode.\n",
    "    test-watch\n",
    "               Runs to the test phase, including all transitive dependencies, in watch mode.\n",
    "\n",
    "Optional arguments:\n",
    "  -h, --help   Show this help message and exit.\n",
    "  --debug      Show the full call stack if an error occurs while executing the tool\n",
    "  --unmanaged  Disables the Heft version selector: When Heft is invoked via the shell path, normally it will examine \n",
    "               the project's package.json dependencies and try to use the locally installed version of Heft. Specify \n",
    "               \"--unmanaged\" to force the invoked version of Heft to be used. This is useful for example if you want \n",
    "               to test a different version of Heft.\n",
    "\n",
    "\u{1b}[1mFor detailed help about a specific command, use: heft <command> -h\u{1b}[22m\n",
);
const BUILD_HELP: &str = concat!(
    "usage: heft build [-h] [-v] [--production] [--locales LOCALE] [--clean]\n",
    "                  [--fix]\n",
    "                  \n",
    "\n",
    "Runs to the build phase, including all transitive dependencies.\n",
    "\n",
    "Optional arguments:\n",
    "  -h, --help         Show this help message and exit.\n",
    "  -v, --verbose      If specified, log information useful for debugging.\n",
    "  --production       If specified, run Heft in production mode.\n",
    "  --locales LOCALE   Use the specified locale for this run, if applicable.\n",
    "  --clean            If specified, clean the outputs at the beginning of the \n",
    "                     lifecycle and before running each phase.\n",
    "  --fix, --lint:fix  Fix all encountered rule violations where the violated \n",
    "                     rule provides a fixer. When running in production mode, \n",
    "                     fixes will be disabled regardless of this parameter.\n",
);
const SCOPED_HELP: &str = concat!(
    "usage: heft run --only build -- [-h] [-v] [--production] [--locales LOCALE]\n",
    "                                [--clean] [--fix]\n",
    "                                \n",
    "\n",
    "Run a provided selection of Heft phases.\n",
    "\n",
    "Optional arguments:\n",
    "  -h, --help         Show this help message and exit.\n",
    "  -v, --verbose      If specified, log information useful for debugging.\n",
    "  --production       If specified, run Heft in production mode.\n",
    "  --locales LOCALE   Use the specified locale for this run, if applicable.\n",
    "  --clean            If specified, clean the outputs at the beginning of the \n",
    "                     lifecycle and before running each phase.\n",
    "  --fix, --lint:fix  Fix all encountered rule violations where the violated \n",
    "                     rule provides a fixer. When running in production mode, \n",
    "                     fixes will be disabled regardless of this parameter.\n",
    "\n",
    "\u{1b}[1mFor more information on available unscoped parameters, use \"heft run \n",
    "--help\"\u{1b}[22m\n",
);
const BUILD_USAGE: &str = concat!(
    "usage: heft build [-h] [-v] [--production] [--locales LOCALE] [--clean]\n",
    "                  [--fix]\n",
    "                  \n",
);

fn model() -> CliModel<'static> {
    let fix: PluginParameterDefinition<'static> = PluginParameterDefinition {
        kind: ParameterKind::Flag,
        long_name: "--fix",
        short_name: None,
        description: FIX_DESCRIPTION,
        required: false,
        argument_name: None,
        alternatives: Vec::new(),
        default_value: None,
    };
    let lint: PluginModel<'static> = PluginModel { plugin_name: "lint-plugin", package_name: "@rushstack/heft-lint-plugin", parameter_scope: "lint", parameters: vec![fix] };
    let build: PhaseModel<'static> = PhaseModel { name: "build", description: None, dependency_names: Vec::new(), task_plugin_indices: vec![0] };
    let test: PhaseModel<'static> = PhaseModel { name: "test", description: None, dependency_names: vec!["build"], task_plugin_indices: Vec::new() };
    CliModel { phases: vec![build, test], plugins: vec![lint], ..CliModel::default() }
}

fn printed(args: &[&str], columns: Option<&str>) -> PrintedOutput {
    let model: CliModel<'static> = model();
    match interpret_with_width(args, &model, help_width_from_columns(columns)) {
        CliOutcome::Print(output) => output,
        other => panic!("expected printed output for {args:?}, got {other:?}"),
    }
}

fn assert_printed(args: &[&str], columns: Option<&str>, stdout: &str, stderr: &str, exit_code: i32) {
    let output: PrintedOutput = printed(args, columns);
    assert_eq!((output.stdout.as_str(), output.stderr.as_str(), output.exit_code), (stdout, stderr, exit_code), "{args:?}");
}

#[test]
fn renders_help_like_argparse() {
    assert_printed(&["--help"], Some("120"), ROOT_HELP_120, "", 1);
    assert_printed(&["build", "--help"], None, BUILD_HELP, "", 1);
    assert_printed(&["build", "--nosuch-flag", "-h"], None, BUILD_HELP, "", 1);
    assert_printed(&["run", "--only", "build", "--", "--help"], None, SCOPED_HELP, "", 0);
}

#[test]
fn renders_errors_like_argparse_and_ts_command_line() {
    assert_printed(&["nosuch-action"], None, ROOT_USAGE, UNKNOWN_ACTION_ERROR, 1);
    assert_printed(&["--version"], None, ROOT_USAGE, "heft: error: too few arguments\n\n", 1);
    let dash_dash_error: &str = "heft: error: argument \"<command>\": Invalid choice: -- (choose from [clean, run, build, test, run-watch, build-watch, test-watch])\n\n";
    assert_printed(&["--debug", "--"], None, ROOT_USAGE, dash_dash_error, 1);
    assert_printed(&["build", "--locales"], None, BUILD_USAGE, LOCALES_ERROR, 1);
    assert_printed(&["build", "extra"], None, BUILD_USAGE, "heft build: error: Unrecognized arguments: extra.\n\n", 1);
    assert_printed(&["run", "--", "--help"], None, "", NO_PHASES_ERROR, 1);
    let ambiguity: String = format!("{BUILD_USAGE}\n");
    assert_printed(&["build", "--debug", "x"], None, &ambiguity, "Error: heft build: error: Ambiguous option: \"--debug\".\n\n", 1);
}

#[test]
fn reports_unknown_phases_like_the_heft_terminal() {
    let model: CliModel<'static> = model();
    let args: &[&str] = &["run", "--to-except", "build", "--only", "nosuch", "--to", "other"];
    let message: &str = "The phase name \"nosuch\" passed to \"--only\" does not exist in heft.json.";
    for (color, expected) in [(false, format!("{message}\n")), (true, format!("\u{1b}[31m{message}\u{1b}[39m\n"))] {
        let CliOutcome::Print(output) = interpret_with_output(args, &model, None, Some(&move || color)) else {
            panic!("expected printed output");
        };
        assert_eq!((output.stdout.as_str(), output.stderr.as_str(), output.exit_code), ("", expected.as_str(), 1));
    }
}

#[test]
fn delegates_what_it_cannot_prove() {
    let model: CliModel<'static> = model();
    for args in [&["build", "-vq"][..], &["build", "--fi"], &["build", "--clean=x"], &["run", "--to", "nosuch"], &["--deb", "build"], &["run", "--only", "build", "x"]] {
        assert!(matches!(interpret_with_width(args, &model, Some(78.0)), CliOutcome::Delegate), "{args:?}");
    }
}

#[test]
fn hands_parsed_commands_to_the_run_module() {
    let model: CliModel<'static> = model();
    let CliOutcome::Execute(command) = interpret_with_width(&["test", "--fix", "--locales", "en-us"], &model, None) else {
        panic!("expected execute");
    };
    assert_eq!(command.selected_phases, vec![1, 0]);
    let mut plan: String = String::new();
    assert!(command.write_plan_command(&mut plan));
    let CliOutcome::Execute(explicit) = interpret_with_width(&["test", "--locales=en-us"], &model, None) else {
        panic!("expected execute");
    };
    assert!(!explicit.write_plan_command(&mut String::new()));
    assert_eq!(plan, "{\"commandName\":\"test\",\"unaliasedCommandName\":\"test\",\"actionKind\":\"phase\",\"phaseName\":\"test\",\"watch\":false,\"values\":[[\"--verbose\",null],[\"--production\",null],[\"--locales\",[\"en-us\"]],[\"--clean\",null],[\"--lint:fix\",true]]}");
}

#[test]
fn reads_columns_like_javascript() {
    assert_eq!(help_width_from_columns(None), Some(78.0));
    assert_eq!(help_width_from_columns(Some("")), Some(78.0));
    assert_eq!(help_width_from_columns(Some("120")), Some(118.0));
    assert_eq!(help_width_from_columns(Some("-1")), Some(-3.0));
    assert!(help_width_from_columns(Some("abc")).is_some_and(f64::is_nan));
    assert_eq!(help_width_from_columns(Some("Infinity")), None);
    assert_eq!(help_width_from_columns(Some("1e2")), None);
}
