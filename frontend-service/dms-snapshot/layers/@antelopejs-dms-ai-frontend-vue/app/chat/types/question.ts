interface QuestionOptionData {
	label: string;
	description: string;
	preview?: string;
}

export interface QuestionData {
	question: string;
	header: string;
	options: QuestionOptionData[];
}

export interface QuestionRequestData {
	requestId: string;
	conversationId: string;
	questions: QuestionData[];
	createdAtMs: number;
	expiresAtMs: number;
}

/** One question's answer: an option label, the user's own words, or skipped. */
export interface QuestionReply {
	answer: string;
	isCustom: boolean;
	skipped: boolean;
}
