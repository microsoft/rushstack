use super::node_path::{dirname, is_absolute, join, normalize, resolve, resolve_absolute};
use super::node_resolve::{is_definitely_valid_package_name, node_modules_folders};

const RESOLVE_CASES: [(&str, &str, &str); 12] = [
    ("/a/b", "c", "/a/b/c"),
    ("/a/b", "../c", "/a/c"),
    ("/a/b", "/x/y", "/x/y"),
    ("/a/b/", "./c/", "/a/b/c"),
    ("/", "../..", "/"),
    ("/a", "c/./d/../e", "/a/c/e"),
    ("/a/b", ".", "/a/b"),
    ("/a/b", "", "/a/b"),
    ("//a", "b", "/a/b"),
    ("/a/b", "c//d", "/a/b/c/d"),
    ("/a/b", "...", "/a/b/..."),
    ("/a/b", ".hidden/x", "/a/b/.hidden/x"),
];

const NORMALIZE_CASES: [(&str, &str); 11] = [
    ("/a/b/../c", "/a/c"),
    ("/a/./b/", "/a/b/"),
    ("//a//b", "/a/b"),
    ("/..", "/"),
    ("/a/b/..", "/a"),
    ("a/../..", ".."),
    ("./a", "a"),
    ("", "."),
    (".", "."),
    ("/a/b/c/../../d", "/a/d"),
    ("a//b/", "a/b/"),
];

const DIRNAME_CASES: [(&str, &str); 10] = [
    ("/a/b/c", "/a/b"),
    ("/a/b/", "/a"),
    ("/a", "/"),
    ("/", "/"),
    ("//a", "//"),
    ("a", "."),
    ("", "."),
    ("a/b", "a"),
    ("//", "/"),
    ("///a/b", "///a"),
];

const JOIN_CASES: [(&str, &str, &str); 6] = [
    ("/a", "b", "/a/b"),
    ("/a/", "/b", "/a/b"),
    ("a", "", "a"),
    ("/a", "../b", "/b"),
    ("/a", "./b/c", "/a/b/c"),
    ("", "b", "b"),
];

#[test]
fn posix_paths_match_node_path_posix() {
    for (base, relative, expected) in RESOLVE_CASES {
        assert_eq!(
            resolve(base, relative),
            expected,
            "resolve({base}, {relative})"
        );
    }
    for (path, expected) in NORMALIZE_CASES {
        assert_eq!(normalize(path), expected, "normalize({path})");
    }
    for (path, expected) in DIRNAME_CASES {
        assert_eq!(dirname(path), expected, "dirname({path})");
    }
    for (base, relative, expected) in JOIN_CASES {
        assert_eq!(join(base, relative), expected, "join({base}, {relative})");
    }
    assert!(is_absolute("/a"));
    assert!(!is_absolute("a"));
    assert!(!is_absolute(""));
    assert!(!is_absolute("./a"));
    assert!(is_absolute("//"));
}

#[test]
fn node_modules_folders_match_resolve_1_22() {
    assert_eq!(
        node_modules_folders("/a/b/c").collect::<Vec<String>>(),
        [
            "/a/b/c/node_modules",
            "/a/b/node_modules",
            "/a/node_modules",
            "/node_modules"
        ]
    );
    assert_eq!(
        node_modules_folders("/a/node_modules/b").collect::<Vec<String>>(),
        [
            "/a/node_modules/b/node_modules",
            "/a/node_modules/node_modules",
            "/a/node_modules",
            "/node_modules"
        ]
    );
    assert_eq!(node_modules_folders("/").collect::<Vec<String>>(), ["/node_modules"]);
    assert_eq!(
        node_modules_folders("/a/b/node_modules/@s/p/node_modules/q").collect::<Vec<String>>(),
        [
            "/a/b/node_modules/@s/p/node_modules/q/node_modules",
            "/a/b/node_modules/@s/p/node_modules/node_modules",
            "/a/b/node_modules/@s/p/node_modules",
            "/a/b/node_modules/@s/node_modules",
            "/a/b/node_modules/node_modules",
            "/a/b/node_modules",
            "/a/node_modules",
            "/node_modules"
        ]
    );
}

#[test]
fn package_names_that_resolve_accepts_without_doubt() {
    assert!(
        is_definitely_valid_package_name("@rushstack/heft"),
        "@rushstack/heft"
    );
    assert!(
        is_definitely_valid_package_name("heft-plugin"),
        "heft-plugin"
    );
    assert!(is_definitely_valid_package_name("a"), "a");
    assert!(is_definitely_valid_package_name("@s/a.b_c-d"), "@s/a.b_c-d");
    assert!(is_definitely_valid_package_name("UpperCase"), "UpperCase");
    assert!(is_definitely_valid_package_name("-dash"), "-dash");
    assert!(!is_definitely_valid_package_name(""), "");
    assert!(
        !is_definitely_valid_package_name("@rushstack"),
        "@rushstack"
    );
    assert!(!is_definitely_valid_package_name("@/x"), "@/x");
    assert!(!is_definitely_valid_package_name("@Scope/x"), "@Scope/x");
    assert!(!is_definitely_valid_package_name("./x"), "./x");
    assert!(!is_definitely_valid_package_name("../x"), "../x");
    assert!(!is_definitely_valid_package_name("/abs"), "/abs");
    assert!(!is_definitely_valid_package_name("a/b"), "a/b");
    assert!(!is_definitely_valid_package_name(".hidden"), ".hidden");
    assert!(!is_definitely_valid_package_name("_under"), "_under");
    assert!(!is_definitely_valid_package_name("@s/.x"), "@s/.x");
    assert!(!is_definitely_valid_package_name("@../x"), "@../x");
    assert!(!is_definitely_valid_package_name("a b"), "a b");
    assert!(!is_definitely_valid_package_name("x:y"), "x:y");
}

fn reference_segments(path: &str) -> Vec<&str> {
    let mut segments: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            _ => segments.push(segment),
        }
    }
    segments
}

#[test]
fn absolute_path_shortcuts_match_full_normalization() {
    let names: [&str; 12] = ["", ".", "..", "...", "a", "bc", ".d", "e.", "..f", "abcdef", "abcdefg", "abcdef."];
    let mut paths: Vec<String> = vec!["/".to_string(), "//".to_string()];
    for first in names {
        for second in names {
            for third in names {
                paths.push(format!("/{first}/{second}/{third}"));
                paths.push(format!("/{first}/{second}/{third}/"));
                paths.push(format!("/{first}/{second}"));
                paths.push(format!("/{first}"));
            }
        }
    }
    for path in &paths {
        let joined: String = reference_segments(path).join("/");
        let expected: String = format!("/{joined}");
        assert_eq!(resolve_absolute(path), expected, "{path}");
        assert_eq!(resolve("/", path), expected, "{path}");
        let trailing: &str = if path.ends_with('/') && !joined.is_empty() { "/" } else { "" };
        assert_eq!(normalize(path), format!("{expected}{trailing}"), "{path}");
        assert_eq!(join("/", path), format!("{expected}{trailing}"), "{path}");
        let relative: &str = path.trim_start_matches('/');
        let combined: String = format!("/x/{relative}");
        assert_eq!(resolve("/x", relative), resolve_absolute(&combined), "{path}");
    }
}
