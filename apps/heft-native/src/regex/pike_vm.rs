use super::character_sets::ranges_contain_code_point;
use super::program::Instruction;
use super::syntax_tree::CharacterMatcher;

pub(super) struct PikeVirtualMachine<'program> {
    instructions: &'program [Instruction],
    visited_generation: Vec<u32>,
    generation: u32,
}

pub(super) fn character_matcher_accepts(matcher: &CharacterMatcher, code_point: u32) -> bool {
    match matcher {
        CharacterMatcher::Single(expected) => *expected == code_point,
        CharacterMatcher::Predefined(ranges, negated) => {
            ranges_contain_code_point(ranges, code_point) != *negated
        }
        CharacterMatcher::Ranges(ranges, negated) => {
            ranges_contain_code_point(ranges, code_point) != *negated
        }
    }
}

impl<'program> PikeVirtualMachine<'program> {
    pub(super) fn new(instructions: &'program [Instruction]) -> Self {
        PikeVirtualMachine {
            instructions,
            visited_generation: vec![0; instructions.len()],
            generation: 0,
        }
    }

    fn add_thread_with_epsilon_closure(
        &mut self,
        threads: &mut Vec<usize>,
        program_counter: usize,
        at_start: bool,
        at_end: bool,
    ) {
        if self.visited_generation[program_counter] == self.generation {
            return;
        }
        self.visited_generation[program_counter] = self.generation;
        match &self.instructions[program_counter] {
            Instruction::Jump(target) => {
                self.add_thread_with_epsilon_closure(threads, *target, at_start, at_end)
            }
            Instruction::Split(first, second) => {
                let (first, second) = (*first, *second);
                self.add_thread_with_epsilon_closure(threads, first, at_start, at_end);
                self.add_thread_with_epsilon_closure(threads, second, at_start, at_end);
            }
            Instruction::AssertStart if at_start => {
                self.add_thread_with_epsilon_closure(threads, program_counter + 1, at_start, at_end)
            }
            Instruction::AssertEnd if at_end => {
                self.add_thread_with_epsilon_closure(threads, program_counter + 1, at_start, at_end)
            }
            Instruction::AssertStart | Instruction::AssertEnd => {}
            Instruction::Character(_) | Instruction::Match => threads.push(program_counter),
        }
    }

    pub(super) fn matches_anywhere(&mut self, text: &str) -> bool {
        let mut closure: Vec<usize> = Vec::with_capacity(self.instructions.len());
        let mut advanced_threads: Vec<usize> = Vec::with_capacity(self.instructions.len());
        let mut code_points = text.chars().peekable();
        let mut at_start = true;
        loop {
            self.generation += 1;
            let at_end = code_points.peek().is_none();
            closure.clear();
            for &program_counter in &advanced_threads {
                self.add_thread_with_epsilon_closure(
                    &mut closure,
                    program_counter,
                    at_start,
                    at_end,
                );
            }
            self.add_thread_with_epsilon_closure(&mut closure, 0, at_start, at_end);
            if closure.iter().any(|&program_counter| {
                matches!(self.instructions[program_counter], Instruction::Match)
            }) {
                return true;
            }
            let Some(character) = code_points.next() else {
                return false;
            };
            at_start = false;
            advanced_threads.clear();
            for &program_counter in &closure {
                if let Instruction::Character(matcher) = &self.instructions[program_counter] {
                    if character_matcher_accepts(matcher, character as u32) {
                        advanced_threads.push(program_counter + 1);
                    }
                }
            }
        }
    }
}
