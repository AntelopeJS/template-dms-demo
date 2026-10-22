export interface BackoffState {
	index: number;
}

export function createBackoff(): BackoffState {
	return { index: 0 };
}

function readScheduleAt(schedule: readonly number[], index: number): number {
	const value = schedule[index];
	if (value === undefined) return 0;
	return value;
}

export function nextDelay(
	state: BackoffState,
	schedule: readonly number[],
): number {
	const cappedIndex = Math.min(state.index, schedule.length - 1);
	const delay = readScheduleAt(schedule, cappedIndex);
	state.index += 1;
	return delay;
}

export function resetBackoff(state: BackoffState): void {
	state.index = 0;
}
