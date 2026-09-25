use super::character_sets::{
    character_for_control_escape, character_for_identity_escape_of_syntax_character,
    CodePointRange, DIGIT_CODE_POINTS, LINE_TERMINATOR_CODE_POINTS,
    WHITESPACE_AND_LINE_TERMINATOR_CODE_POINTS, WORD_CODE_POINTS,
};

#[derive(Clone)]
pub(super) enum CharacterMatcher {
    Single(u32),
    Predefined(&'static [CodePointRange], bool),
    Ranges(Vec<CodePointRange>, bool),
}

pub(super) enum SyntaxNode {
    Character(CharacterMatcher),
    StartAnchor,
    EndAnchor,
    Sequence(Vec<SyntaxNode>),
    Alternation(Vec<SyntaxNode>),
    Repetition(Box<SyntaxNode>, u32, Option<u32>),
}

pub(super) const MAXIMUM_REPETITION_BOUND: u32 = 100;

pub(super) struct PatternParser {
    pub(super) characters: Vec<char>,
    pub(super) position: usize,
}

impl PatternParser {
    pub(super) fn peek(&self) -> Option<char> {
        self.characters.get(self.position).copied()
    }

    pub(super) fn peek_after(&self, offset: usize) -> Option<char> {
        self.characters.get(self.position + offset).copied()
    }

    pub(super) fn parse_disjunction(&mut self) -> Option<SyntaxNode> {
        let mut alternatives = vec![self.parse_alternative()?];
        while self.peek() == Some('|') {
            self.position += 1;
            alternatives.push(self.parse_alternative()?);
        }
        if alternatives.len() == 1 {
            alternatives.pop()
        } else {
            Some(SyntaxNode::Alternation(alternatives))
        }
    }

    fn parse_alternative(&mut self) -> Option<SyntaxNode> {
        let mut terms = Vec::new();
        while let Some(next) = self.peek() {
            if next == '|' || next == ')' {
                break;
            }
            terms.push(self.parse_term()?);
        }
        Some(SyntaxNode::Sequence(terms))
    }

    fn parse_term(&mut self) -> Option<SyntaxNode> {
        let next = self.peek()?;
        self.position += 1;
        let atom = match next {
            '^' => return Some(SyntaxNode::StartAnchor),
            '$' => return Some(SyntaxNode::EndAnchor),
            '(' => self.parse_group_after_opening_parenthesis()?,
            '.' => SyntaxNode::Character(CharacterMatcher::Predefined(
                LINE_TERMINATOR_CODE_POINTS,
                true,
            )),
            '[' => SyntaxNode::Character(self.parse_class_after_opening_bracket()?),
            '\\' => SyntaxNode::Character(self.parse_atom_escape_after_backslash()?),
            '*' | '+' | '?' | '{' | '}' | ']' | ')' | '|' => return None,
            literal => SyntaxNode::Character(CharacterMatcher::Single(literal as u32)),
        };
        self.parse_optional_quantifier(atom)
    }

    fn parse_group_after_opening_parenthesis(&mut self) -> Option<SyntaxNode> {
        if self.peek() == Some('?') {
            if self.peek_after(1) != Some(':') {
                return None;
            }
            self.position += 2;
        }
        let inner = self.parse_disjunction()?;
        if self.peek() != Some(')') {
            return None;
        }
        self.position += 1;
        Some(inner)
    }

    fn parse_atom_escape_after_backslash(&mut self) -> Option<CharacterMatcher> {
        let escape = self.peek()?;
        self.position += 1;
        Some(match escape {
            'd' => CharacterMatcher::Predefined(DIGIT_CODE_POINTS, false),
            'D' => CharacterMatcher::Predefined(DIGIT_CODE_POINTS, true),
            'w' => CharacterMatcher::Predefined(WORD_CODE_POINTS, false),
            'W' => CharacterMatcher::Predefined(WORD_CODE_POINTS, true),
            's' => CharacterMatcher::Predefined(WHITESPACE_AND_LINE_TERMINATOR_CODE_POINTS, false),
            'S' => CharacterMatcher::Predefined(WHITESPACE_AND_LINE_TERMINATOR_CODE_POINTS, true),
            other => CharacterMatcher::Single(
                character_for_control_escape(other)
                    .or_else(|| character_for_identity_escape_of_syntax_character(other))?
                    as u32,
            ),
        })
    }

    fn parse_decimal_bound(&mut self) -> Option<u32> {
        let start = self.position;
        while matches!(self.peek(), Some('0'..='9')) {
            self.position += 1;
        }
        if self.position == start || self.position - start > 4 {
            return None;
        }
        self.characters[start..self.position]
            .iter()
            .try_fold(0u32, |bound, digit| Some(bound * 10 + digit.to_digit(10)?))
    }

    fn parse_optional_quantifier(&mut self, atom: SyntaxNode) -> Option<SyntaxNode> {
        let (minimum, maximum) = match self.peek() {
            Some('*') => {
                self.position += 1;
                (0, None)
            }
            Some('+') => {
                self.position += 1;
                (1, None)
            }
            Some('?') => {
                self.position += 1;
                (0, Some(1))
            }
            Some('{') => {
                self.position += 1;
                self.parse_braced_quantifier_bounds()?
            }
            _ => return Some(atom),
        };
        if self.peek() == Some('?') {
            self.position += 1;
        }
        Some(SyntaxNode::Repetition(Box::new(atom), minimum, maximum))
    }

    fn parse_braced_quantifier_bounds(&mut self) -> Option<(u32, Option<u32>)> {
        let minimum = self.parse_decimal_bound()?;
        let maximum = if self.peek() == Some(',') {
            self.position += 1;
            if self.peek() == Some('}') {
                None
            } else {
                Some(self.parse_decimal_bound()?)
            }
        } else {
            Some(minimum)
        };
        if self.peek() != Some('}') {
            return None;
        }
        self.position += 1;
        let bounds_are_supported = minimum <= MAXIMUM_REPETITION_BOUND
            && maximum.is_none_or(|upper| upper >= minimum && upper <= MAXIMUM_REPETITION_BOUND);
        if !bounds_are_supported {
            return None;
        }
        Some((minimum, maximum))
    }
}
