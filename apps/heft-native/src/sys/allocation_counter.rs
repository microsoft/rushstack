#![allow(unsafe_code)]

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

pub struct AllocationCountingSystemAllocator;

thread_local! {
    static ALLOCATIONS_ON_THIS_THREAD: Cell<usize> = const { Cell::new(0) };
    static ALLOCATED_BYTES_ON_THIS_THREAD: Cell<usize> = const { Cell::new(0) };
    static LIVE_BYTES_ON_THIS_THREAD: Cell<isize> = const { Cell::new(0) };
    static PEAK_LIVE_BYTES_ON_THIS_THREAD: Cell<isize> = const { Cell::new(0) };
}

fn record_one_allocation_on_this_thread(allocated_byte_count: usize) {
    let _ = ALLOCATIONS_ON_THIS_THREAD.try_with(|count| count.set(count.get() + 1));
    let _ = ALLOCATED_BYTES_ON_THIS_THREAD.try_with(|bytes| bytes.set(bytes.get() + allocated_byte_count));
    change_live_bytes_on_this_thread(allocated_byte_count as isize);
}

fn change_live_bytes_on_this_thread(byte_delta: isize) {
    let live_bytes_now = LIVE_BYTES_ON_THIS_THREAD
        .try_with(|live_bytes| {
            live_bytes.set(live_bytes.get() + byte_delta);
            live_bytes.get()
        })
        .unwrap_or(0);
    let _ = PEAK_LIVE_BYTES_ON_THIS_THREAD.try_with(|peak_live_bytes| {
        if live_bytes_now > peak_live_bytes.get() {
            peak_live_bytes.set(live_bytes_now);
        }
    });
}

unsafe impl GlobalAlloc for AllocationCountingSystemAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        record_one_allocation_on_this_thread(layout.size());
        System.alloc(layout)
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        record_one_allocation_on_this_thread(layout.size());
        System.alloc_zeroed(layout)
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        record_one_allocation_on_this_thread(new_size);
        change_live_bytes_on_this_thread(-(layout.size() as isize));
        System.realloc(pointer, layout, new_size)
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        change_live_bytes_on_this_thread(-(layout.size() as isize));
        System.dealloc(pointer, layout)
    }
}

#[global_allocator]
static ALLOCATION_COUNTING_SYSTEM_ALLOCATOR: AllocationCountingSystemAllocator =
    AllocationCountingSystemAllocator;

pub fn count_allocations_on_this_thread_while_running<Output>(
    work: impl FnOnce() -> Output,
) -> (Output, usize) {
    let allocations_before = ALLOCATIONS_ON_THIS_THREAD.with(Cell::get);
    let output = work();
    let allocations_after = ALLOCATIONS_ON_THIS_THREAD.with(Cell::get);
    (output, allocations_after - allocations_before)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AllocationsMadeOnThisThread {
    pub allocation_count: usize,
    pub allocated_byte_count: usize,
    pub peak_live_bytes_above_start: isize,
    pub live_bytes_left_above_start: isize,
}

pub fn measure_allocations_on_this_thread_while_running<Output>(
    work: impl FnOnce() -> Output,
) -> (Output, AllocationsMadeOnThisThread) {
    let allocations_before = ALLOCATIONS_ON_THIS_THREAD.with(Cell::get);
    let allocated_bytes_before = ALLOCATED_BYTES_ON_THIS_THREAD.with(Cell::get);
    let live_bytes_before = LIVE_BYTES_ON_THIS_THREAD.with(Cell::get);
    PEAK_LIVE_BYTES_ON_THIS_THREAD.with(|peak_live_bytes| peak_live_bytes.set(live_bytes_before));
    let output = work();
    let allocations_made = AllocationsMadeOnThisThread {
        allocation_count: ALLOCATIONS_ON_THIS_THREAD.with(Cell::get) - allocations_before,
        allocated_byte_count: ALLOCATED_BYTES_ON_THIS_THREAD.with(Cell::get) - allocated_bytes_before,
        peak_live_bytes_above_start: PEAK_LIVE_BYTES_ON_THIS_THREAD.with(Cell::get) - live_bytes_before,
        live_bytes_left_above_start: LIVE_BYTES_ON_THIS_THREAD.with(Cell::get) - live_bytes_before,
    };
    (output, allocations_made)
}
