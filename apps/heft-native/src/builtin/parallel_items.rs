pub use super::worker_transfer::WorkerTransfer;
use super::worker_transfer::{
    finish_worker_process, start_worker_process, CHUNK_COMPLETE_RECORD, ITEM_DONE_RECORD, ITEM_FAILED_RECORD,
};

pub const MAXIMUM_WORKER_COUNT: usize = 4;
pub const SEQUENTIAL_ONLY: usize = usize::MAX;

pub fn worker_count_for(item_count: usize, minimum_items_per_worker: usize) -> usize {
    let wanted_worker_count = (item_count / minimum_items_per_worker.max(1)).clamp(1, MAXIMUM_WORKER_COUNT);
    if wanted_worker_count == 1 || !cfg!(target_os = "linux") || !this_process_may_fork_workers() {
        return 1;
    }
    wanted_worker_count
}

fn this_process_may_fork_workers() -> bool {
    cfg!(test) || std::fs::read_dir("/proc/self/task").is_ok_and(|threads| threads.count() == 1)
}

trait ItemRunner {
    fn run_in_worker(&mut self, item_index: usize, results: &mut Vec<u8>) -> bool;
    fn run_here(&mut self, item_index: usize) -> bool;
    fn accept_output(&mut self, item_index: usize, results: &mut &[u8]) -> bool;
    fn accept_failure(&mut self, item_index: usize, results: &mut &[u8]);
}

struct TypedItemRunner<'run, Item, Output, Failure, ProcessItem> {
    items: &'run [Item],
    outputs: &'run mut [Output],
    failures: Vec<(usize, Failure)>,
    process_item: &'run ProcessItem,
}

impl<Item, Output, Failure, ProcessItem> ItemRunner for TypedItemRunner<'_, Item, Output, Failure, ProcessItem>
where
    Output: WorkerTransfer,
    Failure: WorkerTransfer,
    ProcessItem: Fn(&Item, &mut Output) -> Result<(), Failure>,
{
    fn run_in_worker(&mut self, item_index: usize, results: &mut Vec<u8>) -> bool {
        match (self.process_item)(&self.items[item_index], &mut self.outputs[item_index]) {
            Ok(()) => {
                results.push(ITEM_DONE_RECORD);
                self.outputs[item_index].append_to(results);
                true
            }
            Err(failure) => {
                results.push(ITEM_FAILED_RECORD);
                failure.append_to(results);
                false
            }
        }
    }

    fn run_here(&mut self, item_index: usize) -> bool {
        let result = (self.process_item)(&self.items[item_index], &mut self.outputs[item_index]);
        result.map_err(|failure| self.failures.push((item_index, failure))).is_ok()
    }

    fn accept_output(&mut self, item_index: usize, results: &mut &[u8]) -> bool {
        Output::take_from(results).map(|output| self.outputs[item_index] = output).is_some()
    }

    fn accept_failure(&mut self, item_index: usize, results: &mut &[u8]) {
        self.failures.extend(Failure::take_from(results).map(|failure| (item_index, failure)));
    }
}

pub fn process_items_in_order<Item, Output: WorkerTransfer, Failure: WorkerTransfer>(
    items: &[Item],
    outputs: &mut [Output],
    minimum_items_per_worker: usize,
    process_item: &impl Fn(&Item, &mut Output) -> Result<(), Failure>,
) -> Result<(), Failure> {
    let worker_count = worker_count_for(items.len(), minimum_items_per_worker);
    let mut item_is_done = vec![false; items.len()];
    let mut runner = TypedItemRunner { items, outputs, failures: Vec::new(), process_item };
    if worker_count > 1 {
        run_items_with_worker_processes(&mut runner, items.len(), worker_count, &mut item_is_done);
    }
    let TypedItemRunner { outputs, failures, .. } = runner;
    let mut failures = failures.into_iter().peekable();
    for (item_index, ((item, output), is_done)) in items.iter().zip(outputs.iter_mut()).zip(item_is_done).enumerate() {
        if is_done {
            continue;
        }
        if let Some((_, failure)) = failures.next_if(|(failure_index, _)| *failure_index == item_index) {
            return Err(failure);
        }
        process_item(item, output)?;
    }
    Ok(())
}

fn run_items_with_worker_processes(runner: &mut dyn ItemRunner, item_count: usize, worker_count: usize, item_is_done: &mut [bool]) {
    let chunk_length = item_count.div_ceil(worker_count);
    let mut running_workers = Vec::new();
    for first_item_index in (chunk_length..item_count).step_by(chunk_length) {
        let item_range = first_item_index..(first_item_index + chunk_length).min(item_count);
        let run_chunk = &mut |results: &mut Vec<u8>| {
            for item_index in item_range.clone() {
                if !runner.run_in_worker(item_index, results) {
                    return;
                }
            }
        };
        if let Some(running_worker) = start_worker_process(run_chunk) {
            running_workers.push((item_range, running_worker));
        }
    }
    for (item_index, is_done) in item_is_done[..chunk_length.min(item_count)].iter_mut().enumerate() {
        if !runner.run_here(item_index) {
            break;
        }
        *is_done = true;
    }
    for (item_range, running_worker) in running_workers {
        let results = finish_worker_process(running_worker).unwrap_or_default();
        let mut remaining_results = results.as_slice();
        let mut item_index = item_range.start;
        while let Some((&record, record_body)) = remaining_results.split_first() {
            remaining_results = record_body;
            if record == ITEM_FAILED_RECORD {
                runner.accept_failure(item_index, &mut remaining_results);
                break;
            }
            if record != ITEM_DONE_RECORD || item_index >= item_range.end || !runner.accept_output(item_index, &mut remaining_results) {
                break;
            }
            item_is_done[item_index] = true;
            item_index += 1;
        }
    }
}

pub fn attempt_every_item_in_order<Item, Failure: WorkerTransfer>(
    items: &[Item],
    minimum_items_per_worker: usize,
    attempt_item: &impl Fn(&Item) -> Result<(), Failure>,
) -> Option<Failure> {
    let worker_count = worker_count_for(items.len(), minimum_items_per_worker);
    if worker_count == 1 {
        return first_failure_attempting_every_item(items, attempt_item);
    }
    let chunk_length = items.len().div_ceil(worker_count);
    let mut running_workers = Vec::new();
    for chunk_items in items.chunks(chunk_length).skip(1) {
        let run_chunk = &mut |results: &mut Vec<u8>| {
            if let Some(failure) = first_failure_attempting_every_item(chunk_items, attempt_item) {
                results.push(ITEM_FAILED_RECORD);
                failure.append_to(results);
            }
        };
        running_workers.push((chunk_items, start_worker_process(run_chunk)));
    }
    let mut first_failure = first_failure_attempting_every_item(&items[..chunk_length], attempt_item);
    for (chunk_items, running_worker) in running_workers {
        let results = running_worker.and_then(finish_worker_process);
        let reported_failure = match results.as_deref().and_then(<[u8]>::split_last) {
            Some((&CHUNK_COMPLETE_RECORD, [])) => Some(None),
            Some((&CHUNK_COMPLETE_RECORD, [ITEM_FAILED_RECORD, failure_bytes @ ..])) => {
                Failure::take_from(&mut &failure_bytes[..]).map(Some)
            }
            _ => None,
        };
        let worker_failure = reported_failure.unwrap_or_else(|| first_failure_attempting_every_item(chunk_items, attempt_item));
        first_failure = first_failure.or(worker_failure);
    }
    first_failure
}

fn first_failure_attempting_every_item<Item, Failure>(
    items: &[Item],
    attempt_item: &impl Fn(&Item) -> Result<(), Failure>,
) -> Option<Failure> {
    let mut first_failure = None;
    for item in items {
        if let Err(failure) = attempt_item(item) {
            first_failure.get_or_insert(failure);
        }
    }
    first_failure
}
