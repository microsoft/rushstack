mod bit_parallel_matcher;
mod character_sets;
mod class_parser;
mod pike_vm;
mod program;
mod syntax_tree;

use bit_parallel_matcher::BitParallelMatcher;
use pike_vm::PikeVirtualMachine;
use program::{Instruction, ProgramBuilder};
use syntax_tree::PatternParser;

pub struct CompiledUnicodeRegex {
    instructions: Vec<Instruction>,
    bit_parallel_matcher: Option<BitParallelMatcher>,
    pattern_is_within_basic_multilingual_plane: bool,
}

const LAST_BASIC_MULTILINGUAL_PLANE_CODE_POINT: u32 = 0xffff;

fn is_within_basic_multilingual_plane(text: &str) -> bool {
    text.chars()
        .all(|character| character as u32 <= LAST_BASIC_MULTILINGUAL_PLANE_CODE_POINT)
}

pub fn compile_unicode_regex_subset(pattern: &str) -> Option<CompiledUnicodeRegex> {
    let mut parser = PatternParser {
        characters: pattern.chars().collect(),
        position: 0,
    };
    let syntax = parser.parse_disjunction()?;
    if parser.position != parser.characters.len() {
        return None;
    }
    let mut builder = ProgramBuilder {
        instructions: Vec::with_capacity(parser.characters.len() + 1),
    };
    builder.compile_node(&syntax)?;
    builder.emit_final_match()?;
    Some(CompiledUnicodeRegex {
        bit_parallel_matcher: BitParallelMatcher::for_small_program(&builder.instructions),
        instructions: builder.instructions,
        pattern_is_within_basic_multilingual_plane: is_within_basic_multilingual_plane(pattern),
    })
}

impl CompiledUnicodeRegex {
    pub fn matches_anywhere(&self, text: &str) -> bool {
        match &self.bit_parallel_matcher {
            Some(matcher) => matcher.matches_anywhere(&self.instructions, text),
            None => PikeVirtualMachine::new(&self.instructions).matches_anywhere(text),
        }
    }

    pub fn matches_anywhere_without_unicode_flag(&self, text: &str) -> Option<bool> {
        if !self.pattern_is_within_basic_multilingual_plane
            || !is_within_basic_multilingual_plane(text)
        {
            return None;
        }
        Some(self.matches_anywhere(text))
    }
}

#[cfg(test)]
mod tests_bit_parallel_matcher;
#[cfg(test)]
mod tests_regex_semantics;
