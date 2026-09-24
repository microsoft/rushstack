use super::syntax_tree::{CharacterMatcher, SyntaxNode};

pub(super) enum Instruction {
    Character(CharacterMatcher),
    Split(usize, usize),
    Jump(usize),
    AssertStart,
    AssertEnd,
    Match,
}

const MAXIMUM_PROGRAM_LENGTH: usize = 4096;

pub(super) struct ProgramBuilder {
    pub(super) instructions: Vec<Instruction>,
}

impl ProgramBuilder {
    fn emit(&mut self, instruction: Instruction) -> Option<usize> {
        if self.instructions.len() >= MAXIMUM_PROGRAM_LENGTH {
            return None;
        }
        self.instructions.push(instruction);
        Some(self.instructions.len() - 1)
    }

    pub(super) fn emit_final_match(&mut self) -> Option<()> {
        self.emit(Instruction::Match).map(|_| ())
    }

    pub(super) fn compile_node(&mut self, node: &SyntaxNode) -> Option<()> {
        match node {
            SyntaxNode::Character(matcher) => {
                self.emit(Instruction::Character(matcher.clone()))?;
            }
            SyntaxNode::StartAnchor => {
                self.emit(Instruction::AssertStart)?;
            }
            SyntaxNode::EndAnchor => {
                self.emit(Instruction::AssertEnd)?;
            }
            SyntaxNode::Sequence(items) => {
                for item in items {
                    self.compile_node(item)?;
                }
            }
            SyntaxNode::Alternation(alternatives) => self.compile_alternation(alternatives)?,
            SyntaxNode::Repetition(inner, minimum, maximum) => {
                self.compile_repetition(inner, *minimum, *maximum)?
            }
        }
        Some(())
    }

    fn compile_alternation(&mut self, alternatives: &[SyntaxNode]) -> Option<()> {
        let mut jumps_to_end = Vec::with_capacity(alternatives.len());
        for (index, alternative) in alternatives.iter().enumerate() {
            if index + 1 == alternatives.len() {
                self.compile_node(alternative)?;
                continue;
            }
            let split = self.emit(Instruction::Split(0, 0))?;
            self.compile_node(alternative)?;
            jumps_to_end.push(self.emit(Instruction::Jump(0))?);
            let next_alternative = self.instructions.len();
            self.instructions[split] = Instruction::Split(split + 1, next_alternative);
        }
        let end = self.instructions.len();
        for jump in jumps_to_end {
            self.instructions[jump] = Instruction::Jump(end);
        }
        Some(())
    }

    fn compile_repetition(
        &mut self,
        inner: &SyntaxNode,
        minimum: u32,
        maximum: Option<u32>,
    ) -> Option<()> {
        for _ in 0..minimum {
            self.compile_node(inner)?;
        }
        match maximum {
            None => {
                let split = self.emit(Instruction::Split(0, 0))?;
                self.compile_node(inner)?;
                self.emit(Instruction::Jump(split))?;
                let after_loop = self.instructions.len();
                self.instructions[split] = Instruction::Split(split + 1, after_loop);
            }
            Some(maximum) => {
                let mut optional_splits = Vec::with_capacity((maximum - minimum) as usize);
                for _ in minimum..maximum {
                    optional_splits.push(self.emit(Instruction::Split(0, 0))?);
                    self.compile_node(inner)?;
                }
                let after_optional_copies = self.instructions.len();
                for split in optional_splits {
                    self.instructions[split] = Instruction::Split(split + 1, after_optional_copies);
                }
            }
        }
        Some(())
    }
}
