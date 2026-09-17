<script lang="ts">
	import {
		Position,
		Handle,
		NodeResizer,
		useSvelteFlow,
		type NodeProps,
	} from "@xyflow/svelte";
	import { dialogueConfig } from "./dialogueConfig";

	let { id, data, selected }: NodeProps = $props();
	const { updateNodeData, getEdges, deleteElements } = useSvelteFlow();

	const maxChoices = 5;

	function getChoices() {
		return Array.isArray(data?.choices) ? data.choices : [];
	}

	function getDefinitions(kind: "traits" | "conditions", current: string) {
		const configured =
			kind === "traits"
				? $dialogueConfig.traitDefinitions
				: $dialogueConfig.conditionDefinitions;
		return current && !configured.includes(current)
			? [current, ...configured]
			: configured;
	}

	// push a full node update (merges name/text/choices keeping other data as-is)
	function pushUpdate(patch: Record<string, any>) {
		updateNodeData(id, { ...(data ?? {}), ...patch });
	}

	function addChoice() {
		const choices = getChoices();
		if (choices.length >= maxChoices) return;
		const newChoices = [
			...choices,
			{
				id: `choice-${id}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
				text: "",
				next: "",
				traits: [],
				conditions: [],
			},
		];
		pushUpdate({ choices: newChoices });
	}

	async function removeChoice(idx: number) {
		const choices = getChoices();
		const choice = choices[idx];
		if (choice?.id) {
			const connectedEdges = getEdges().filter(
				(edge) => edge.source === id && edge.sourceHandle === choice.id,
			);
			if (connectedEdges.length)
				await deleteElements({ edges: connectedEdges });
		}
		const newChoices = choices.filter((_, i) => i !== idx);
		pushUpdate({ choices: newChoices });
	}

	function updateChoiceField(idx: number, key: string, value: any) {
		const choices = getChoices();
		const copy = choices.map((c, i) =>
			i === idx ? { ...c, [key]: value } : c,
		);
		pushUpdate({ choices: copy });
	}

	function toggleChoiceMetadata(
		choiceIdx: number,
		kind: "traits" | "conditions",
		enabled: boolean,
	) {
		const choices = getChoices();
		const choice = choices[choiceIdx];
		if (!choice) return;
		const current = Array.isArray(choice[kind]) ? choice[kind] : [];
		const value = enabled
			? current.length > 0
				? current
				: kind === "traits"
					? [{ name: "", amount: 1 }]
					: [""]
			: [];
		updateChoiceField(choiceIdx, kind, value);
	}

	function addTrait(choiceIdx: number) {
		const choices = getChoices();
		const c = choices[choiceIdx] ?? {
			text: "",
			next: "",
			traits: [],
			conditions: [],
		};
		const newTraits = [...(c.traits ?? []), { name: "", amount: 1 }];
		updateChoiceField(choiceIdx, "traits", newTraits);
	}
	function removeTrait(choiceIdx: number, traitIdx: number) {
		const choices = getChoices();
		const c = choices[choiceIdx];
		if (!c) return;
		const newTraits = (c.traits ?? []).filter((_, i) => i !== traitIdx);
		updateChoiceField(choiceIdx, "traits", newTraits);
	}
	function updateTrait(
		choiceIdx: number,
		traitIdx: number,
		field: string,
		value: any,
	) {
		const choices = getChoices();
		const c = choices[choiceIdx];
		if (!c) return;
		const newTraits = (c.traits ?? []).map((t, i) =>
			i === traitIdx ? { ...t, [field]: value } : t,
		);
		updateChoiceField(choiceIdx, "traits", newTraits);
	}

	function addCondition(choiceIdx: number) {
		const choices = getChoices();
		const c = choices[choiceIdx] ?? {
			text: "",
			next: "",
			traits: [],
			conditions: [],
		};
		const newConds = [...(c.conditions ?? []), ""];
		updateChoiceField(choiceIdx, "conditions", newConds);
	}
	function removeCondition(choiceIdx: number, condIdx: number) {
		const choices = getChoices();
		const c = choices[choiceIdx];
		if (!c) return;
		const newConds = (c.conditions ?? []).filter((_, i) => i !== condIdx);
		updateChoiceField(choiceIdx, "conditions", newConds);
	}
	function updateCondition(
		choiceIdx: number,
		condIdx: number,
		value: string,
	) {
		const choices = getChoices();
		const c = choices[choiceIdx];
		if (!c) return;
		const newConds = (c.conditions ?? []).map((v, i) =>
			i === condIdx ? value : v,
		);
		updateChoiceField(choiceIdx, "conditions", newConds);
	}

	function updateNodeText(t: string) {
		pushUpdate({ text: t });
	}
</script>

<NodeResizer
	isVisible={selected}
	minWidth={280}
	minHeight={180}
	color="rgba(120, 160, 145, 0.45)"
	handleStyle="width: 7px; height: 7px; opacity: 0.6;"
/>

<div class="node-card">
	<div class="field">
		<textarea
			class="text-input nodrag"
			rows="3"
			oninput={(e) =>
				updateNodeText((e.target as HTMLTextAreaElement).value)}
			placeholder="The NPC says...">{data?.text ?? ""}</textarea
		>
	</div>

	<div class="field">
		<label for="id">CHOICES</label>

		{#each getChoices() as choice, i (i)}
			<div class="choice-block">
				<div class="choice-main">
					<textarea
						class="choice-text nodrag"
						rows="1"
						placeholder="Player line..."
						value={choice.text}
						oninput={(e) =>
							updateChoiceField(
								i,
								"text",
								(e.target as HTMLTextAreaElement).value,
							)}
					></textarea>
					<button
						class="remove-btn nodrag"
						onclick={() => removeChoice(i)}>✗</button
					>
					<label class="metadata-toggle">
						<input
							class="nodrag"
							type="checkbox"
							checked={(choice.traits ?? []).length > 0}
							onchange={(e) =>
								toggleChoiceMetadata(
									i,
									"traits",
									(e.target as HTMLInputElement).checked,
								)}
						/>
						Traits
					</label>
					<label class="metadata-toggle">
						<input
							class="nodrag"
							type="checkbox"
							checked={(choice.conditions ?? []).length > 0}
							onchange={(e) =>
								toggleChoiceMetadata(
									i,
									"conditions",
									(e.target as HTMLInputElement).checked,
								)}
						/>
						Conditions
					</label>
				</div>
				<Handle
					type="source"
					id={choice.id ?? `choice-${id}-${i + 1}`}
					position={Position.Right}
					class="connection-handle"
					style="right: -7px; width: 24px; height: 24px; background: transparent; border: 0;"
				/>

				{#if (choice.traits ?? []).length > 0}
					<div class="sub-section metadata-section">
						<span class="subheading">Traits</span>
						{#each choice.traits ?? [] as trait, ti (ti)}
							<div class="trait-row">
								<select
									class="nodrag"
									value={trait.name}
									onchange={(e) =>
										updateTrait(
											i,
											ti,
											"name",
											(e.target as HTMLSelectElement)
												.value,
										)}
								>
									<option value="">Select trait...</option>
									{#each getDefinitions("traits", trait.name) as traitName}
										<option value={traitName}
											>{traitName}</option
										>
									{/each}
								</select>
								<input
									class="nodrag"
									type="number"
									min="1"
									placeholder="Amt"
									value={trait.amount ?? 1}
									oninput={(e) =>
										updateTrait(
											i,
											ti,
											"amount",
											Number(
												(e.target as HTMLInputElement)
													.value,
											),
										)}
									style="width: 4rem"
								/>
								<button
									class="mini-btn nodrag"
									onclick={() => removeTrait(i, ti)}>x</button
								>
							</div>
						{/each}
						<button
							class="mini-btn add-mini nodrag"
							onclick={() => addTrait(i)}>+ Add Trait</button
						>
					</div>
				{/if}

				{#if (choice.conditions ?? []).length > 0}
					<div class="sub-section metadata-section">
						<span class="subheading">Conditions</span>
						{#each choice.conditions ?? [] as cond, ci (ci)}
							<div class="cond-row">
								<select
									class="nodrag"
									value={cond}
									onchange={(e) =>
										updateCondition(
											i,
											ci,
											(e.target as HTMLSelectElement)
												.value,
										)}
								>
									<option value="">Select condition...</option
									>
									{#each getDefinitions("conditions", cond) as conditionName}
										<option value={conditionName}
											>{conditionName}</option
										>
									{/each}
								</select>
								<button
									class="mini-btn nodrag"
									onclick={() => removeCondition(i, ci)}
									>×</button
								>
							</div>
						{/each}
						<button
							class="mini-btn add-mini nodrag"
							onclick={() => addCondition(i)}
							>+ Add Condition</button
						>
					</div>
				{/if}
			</div>
		{/each}

		{#if getChoices().length < maxChoices}
			<button class="add-btn nodrag" onclick={addChoice}
				>+ Add Choice</button
			>
		{/if}
	</div>

	<Handle
		type="target"
		position={Position.Left}
		class="connection-handle"
		style="left: -3px; width: 24px; height: 24px; background: transparent; border: 0;"
	/>
</div>

<style>
	.node-card {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		overflow: auto;
		background: rgb(15, 12, 19);
		color: #f0f0f0;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 0.75rem;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
		min-width: 280px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	:global(.connection-handle)::after {
		content: "";
		position: absolute;
		inset: 9px;
		border-radius: 50%;
		background: var(
			--xy-handle-background-color,
			var(--xy-handle-background-color-default)
		);
		border: 1px solid
			var(--xy-handle-border-color, var(--xy-handle-border-color-default));
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	label {
		font-size: 0.6rem;
		font-weight: 600;
		color: #64644d;
	}
	input,
	textarea,
	select {
		width: 100%;
		background: black;
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		padding: 0.4rem;
		font-family: inherit;
		font-size: 0.67rem;
		box-sizing: border-box;
	}
	select {
		appearance: auto;
	}
	.choice-text {
		resize: vertical;
		min-height: 2.2rem;
	}
	.text-input {
		resize: vertical;
		min-height: 60px;
	}
	.choice-block {
		position: relative;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 0.4rem;
		margin-bottom: 0.5rem;
		background: rgba(0, 0, 0, 0.18);
	}
	.choice-main {
		display: grid;
		grid-template-columns: minmax(8rem, 1fr) minmax(5rem, 0.6fr) auto auto auto;
		gap: 0.25rem;
		align-items: center;
		margin-bottom: 0.25rem;
	}
	.metadata-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		white-space: nowrap;
		font-size: 0.58rem;
		font-weight: 400;
		color: #999;
		cursor: pointer;
	}
	.metadata-toggle input {
		width: auto;
		margin: 0;
		accent-color: #41d992;
	}
	.sub-section {
		border-left: 1px solid rgba(255, 255, 255, 0.08);
		margin-left: 0.5rem;
		padding-left: 0.5rem;
		margin-top: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.subheading {
		font-size: 0.58rem;
		font-weight: 500;
		color: #888;
	}
	.trait-row,
	.cond-row {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}
	.add-btn,
	.mini-btn {
		background: #151515;
		color: #999;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.5rem;
		padding: 0.2rem 0.4rem;
	}
	.add-btn:hover,
	.add-mini:hover {
		background: #252525;
		color: #c8c8c8;
	}
	.add-btn {
		font-size: 0.62rem;
	}
	.remove-btn {
		color: #b00;
		font-weight: bold;
		width: 1.5rem;
		text-align: center;
		background: #333;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}
</style>
