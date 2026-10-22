import { computed, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type {
	ApiDataRequest,
	ApiDataResult,
	ApiPagedDataHandler,
	ApiPagedDataResult,
	UseApiDataOptions,
} from "#dms-core/app/composables/auth/useApiData";
import type {
	DmsAsyncDataKey,
	UseDmsPagedDataOptions,
} from "#dms/frontend-module";
import { HTTP_SERVICE_UNAVAILABLE } from "../constants";

/** Why a request failed: the sidecar is down (503), or anything else. */
export type RequestFailure = "unavailable" | "error";

/** Why a read failed, and the server's message for it. */
interface FailureDescription {
	/** Why the last read failed; none while a retry is in flight. */
	failure: ComputedRef<RequestFailure | null>;
	/** The server's message for the failure. */
	message: ComputedRef<string>;
}

/** A view's read, and why it failed. */
export type AiData<T> = ApiDataResult<T> & FailureDescription;

/** A view's list read page by page, and why it failed. */
export type AiPagedData<TPage, TCursor> = ApiPagedDataResult<TPage, TCursor> &
	FailureDescription;

/** What a failure description needs of a read. */
interface FailingRead {
	error: { value: unknown };
	status: { value: string };
}

interface FetchErrorResponse {
	status?: number;
}

interface FetchErrorBody {
	message?: unknown;
}

interface FetchErrorLike {
	status?: number;
	statusCode?: number;
	response?: FetchErrorResponse;
	data?: FetchErrorBody;
	message?: string;
}

/** The HTTP status of a `$authFetch` rejection, if it got an answer. */
function errorStatus(error: unknown): number | undefined {
	const candidate = error as FetchErrorLike | null;
	return (
		candidate?.status ?? candidate?.statusCode ?? candidate?.response?.status
	);
}

/** The server's `{ message }`, else the error's own text. */
export function errorMessage(error: unknown): string {
	const candidate = error as FetchErrorLike | null;
	const serverMessage = candidate?.data?.message;
	if (typeof serverMessage === "string") return serverMessage;
	return candidate?.message ?? String(error);
}

export function classifyFailure(error: unknown): RequestFailure {
	return errorStatus(error) === HTTP_SERVICE_UNAVAILABLE
		? "unavailable"
		: "error";
}

/**
 * A view's read of the assistant's data, with the page (`useApiData`): a
 * server render reads it and hands it to the browser. Its failure says
 * whether the assistant isn't running (503) rather than an error.
 */
function describeFailure(result: FailingRead): FailureDescription {
	return {
		failure: computed(() =>
			result.error.value && result.status.value !== "pending"
				? classifyFailure(result.error.value)
				: null,
		),
		message: computed(() =>
			result.error.value ? errorMessage(result.error.value) : "",
		),
	};
}

export function useAiData<T>(
	url: ApiDataRequest,
	options?: UseApiDataOptions<T>,
): AiData<T> {
	const result = useApiData<T>(url, options);
	return Object.assign(result, describeFailure(result));
}

/**
 * A view's list read page by page ("Load more"), with the page
 * (`useApiPagedData`): a server render reads the first page, and the page's
 * refreshes read every page loaded again. Its failure says whether the
 * assistant isn't running (503) rather than an error.
 */
export function useAiPagedData<TPage, TCursor>(
	key: MaybeRefOrGetter<DmsAsyncDataKey>,
	handler: ApiPagedDataHandler<TPage, TCursor>,
	options: UseDmsPagedDataOptions<TPage, TCursor>,
): AiPagedData<TPage, TCursor> {
	const result = useApiPagedData<TPage, TCursor>(key, handler, options);
	return Object.assign(result, describeFailure(result));
}
