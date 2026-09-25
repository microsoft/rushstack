use super::has_flag::has_flag;
use super::parse_int::parse_int_base_ten_like_javascript;

pub fn flag_force_color(command_line_arguments: &[String]) -> Option<f64> {
    if has_flag("no-color", command_line_arguments)
        || has_flag("no-colors", command_line_arguments)
        || has_flag("color=false", command_line_arguments)
        || has_flag("color=never", command_line_arguments)
    {
        Some(0.0)
    } else if has_flag("color", command_line_arguments)
        || has_flag("colors", command_line_arguments)
        || has_flag("color=true", command_line_arguments)
        || has_flag("color=always", command_line_arguments)
    {
        Some(1.0)
    } else {
        None
    }
}

pub fn environment_force_color(
    environment_variable: &dyn Fn(&str) -> Option<String>,
) -> Option<f64> {
    environment_variable("FORCE_COLOR").map(|value| {
        if value == "true" {
            1.0
        } else if value == "false" {
            0.0
        } else if value.is_empty() {
            1.0
        } else {
            javascript_math_min(parse_int_base_ten_like_javascript(&value), 3.0)
        }
    })
}

fn javascript_math_min(left: f64, right: f64) -> f64 {
    if left.is_nan() || right.is_nan() {
        f64::NAN
    } else if left < right {
        left
    } else {
        right
    }
}
