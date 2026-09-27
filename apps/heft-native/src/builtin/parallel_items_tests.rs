use super::parallel_items::{attempt_every_item_in_order, process_items_in_order, worker_count_for, MAXIMUM_WORKER_COUNT, SEQUENTIAL_ONLY};

fn scratch_folder(name: &str) -> std::path::PathBuf {
    let folder = std::env::temp_dir().join(format!("heft-native-parallel-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&folder);
    std::fs::create_dir_all(&folder).unwrap();
    folder
}

#[test]
fn outputs_are_in_item_order_with_and_without_workers() {
    let items: Vec<usize> = (0..1000).collect();
    for minimum_items_per_worker in [1, 64, SEQUENTIAL_ONLY] {
        let mut outputs = vec![0usize; items.len()];
        let result: Result<(), ()> = process_items_in_order(&items, &mut outputs, minimum_items_per_worker, &|item, output| {
            *output = item * 3;
            Ok(())
        });
        assert!(result.is_ok());
        assert!(outputs.iter().enumerate().all(|(index, output)| *output == index * 3));
    }
}

#[test]
fn the_first_failing_item_in_order_is_reported_and_earlier_items_are_all_processed() {
    let items: Vec<usize> = (0..997).collect();
    for failing_items in [vec![990], vec![5, 600], vec![700, 260, 998], vec![0]] {
        let mut outputs = vec![false; items.len()];
        let result = process_items_in_order(&items, &mut outputs, 8, &|item, output| {
            if failing_items.contains(item) {
                return Err(*item);
            }
            *output = true;
            Ok(())
        });
        let first_failing_item = failing_items.iter().copied().filter(|item| *item < items.len()).min();
        assert_eq!(result.err(), first_failing_item);
        assert!(outputs[..first_failing_item.unwrap_or(items.len())].iter().all(|output| *output));
    }
}

#[test]
fn items_of_a_worker_that_dies_are_processed_by_the_parent() {
    let parent_process_id = std::process::id();
    let items: Vec<usize> = (0..400).collect();
    let mut outputs = vec![0usize; items.len()];
    let result: Result<(), usize> = process_items_in_order(&items, &mut outputs, 8, &|item, output| {
        if *item == 250 && std::process::id() != parent_process_id {
            std::process::abort();
        }
        *output = item + 1;
        Ok(())
    });
    assert!(result.is_ok());
    assert!(outputs.iter().enumerate().all(|(index, output)| *output == index + 1));
}

#[test]
fn every_item_is_attempted_and_the_first_failure_in_order_is_reported() {
    let items: Vec<usize> = (0..1000).collect();
    for minimum_items_per_worker in [1, 16, SEQUENTIAL_ONLY] {
        let folder = scratch_folder(&format!("attempt-{minimum_items_per_worker}"));
        let first_failure = attempt_every_item_in_order(&items, minimum_items_per_worker, &|item| {
            std::fs::write(folder.join(format!("{item}.txt")), b"x").map_err(|_| usize::MAX)?;
            if *item == 999 || *item == 420 || *item == 421 {
                return Err(*item);
            }
            Ok(())
        });
        assert_eq!(first_failure, Some(420));
        assert_eq!(std::fs::read_dir(&folder).unwrap().count(), items.len());
        std::fs::remove_dir_all(&folder).unwrap();
    }
    assert_eq!(attempt_every_item_in_order(&items, 1, &|_| Ok::<(), usize>(())), None);
}

#[test]
fn empty_and_tiny_inputs_never_start_workers() {
    assert_eq!(worker_count_for(0, 64), 1);
    assert_eq!(worker_count_for(6, 64), 1);
    assert_eq!(worker_count_for(127, 64), 1);
    assert_eq!(worker_count_for(100_000, SEQUENTIAL_ONLY), 1);
    assert!(worker_count_for(100_000, 64) <= MAXIMUM_WORKER_COUNT);
}
