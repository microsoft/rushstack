const GLIBC_FEATURES_HEADER: &str = "/usr/include/features.h";
const FIRST_GLIBC_MINOR_VERSION_WITH_STATIC_RELR: u32 = 36;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed={GLIBC_FEATURES_HEADER}");
    if static_glibc_startup_applies_packed_relative_relocations() {
        println!("cargo:rustc-link-arg-bins=-Wl,-z,pack-relative-relocs");
    }
}

fn static_glibc_startup_applies_packed_relative_relocations() -> bool {
    let target_is_static_glibc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu")
        && std::env::var("CARGO_CFG_TARGET_FEATURE")
            .unwrap_or_default()
            .split(',')
            .any(|target_feature| target_feature == "crt-static");
    target_is_static_glibc && glibc_version_of_build_host().is_some_and(|(major, minor)| {
        major > 2 || (major == 2 && minor >= FIRST_GLIBC_MINOR_VERSION_WITH_STATIC_RELR)
    })
}

fn glibc_version_of_build_host() -> Option<(u32, u32)> {
    let features_header = std::fs::read_to_string(GLIBC_FEATURES_HEADER).ok()?;
    let defined_number = |macro_name: &str| {
        features_header.lines().find_map(|header_line| {
            let mut words = header_line.split_whitespace();
            (words.next() == Some("#define") && words.next() == Some(macro_name))
                .then(|| words.next()?.parse::<u32>().ok())
                .flatten()
        })
    };
    Some((defined_number("__GLIBC__")?, defined_number("__GLIBC_MINOR__")?))
}
