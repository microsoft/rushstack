use super::character_sets::{
    character_for_control_escape, character_for_identity_escape_of_syntax_character,
    CodePointRange, DIGIT_CODE_POINTS, WHITESPACE_AND_LINE_TERMINATOR_CODE_POINTS,
    WORD_CODE_POINTS,
};
use super::syntax_tree::{CharacterMatcher, PatternParser};

enum ClassAtom {
    CodePoint(u32),
    Set(&'static [CodePointRange]),
}

const TYPICAL_CLASS_RANGE_COUNT: usize = 4;
const LAST_CODE_POINT_THAT_IS_ONE_UTF16_CODE_UNIT: u32 = 0xffff;

impl PatternParser {
    pub(super) fn parse_class_after_opening_bracket(&mut self) -> Option<CharacterMatcher> {
        let negated = self.peek() == Some('^');
        if negated {
            self.position += 1;
        }
        let mut ranges: Vec<CodePointRange> = Vec::with_capacity(TYPICAL_CLASS_RANGE_COUNT);
        loop {
            if self.peek()? == ']' {
                self.position += 1;
                return Some(CharacterMatcher::Ranges(ranges, negated));
            }
            let first = self.parse_class_atom()?;
            let is_range =
                self.peek() == Some('-') && self.peek_after(1).is_some_and(|next| next != ']');
            match first {
                ClassAtom::CodePoint(low) if is_range => {
                    self.position += 1;
                    match self.parse_class_atom()? {
                        ClassAtom::CodePoint(high) if high >= low => ranges.push((low, high)),
                        _ => return None,
                    }
                }
                ClassAtom::CodePoint(code_point) => ranges.push((code_point, code_point)),
                ClassAtom::Set(_) if is_range => return None,
                ClassAtom::Set(set) => ranges.extend_from_slice(set),
            }
        }
    }

    fn parse_class_atom(&mut self) -> Option<ClassAtom> {
        let next = self.peek()?;
        self.position += 1;
        if next != '\\' {
            if next as u32 > LAST_CODE_POINT_THAT_IS_ONE_UTF16_CODE_UNIT {
                return None;
            }
            return Some(ClassAtom::CodePoint(next as u32));
        }
        let escape = self.peek()?;
        self.position += 1;
        Some(match escape {
            'd' => ClassAtom::Set(DIGIT_CODE_POINTS),
            'w' => ClassAtom::Set(WORD_CODE_POINTS),
            's' => ClassAtom::Set(WHITESPACE_AND_LINE_TERMINATOR_CODE_POINTS),
            'b' => ClassAtom::CodePoint(0x08),
            '-' => ClassAtom::CodePoint('-' as u32),
            other => ClassAtom::CodePoint(
                character_for_control_escape(other)
                    .or_else(|| character_for_identity_escape_of_syntax_character(other))?
                    as u32,
            ),
        })
    }
}
