use std::io::IsTerminal;

use super::force_color::{environment_force_color, flag_force_color};
use super::has_flag::has_flag;
use super::parse_int::parse_int_base_ten_like_javascript;
use super::term_patterns::{
    ends_with_256_color_pattern, matches_basic_term_pattern, matches_teamcity_version_pattern,
};

pub struct ColorSupportInputs<'a> {
    pub environment_variable: &'a dyn Fn(&str) -> Option<String>,
    pub command_line_arguments: &'a [String],
    pub standard_output_is_terminal: bool,
    pub standard_error_is_terminal: bool,
}

#[derive(Clone, Copy, Debug)]
enum ColorLevel {
    False,
    Level,
}

impl ColorLevel {
    fn is_truthy(self) -> bool {
        matches!(self, Self::Level)
    }
}

pub fn console_supports_color(inputs: &ColorSupportInputs<'_>) -> bool {
    let mut force_color = flag_force_color(inputs.command_line_arguments);
    let output = color_support_level_for_stream_with_state(
        inputs,
        inputs.standard_output_is_terminal,
        &mut force_color,
    );
    let error = color_support_level_for_stream_with_state(
        inputs,
        inputs.standard_error_is_terminal,
        &mut force_color,
    );
    output.is_truthy() && error.is_truthy()
}

pub fn console_supports_color_for_this_process(tool_arguments: &[String]) -> bool {
    let mut process_arguments = vec![String::from("node"), String::from("heft")];
    process_arguments.extend_from_slice(tool_arguments);
    let environment_variable =
        |name: &str| std::env::var_os(name).map(|value| value.to_string_lossy().into_owned());
    let inputs = ColorSupportInputs {
        environment_variable: &environment_variable,
        command_line_arguments: &process_arguments,
        standard_output_is_terminal: std::io::stdout().is_terminal(),
        standard_error_is_terminal: std::io::stderr().is_terminal(),
    };
    console_supports_color(&inputs)
}

fn color_support_level_for_stream_with_state(
    inputs: &ColorSupportInputs<'_>,
    stream_is_terminal: bool,
    flag_force_color_state: &mut Option<f64>,
) -> ColorLevel {
    if let Some(environment_force_color) = environment_force_color(inputs.environment_variable) {
        *flag_force_color_state = Some(environment_force_color);
    }
    let force_color = *flag_force_color_state;
    let level = support_level_number(inputs, stream_is_terminal, force_color);
    translate_level(level)
}

fn support_level_number(
    inputs: &ColorSupportInputs<'_>,
    stream_is_terminal: bool,
    force_color: Option<f64>,
) -> f64 {
    let environment_variable = inputs.environment_variable;
    if force_color == Some(0.0) {
        return 0.0;
    }
    if has_flag("color=16m", inputs.command_line_arguments)
        || has_flag("color=full", inputs.command_line_arguments)
        || has_flag("color=truecolor", inputs.command_line_arguments)
    {
        return 3.0;
    }
    if has_flag("color=256", inputs.command_line_arguments) {
        return 2.0;
    }
    if !stream_is_terminal && force_color.is_none() {
        return 0.0;
    }
    let minimum = javascript_or_zero(force_color);
    if environment_variable("TERM").as_deref() == Some("dumb") {
        return minimum;
    }
    if windows_color_level().is_some() {
        return windows_color_level().unwrap();
    }
    if environment_variable("CI").is_some() {
        if [
            "TRAVIS",
            "CIRCLECI",
            "APPVEYOR",
            "GITLAB_CI",
            "GITHUB_ACTIONS",
            "BUILDKITE",
            "DRONE",
        ]
        .iter()
        .any(|name| environment_variable(name).is_some())
            || environment_variable("CI_NAME").as_deref() == Some("codeship")
        {
            return 1.0;
        }
        return minimum;
    }
    if let Some(teamcity_version) = environment_variable("TEAMCITY_VERSION") {
        return if matches_teamcity_version_pattern(&teamcity_version) {
            1.0
        } else {
            0.0
        };
    }
    if environment_variable("COLORTERM").as_deref() == Some("truecolor") {
        return 3.0;
    }
    if let Some(term_program) = environment_variable("TERM_PROGRAM") {
        let version_value = environment_variable("TERM_PROGRAM_VERSION").unwrap_or_default();
        let first_version_part = version_value.split('.').next().unwrap_or_default();
        let version = parse_int_base_ten_like_javascript(first_version_part);
        if term_program == "iTerm.app" {
            return if version >= 3.0 { 3.0 } else { 2.0 };
        }
        if term_program == "Apple_Terminal" {
            return 2.0;
        }
    }
    let term = environment_variable("TERM").unwrap_or_else(|| "undefined".to_owned());
    if ends_with_256_color_pattern(&term) {
        return 2.0;
    }
    if matches_basic_term_pattern(&term) {
        return 1.0;
    }
    if environment_variable("COLORTERM").is_some() {
        return 1.0;
    }
    minimum
}

fn translate_level(level: f64) -> ColorLevel {
    if level == 0.0 {
        ColorLevel::False
    } else {
        ColorLevel::Level
    }
}

fn javascript_or_zero(value: Option<f64>) -> f64 {
    match value {
        Some(number) if number != 0.0 && !number.is_nan() => number,
        _ => 0.0,
    }
}

#[cfg(windows)]
fn windows_color_level() -> Option<f64> {
    Some(1.0)
}

#[cfg(not(windows))]
fn windows_color_level() -> Option<f64> {
    None
}
