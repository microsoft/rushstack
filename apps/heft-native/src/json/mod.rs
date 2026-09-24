mod cursor;
mod duplicate_key_index;
mod lexer_number;
mod lexer_string;
mod lexer_trivia;
mod parser;
mod value;
mod writer;

pub use parser::{parse_json_exactly_like_json_parse, parse_json_with_comments_exactly_like_jju};
pub use value::{JsonNumber, JsonObject, JsonValue};
pub use writer::{write_json_for_javascript, write_json_string_for_javascript};

#[cfg(test)]
mod tests_allocation_counts;
#[cfg(test)]
mod tests_large_objects;
#[cfg(test)]
mod tests_parser_acceptance;
#[cfg(test)]
mod tests_zero_copy_and_writer;
