use super::pike_vm::character_matcher_accepts;
use super::program::Instruction;

pub(super) const LARGEST_PROGRAM_FOR_BIT_PARALLEL_MATCHING: usize = 63;
const POSITION_CONTEXT_COUNT: usize = 4;

pub(super) struct BitParallelMatcher {
    epsilon_closure_masks: Vec<u64>,
    instruction_count: usize,
    match_instruction_mask: u64,
}

fn position_context_index(at_start: bool, at_end: bool) -> usize {
    usize::from(at_start) * 2 + usize::from(at_end)
}

fn epsilon_closure_mask(
    instructions: &[Instruction],
    program_counter: usize,
    at_start: bool,
    at_end: bool,
    visited_mask: &mut u64,
) -> u64 {
    let program_counter_bit = 1u64 << program_counter;
    if *visited_mask & program_counter_bit != 0 {
        return 0;
    }
    *visited_mask |= program_counter_bit;
    let follow = |target: usize, visited_mask: &mut u64| {
        epsilon_closure_mask(instructions, target, at_start, at_end, visited_mask)
    };
    match &instructions[program_counter] {
        Instruction::Jump(target) => follow(*target, visited_mask),
        Instruction::Split(first, second) => {
            follow(*first, visited_mask) | follow(*second, visited_mask)
        }
        Instruction::AssertStart if at_start => follow(program_counter + 1, visited_mask),
        Instruction::AssertEnd if at_end => follow(program_counter + 1, visited_mask),
        Instruction::AssertStart | Instruction::AssertEnd => 0,
        Instruction::Character(_) | Instruction::Match => program_counter_bit,
    }
}

impl BitParallelMatcher {
    pub(super) fn for_small_program(instructions: &[Instruction]) -> Option<Self> {
        let instruction_count = instructions.len();
        if instruction_count > LARGEST_PROGRAM_FOR_BIT_PARALLEL_MATCHING {
            return None;
        }
        let mut epsilon_closure_masks =
            Vec::with_capacity(POSITION_CONTEXT_COUNT * instruction_count);
        for (at_start, at_end) in [(false, false), (false, true), (true, false), (true, true)] {
            for program_counter in 0..instruction_count {
                let mut visited_mask = 0u64;
                epsilon_closure_masks.push(epsilon_closure_mask(
                    instructions,
                    program_counter,
                    at_start,
                    at_end,
                    &mut visited_mask,
                ));
            }
        }
        let match_instruction_mask = instructions
            .iter()
            .enumerate()
            .filter(|(_, instruction)| matches!(instruction, Instruction::Match))
            .fold(0u64, |mask, (program_counter, _)| {
                mask | 1u64 << program_counter
            });
        Some(BitParallelMatcher {
            epsilon_closure_masks,
            instruction_count,
            match_instruction_mask,
        })
    }

    fn epsilon_closure_of_threads(&self, threads: u64, at_start: bool, at_end: bool) -> u64 {
        let context_offset = position_context_index(at_start, at_end) * self.instruction_count;
        let mut remaining_threads = threads;
        let mut closure = 0u64;
        while remaining_threads != 0 {
            let program_counter = remaining_threads.trailing_zeros() as usize;
            remaining_threads &= remaining_threads - 1;
            closure |= self.epsilon_closure_masks[context_offset + program_counter];
        }
        closure
    }

    pub(super) fn matches_anywhere(&self, instructions: &[Instruction], text: &str) -> bool {
        let mut code_points = text.chars().peekable();
        let mut advanced_threads = 0u64;
        let mut at_start = true;
        loop {
            let at_end = code_points.peek().is_none();
            let threads = self.epsilon_closure_of_threads(advanced_threads | 1, at_start, at_end);
            if threads & self.match_instruction_mask != 0 {
                return true;
            }
            let Some(character) = code_points.next() else {
                return false;
            };
            at_start = false;
            advanced_threads = 0;
            let mut remaining_threads = threads;
            while remaining_threads != 0 {
                let program_counter = remaining_threads.trailing_zeros() as usize;
                remaining_threads &= remaining_threads - 1;
                if let Instruction::Character(matcher) = &instructions[program_counter] {
                    if character_matcher_accepts(matcher, character as u32) {
                        advanced_threads |= 1u64 << (program_counter + 1);
                    }
                }
            }
        }
    }
}
