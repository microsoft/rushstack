use std::borrow::Cow;

use super::defined_parameter::DefinedParameter;
use super::help_args::{clean_usage_separators, clean_usage_separators_in_every_pass};
use super::model::ParameterKind;
use super::registration::{is_registration_possible, try_register_parameters};

struct PseudoRandom(u64);

impl PseudoRandom {
    fn next(&mut self, bound: usize) -> usize {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 % bound as u64) as usize
    }
}

const LONG_NAMES: [&str; 5] = ["--alpha", "--beta", "--help", "--verbose", "--gamma-delta"];
const SHORT_NAMES: [&str; 4] = ["-a", "-b", "-h", "-v"];
const SCOPES: [&str; 3] = ["one", "two", "lint"];
const PARENT_NAMES: [&str; 4] = ["--debug", "--unmanaged", "--alpha", "-h"];

fn random_parameter(random: &mut PseudoRandom) -> DefinedParameter<'static> {
    let short_name: Option<&'static str> = match random.next(3) {
        0 => Some(SHORT_NAMES[random.next(SHORT_NAMES.len())]),
        _ => None,
    };
    let mut parameter: DefinedParameter<'static> = DefinedParameter::flag(LONG_NAMES[random.next(LONG_NAMES.len())], short_name, Cow::Borrowed("d"));
    if random.next(4) > 0 {
        parameter.scope = Some(SCOPES[random.next(SCOPES.len())]);
    }
    if random.next(2) == 0 {
        parameter.kind = ParameterKind::StringList;
        parameter.argument_name = Some("VALUE");
    }
    parameter
}

#[test]
fn registration_check_agrees_with_full_registration() {
    let mut random: PseudoRandom = PseudoRandom(0x9e37_79b9_7f4a_7c15);
    let mut disagreements: usize = 0;
    let mut possible: usize = 0;
    for _ in 0..200_000 {
        let count: usize = random.next(7);
        let parameters: Vec<DefinedParameter<'static>> = (0..count).map(|_| random_parameter(&mut random)).collect();
        let parents: Vec<Cow<'static, str>> = (0..random.next(3)).map(|_| Cow::Borrowed(PARENT_NAMES[random.next(PARENT_NAMES.len())])).collect();
        let expected: bool = try_register_parameters(&parameters, &parents).is_some();
        if expected {
            possible += 1;
        }
        if is_registration_possible(&parameters, &parents) != expected {
            disagreements += 1;
        }
    }
    assert_eq!(disagreements, 0);
    assert!(possible > 20_000 && possible < 180_000, "{possible}");
}

#[test]
fn usage_cleanup_fast_path_agrees_with_every_pass() {
    let mut random: PseudoRandom = PseudoRandom(0x2545_f491_4f6c_dd1d);
    let alphabet: [char; 9] = ['[', ']', '(', ')', ' ', ' ', 'a', '|', '-'];
    for _ in 0..300_000 {
        let text: String = (0..random.next(14)).map(|_| alphabet[random.next(alphabet.len())]).collect();
        assert_eq!(clean_usage_separators(&text), clean_usage_separators_in_every_pass(&text), "{text:?}");
    }
}
