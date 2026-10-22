import { onBeforeUnmount, onMounted, type Ref, ref } from "vue";
import { DARK_THEME_CLASS, type SketchScheme } from "../constants/sketch";

const OBSERVED_ATTRIBUTES = ["class", "style", "data-scale"];

function currentScheme(): SketchScheme {
	return document.documentElement.classList.contains(DARK_THEME_CLASS)
		? "dark"
		: "light";
}

export interface DashboardScheme {
	scheme: Ref<SketchScheme>;
	revision: Ref<number>;
}

/**
 * The dashboard's light or dark theme, followed live. `revision` also moves
 * when the root's styles change, so readers of its CSS variables re-read them.
 */
export function useDashboardScheme(): DashboardScheme {
	const scheme = ref<SketchScheme>("light");
	const revision = ref(0);
	let observer: MutationObserver | null = null;

	const sync = () => {
		scheme.value = currentScheme();
		revision.value += 1;
	};

	onMounted(() => {
		sync();
		observer = new MutationObserver(sync);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: OBSERVED_ATTRIBUTES,
		});
	});
	onBeforeUnmount(() => observer?.disconnect());

	return { scheme, revision };
}
