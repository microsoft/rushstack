use super::pike_vm::PikeVirtualMachine;
use super::{compile_unicode_regex_subset, CompiledUnicodeRegex};

const PATTERNS: [&str; 22] = [
    "^-(-[a-z0-9]+)+$",
    "^-[a-zA-Z]$",
    "^[a-z][a-z0-9]*([-][a-z0-9]+)*$",
    "[^\\\\]",
    "^\\.[A-z0-9-_.]*[A-z0-9-_]+$",
    "a|b",
    "^$",
    "$",
    "^",
    "(a|ab)(c|bcd)(d*)",
    "a{2,5}?b",
    "(?:x*)*y",
    "^(a+)+$",
    ".",
    "\\d+\\s\\w",
    "é+$",
    "😀",
    "^(?:[a-c]|x{2})*$",
    "a{70}",
    "(?:ab|cd){20,30}",
    "^[^a-z]+\\.json$",
    "(^a|b$)",
];

const TEXTS: [&str; 18] = [
    "",
    "a",
    "ab",
    "--production",
    "-v",
    "-",
    "copy-files-plugin",
    "Typescript-Plugin",
    ".json",
    "ABC.json",
    "xxxxxxy",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab",
    "abcd",
    "1 x",
    "\n",
    "ééé",
    "😀a",
    "abababababababababababababababababababababab",
];

fn pike_virtual_machine_verdict(compiled: &CompiledUnicodeRegex, text: &str) -> bool {
    PikeVirtualMachine::new(&compiled.instructions).matches_anywhere(text)
}

#[test]
fn bit_parallel_matching_agrees_with_the_pike_virtual_machine() {
    let mut bit_parallel_program_count = 0;
    for pattern in PATTERNS {
        let compiled = compile_unicode_regex_subset(pattern).unwrap();
        bit_parallel_program_count += usize::from(compiled.bit_parallel_matcher.is_some());
        for text in TEXTS {
            assert_eq!(
                compiled.matches_anywhere(text),
                pike_virtual_machine_verdict(&compiled, text),
                "{pattern} on {text}"
            );
        }
    }
    assert_eq!(bit_parallel_program_count, PATTERNS.len() - 2);
}
