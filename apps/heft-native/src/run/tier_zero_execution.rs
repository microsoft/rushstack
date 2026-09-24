use std::time::Instant;

use super::tier_zero_plan::{TierZeroPlan, TierZeroStep};
use crate::builtin::{run_delete_operations, run_planned_builtin_task, AbsoluteFileSelection};
use crate::terminal::{
    bold, format_rounded_milliseconds_as_seconds, format_seconds_with_three_fraction_digits, green, red,
    ClosedOutput, HeftConsole,
};

const MISSING_PHASE_DEPENDENCIES_NOTICE: &str =
    "The provided list of phases does not contain all phase dependencies. You may need to run the excluded phases manually.";

pub enum TierZeroExit {
    Code(i32),
    OutputClosed(ClosedOutput),
}

fn stop_if_output_closed(console: &HeftConsole) -> Result<(), TierZeroExit> {
    match console.closed_output() {
        Some(closed_output) => Err(TierZeroExit::OutputClosed(closed_output)),
        None => Ok(()),
    }
}

pub fn execute_tier_zero_clean(
    selections: &[AbsoluteFileSelection],
    alias_expansion_message: Option<&str>,
    console: &HeftConsole,
) -> TierZeroExit {
    if let Some(alias_expansion_message) = alias_expansion_message {
        console.write_line(alias_expansion_message);
        if let Err(closed) = stop_if_output_closed(console) {
            return closed;
        }
    }
    let run_started_at = Instant::now();
    let result = run_delete_operations(selections, &console.unprefixed_output());
    if let Err(closed) = stop_if_output_closed(console) {
        return closed;
    }
    write_summary(console, run_started_at, result.is_err());
    let exit_code = match result {
        Ok(()) => 0,
        Err(failure) => {
            console.write_error_line(&format!("Error: {}", failure.message));
            1
        }
    };
    stop_if_output_closed(console).map_or_else(|closed| closed, |()| TierZeroExit::Code(exit_code))
}

pub fn execute_tier_zero_plan(plan: TierZeroPlan, console: &HeftConsole) -> TierZeroExit {
    match execute_steps(plan, console) {
        Ok(exit_code) => TierZeroExit::Code(exit_code),
        Err(closed) => closed,
    }
}

fn execute_steps(plan: TierZeroPlan, console: &HeftConsole) -> Result<i32, TierZeroExit> {
    if let Some(alias_expansion_message) = &plan.alias_expansion_message {
        console.write_line(alias_expansion_message);
    }
    if plan.selection_is_missing_phase_dependencies {
        console.write_line(&bold(MISSING_PHASE_DEPENDENCIES_NOTICE));
    }
    stop_if_output_closed(console)?;
    let run_started_at = Instant::now();
    let mut phase_started_at = run_started_at;
    let mut encountered_error = false;
    for planned_step in plan.steps {
        let step_result = match planned_step.step {
            TierZeroStep::StartPhase { phase_name, clean_selections } => {
                phase_started_at = Instant::now();
                console.write_line(&format!(" ---- {phase_name} started ---- "));
                stop_if_output_closed(console)?;
                match clean_selections {
                    Some(selections) => {
                        run_delete_operations(&selections, &console.scoped_logger_output(&format!("{phase_name}:clean")))
                    }
                    None => Ok(()),
                }
            }
            TierZeroStep::RunTask { logger_name, planned_task } => {
                run_planned_builtin_task(planned_task, &console.scoped_logger_output(&logger_name))
            }
        };
        stop_if_output_closed(console)?;
        let phase_duration_in_seconds = phase_started_at.elapsed().as_secs_f64();
        if let Err(failure) = &step_result {
            encountered_error = true;
            if !failure.message.is_empty() {
                console.write_error_line(&failure.message);
            }
        }
        if planned_step.completes_phase {
            let finished_logging_word = if encountered_error { "encountered an error" } else { "finished" };
            console.write_line(&format!(
                " ---- {} {finished_logging_word} ({}s) ---- ",
                planned_step.phase_name,
                format_seconds_with_three_fraction_digits(phase_duration_in_seconds)
            ));
        }
        stop_if_output_closed(console)?;
        if encountered_error {
            break;
        }
    }
    write_summary(console, run_started_at, encountered_error);
    stop_if_output_closed(console)?;
    Ok(if encountered_error { 1 } else { 0 })
}

fn write_summary(console: &HeftConsole, run_started_at: Instant, encountered_error: bool) {
    let run_duration_in_milliseconds = run_started_at.elapsed().as_secs_f64() * 1000.0;
    let finished_logging_word = if encountered_error { "Failed" } else { "Finished" };
    let finished_logging_line = format!(
        "-------------------- {finished_logging_word} ({}s) --------------------",
        format_rounded_milliseconds_as_seconds(run_duration_in_milliseconds)
    );
    let colorize = if encountered_error { red } else { green };
    console.write_line(&bold(&colorize(&finished_logging_line)));
}
