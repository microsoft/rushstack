use super::node_path::{join, normalize, resolve, resolve_absolute};

fn reference_resolve_absolute(path: &str) -> String {
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
    format!("/{}", segments.join("/"))
}

#[test]
fn random_absolute_paths_normalize_like_the_reference() {
    let alphabet: [char; 3] = ['/', '.', 'a'];
    let mut state: u64 = 0x2545_f491_4f6c_dd1d;
    for _ in 0..20_000 {
        state = state.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
        let length: usize = (state >> 58) as usize % 41;
        let mut path: String = String::from("/");
        for _ in 0..length {
            state = state.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
            path.push(alphabet[(state >> 33) as usize % 3]);
        }
        let expected: String = reference_resolve_absolute(&path);
        assert_eq!(resolve_absolute(&path), expected, "{path}");
        let trailing: &str = if path.ends_with('/') && expected != "/" { "/" } else { "" };
        assert_eq!(normalize(&path), format!("{expected}{trailing}"), "{path}");
        assert_eq!(join("/", &path[1..]), format!("{expected}{trailing}"), "{path}");
        let dotted: String = format!("./{}", &path[1..]);
        assert_eq!(resolve("/b", &dotted), reference_resolve_absolute(&format!("/b/{dotted}")), "{path}");
        let joined: String = format!("/b/{dotted}");
        let joined_trailing: &str = if joined.ends_with('/') && reference_resolve_absolute(&joined) != "/" { "/" } else { "" };
        assert_eq!(join("/b", &dotted), format!("{}{joined_trailing}", reference_resolve_absolute(&joined)), "{path}");
    }
}
