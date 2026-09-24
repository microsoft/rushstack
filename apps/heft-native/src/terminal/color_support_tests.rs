use super::color_support::{console_supports_color, ColorSupportInputs};

type ColorCase = (&'static [(&'static str, &'static str)], &'static [&'static str], bool, bool, bool);

const CASES_VERIFIED_WITH_SUPPORTS_COLOR_8_1_1: &[ColorCase] = &[
    (&[], &[], true, true, false),
    (&[], &[], false, true, false),
    (&[], &[], true, false, false),
    (&[("TERM", "xterm-256color")], &[], true, true, true),
    (&[("TERM", "dumb")], &[], true, true, false),
    (&[("TERM", "dumb"), ("FORCE_COLOR", "1")], &[], true, true, true),
    (&[("FORCE_COLOR", "0"), ("TERM", "xterm")], &[], true, true, false),
    (&[("FORCE_COLOR", "")], &[], false, false, true),
    (&[("FORCE_COLOR", "true")], &[], false, false, true),
    (&[("FORCE_COLOR", "false"), ("TERM", "xterm")], &[], true, true, false),
    (&[("FORCE_COLOR", "abc")], &[], false, false, false),
    (&[("FORCE_COLOR", "3")], &[], false, false, true),
    (&[("NO_COLOR", "1"), ("TERM", "xterm")], &[], true, true, true),
    (&[("CI", "1"), ("TERM", "xterm")], &[], true, true, false),
    (&[("CI", "1"), ("GITHUB_ACTIONS", "true")], &[], true, true, true),
    (&[("CI", "1"), ("GITHUB_ACTIONS", "true")], &[], false, true, false),
    (&[("TEAMCITY_VERSION", "9.1"), ("TERM", "xterm")], &[], true, true, false),
    (&[("TEAMCITY_VERSION", "2023.05"), ("TERM", "xterm")], &[], true, true, true),
    (&[("COLORTERM", "truecolor")], &[], true, true, true),
    (&[("TERM", "vt100")], &[], true, true, true),
    (&[("TERM", "foo")], &[], true, true, false),
    (&[("TERM", "xterm")], &["--no-color"], true, true, false),
    (&[("TERM", "xterm")], &["--", "--no-color"], true, true, true),
    (&[], &["--color"], false, false, true),
    (&[], &["--color=256"], false, false, true),
    (&[("TERM", "screen")], &["build", "--color=false"], true, true, false),
    (&[("FORCE_COLOR", "1")], &["--no-color"], false, false, true),
    (&[("TERM_PROGRAM", "Apple_Terminal")], &[], true, true, true),
];

#[test]
fn console_color_decision_matches_supports_color() {
    for (index, (environment, arguments, output_is_terminal, error_is_terminal, expected)) in
        CASES_VERIFIED_WITH_SUPPORTS_COLOR_8_1_1.iter().enumerate()
    {
        let environment_variable = |name: &str| {
            environment
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| (*value).to_owned())
        };
        let mut command_line_arguments = vec![String::from("node"), String::from("heft")];
        command_line_arguments.extend(arguments.iter().map(|argument| (*argument).to_owned()));
        let inputs = ColorSupportInputs {
            environment_variable: &environment_variable,
            command_line_arguments: &command_line_arguments,
            standard_output_is_terminal: *output_is_terminal,
            standard_error_is_terminal: *error_is_terminal,
        };
        assert_eq!(console_supports_color(&inputs), *expected, "case {index}");
    }
}
