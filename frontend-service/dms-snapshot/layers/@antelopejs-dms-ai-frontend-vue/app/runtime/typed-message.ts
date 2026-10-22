export interface TypedMessage {
	type: string;
}

/** Whether `value` is an object carrying a string `type`, as every protocol message does. */
export function isTypedMessage<T extends TypedMessage = TypedMessage>(
	value: unknown,
): value is T {
	if (value === null || typeof value !== "object") return false;
	return typeof Reflect.get(value, "type") === "string";
}
