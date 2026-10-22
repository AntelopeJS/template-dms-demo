const UUID_BYTE_COUNT = 16;
const VERSION_BYTE_INDEX = 6;
const VARIANT_BYTE_INDEX = 8;
const VERSION_MASK = 0x0f;
const VERSION_4 = 0x40;
const VARIANT_MASK = 0x3f;
const VARIANT_RFC_4122 = 0x80;
const HEX_RADIX = 16;
const HEX_BYTE_WIDTH = 2;
const UUID_GROUP_ENDS = [8, 12, 16, 20, 32];

function formatUuid(bytes: Uint8Array): string {
	const hex = Array.from(bytes, (byte) =>
		byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, "0"),
	).join("");
	return UUID_GROUP_ENDS.map((end, index) =>
		hex.slice(UUID_GROUP_ENDS[index - 1] ?? 0, end),
	).join("-");
}

/**
 * A random v4 UUID. `crypto.randomUUID` only exists in secure contexts, and the
 * chat is also opened over plain HTTP from another machine (a LAN or Tailscale
 * address), where `crypto.getRandomValues` is still there.
 */
export function newUuid(): string {
	if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
	const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTE_COUNT));
	bytes[VERSION_BYTE_INDEX] =
		(bytes[VERSION_BYTE_INDEX] & VERSION_MASK) | VERSION_4;
	bytes[VARIANT_BYTE_INDEX] =
		(bytes[VARIANT_BYTE_INDEX] & VARIANT_MASK) | VARIANT_RFC_4122;
	return formatUuid(bytes);
}
