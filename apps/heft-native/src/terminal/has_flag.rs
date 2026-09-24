pub fn has_flag(flag: &str, command_line_arguments: &[String]) -> bool {
    let prefix = if flag.starts_with('-') {
        ""
    } else if flag.chars().count() == 1 {
        "-"
    } else {
        "--"
    };
    let wanted = format!("{prefix}{flag}");
    let position = command_line_arguments
        .iter()
        .position(|argument| argument == &wanted);
    let terminator_position = command_line_arguments
        .iter()
        .position(|argument| argument == "--");
    match (position, terminator_position) {
        (Some(found), Some(terminator)) => found < terminator,
        (Some(_), None) => true,
        (None, _) => false,
    }
}
