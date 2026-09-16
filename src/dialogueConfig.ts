import { writable } from "svelte/store";

export const dialogueConfig = writable({
	traitDefinitions: [] as string[],
	conditionDefinitions: [] as string[],
});
