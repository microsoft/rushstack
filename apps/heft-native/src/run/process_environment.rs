use std::env;

pub fn rush_child_reporter_is_requested() -> bool {
    env::var_os("_RUSH_REPORTER_CHILD_FD").is_some() || env::var_os("_RUSH_REPORTER_CHILD_ACK_FD").is_some()
}

#[cfg(unix)]
pub fn standard_input_is_the_null_device() -> bool {
    use std::os::fd::AsFd;
    use std::os::unix::fs::{FileTypeExt, MetadataExt};
    let Ok(standard_input) = std::io::stdin().as_fd().try_clone_to_owned() else {
        return false;
    };
    let Ok(standard_input_metadata) = std::fs::File::from(standard_input).metadata() else {
        return false;
    };
    let Ok(null_device_metadata) = std::fs::metadata("/dev/null") else {
        return false;
    };
    standard_input_metadata.file_type().is_char_device() && standard_input_metadata.rdev() == null_device_metadata.rdev()
}

#[cfg(not(unix))]
pub fn standard_input_is_the_null_device() -> bool {
    false
}
