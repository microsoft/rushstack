mod compile_applicator_keywords;
mod compile_node;
mod compile_object_keywords;
mod compile_value_keywords;
mod compiled_node;
mod compiler;
mod data_rules;
mod keyword_tables;
mod schema_keywords;
mod validator;
mod validator_objects;

pub use compiler::{compile_json_schema_for_fast_validation, CompiledJsonSchema};

#[cfg(test)]
mod tests_allocation_counts;
#[cfg(test)]
mod tests_schema_soundness;
