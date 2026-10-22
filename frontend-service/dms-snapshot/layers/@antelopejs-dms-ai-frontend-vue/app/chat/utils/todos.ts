import {
	MESSAGE_ROLES,
	TODO_STATUS,
	TODO_WRITE_TOOL_NAME,
} from "../constants/conversation";
import type {
	ConversationMessage,
	ToolCallMessage,
} from "../types/conversation";

type TodoItemStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
	content: string;
	status: TodoItemStatus;
	activeForm: string;
}

const TODO_STATUS_VALUES: readonly TodoItemStatus[] = [
	TODO_STATUS.PENDING,
	TODO_STATUS.IN_PROGRESS,
	TODO_STATUS.COMPLETED,
];

function toStatus(value: unknown): TodoItemStatus {
	return TODO_STATUS_VALUES.includes(value as TodoItemStatus)
		? (value as TodoItemStatus)
		: TODO_STATUS.PENDING;
}

function toTodo(value: unknown): TodoItem | null {
	if (value === null || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	const content = typeof record.content === "string" ? record.content : "";
	if (content.length === 0) return null;
	const activeForm =
		typeof record.activeForm === "string" && record.activeForm.length > 0
			? record.activeForm
			: content;
	return { content, status: toStatus(record.status), activeForm };
}

function extractTodos(args: unknown): TodoItem[] {
	if (args === null || typeof args !== "object") return [];
	const todos = (args as Record<string, unknown>).todos;
	if (!Array.isArray(todos)) return [];
	return todos.map(toTodo).filter((todo): todo is TodoItem => todo !== null);
}

export function isTodoWrite(message: ConversationMessage): boolean {
	return (
		message.role === MESSAGE_ROLES.TOOL &&
		message.toolName === TODO_WRITE_TOOL_NAME
	);
}

export function latestTodos(messages: ConversationMessage[]): TodoItem[] {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (!isTodoWrite(message)) continue;
		return extractTodos((message as ToolCallMessage).args);
	}
	return [];
}
