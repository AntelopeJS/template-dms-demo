import type { SkillRow, SkillSource } from "../types";

type SkillTone = "primary" | "warning" | "neutral";

export interface SkillLook {
	icon: string;
	/** Tone of the icon well. */
	tone: SkillTone;
	/** Tone of the source badge. */
	badgeTone: SkillTone;
}

const SOURCE_LOOKS: Record<SkillSource, SkillLook> = {
	module: { icon: "i-ph-package", tone: "primary", badgeTone: "neutral" },
	local: { icon: "i-ph-desktop", tone: "warning", badgeTone: "warning" },
};
const SHADOWED_TONE = "neutral";

/** Icon and well tone of a skill: its own icon, else its source's. */
export function skillLook(skill: SkillRow): SkillLook {
	const look = SOURCE_LOOKS[skill.source] ?? SOURCE_LOOKS.module;
	return {
		icon: skill.icon ?? look.icon,
		tone: skill.isShadowed ? SHADOWED_TONE : look.tone,
		badgeTone: look.badgeTone,
	};
}
