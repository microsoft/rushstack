pub fn format_rounded_milliseconds_as_seconds(duration_in_milliseconds: f64) -> String {
    let rounded_milliseconds = duration_in_milliseconds.round() as u64;
    let whole_seconds = rounded_milliseconds / 1000;
    let remaining_milliseconds = rounded_milliseconds % 1000;
    if remaining_milliseconds == 0 {
        return whole_seconds.to_string();
    }
    let fraction_digits = format!("{remaining_milliseconds:03}");
    format!("{whole_seconds}.{}", fraction_digits.trim_end_matches('0'))
}

pub fn format_seconds_with_three_fraction_digits(seconds: f64) -> String {
    let sixteenths = seconds * 16.0;
    if sixteenths.fract() == 0.0 && sixteenths % 2.0 == 1.0 && sixteenths < 1e15 {
        let thousandths_rounded_up = (sixteenths as u64 * 125).div_ceil(2);
        return format!(
            "{}.{:03}",
            thousandths_rounded_up / 1000,
            thousandths_rounded_up % 1000
        );
    }
    format!("{seconds:.3}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounded_milliseconds_print_like_javascript_numbers() {
        assert_eq!(format_rounded_milliseconds_as_seconds(0.0), "0");
        assert_eq!(format_rounded_milliseconds_as_seconds(0.49999999999999994), "0");
        assert_eq!(format_rounded_milliseconds_as_seconds(0.5), "0.001");
        assert_eq!(format_rounded_milliseconds_as_seconds(12.4), "0.012");
        assert_eq!(format_rounded_milliseconds_as_seconds(99.5), "0.1");
        assert_eq!(format_rounded_milliseconds_as_seconds(1000.2), "1");
        assert_eq!(format_rounded_milliseconds_as_seconds(1234567.0), "1234.567");
        assert_eq!(format_rounded_milliseconds_as_seconds(60010.0), "60.01");
    }

    #[test]
    fn fixed_three_digits_round_exact_ties_up_like_javascript() {
        assert_eq!(format_seconds_with_three_fraction_digits(0.0), "0.000");
        assert_eq!(format_seconds_with_three_fraction_digits(0.0625), "0.063");
        assert_eq!(format_seconds_with_three_fraction_digits(0.1875), "0.188");
        assert_eq!(format_seconds_with_three_fraction_digits(0.3125), "0.313");
        assert_eq!(format_seconds_with_three_fraction_digits(2.5625), "2.563");
        assert_eq!(format_seconds_with_three_fraction_digits(0.0005), "0.001");
        assert_eq!(format_seconds_with_three_fraction_digits(0.0015), "0.002");
        assert_eq!(format_seconds_with_three_fraction_digits(0.0025), "0.003");
        assert_eq!(format_seconds_with_three_fraction_digits(1.0005), "1.000");
        assert_eq!(format_seconds_with_three_fraction_digits(0.0123456), "0.012");
        assert_eq!(format_seconds_with_three_fraction_digits(123.9999), "124.000");
    }
}
