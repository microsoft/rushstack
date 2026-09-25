pub fn help_width_from_columns(columns: Option<&str>) -> Option<f64> {
    let value: &str = match columns {
        None | Some("") => return Some(78.0),
        Some(value) => value,
    };
    let digits: &str = value.strip_prefix('-').unwrap_or(value);
    if !digits.is_empty() && digits.len() <= 9 && digits.bytes().all(|byte| byte.is_ascii_digit()) {
        let magnitude: f64 = digits.parse::<u32>().ok()? as f64;
        let columns_number: f64 = if digits.len() == value.len() { magnitude } else { -magnitude };
        return Some(columns_number - 2.0);
    }
    if value != "Infinity" && value.bytes().all(|byte| byte.is_ascii_alphabetic()) {
        return Some(f64::NAN);
    }
    None
}

pub fn read_help_width() -> Option<f64> {
    match std::env::var_os("COLUMNS") {
        None => Some(78.0),
        Some(raw_value) => help_width_from_columns(Some(raw_value.to_str()?)),
    }
}
