<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		MiniMap,
		type Node,
		type Edge,
		type Connection,
	} from "@xyflow/svelte";
	import { onMount } from "svelte";
	import "@xyflow/svelte/dist/style.css";
	import TextUpdaterNode from "./TextUpdaterNode.svelte";
	import { dialogueConfig } from "./dialogueConfig";

	const nodeTypes = { textUpdater: TextUpdaterNode };

	let nodeCounter = 0;
	let wiping = false;
	let configOpen = false;
	let traitDefinitions: string[] = [];
	let conditionDefinitions: string[] = [];
	type GraphSnapshot = { nodes: Node[]; edges: Edge[] };
	let undoStack: GraphSnapshot[] = [];
	let redoStack: GraphSnapshot[] = [];
	let restoringHistory = false;

	function cloneGraph<T>(value: T): T {
		return JSON.parse(JSON.stringify(value));
	}

	function snapshotGraph(): GraphSnapshot {
		return { nodes: cloneGraph(nodes), edges: cloneGraph(edges) };
	}

	function recordHistory() {
		if (restoringHistory) return;
		undoStack = [...undoStack, snapshotGraph()];
		redoStack = [];
	}

	function restoreSnapshot(snapshot: GraphSnapshot) {
		nodes = cloneGraph(snapshot.nodes);
		edges = cloneGraph(snapshot.edges);
		recomputeCounter();
	}

	function undo() {
		const previous = undoStack.at(-1);
		if (!previous) return;
		restoringHistory = true;
		redoStack = [...redoStack, snapshotGraph()];
		undoStack = undoStack.slice(0, -1);
		restoreSnapshot(previous);
		restoringHistory = false;
	}

	function redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		restoringHistory = true;
		undoStack = [...undoStack, snapshotGraph()];
		redoStack = redoStack.slice(0, -1);
		restoreSnapshot(next);
		restoringHistory = false;
	}

	function syncDialogueConfig() {
		dialogueConfig.set({ traitDefinitions, conditionDefinitions });
	}

	function cleanDefinitions(values: unknown) {
		if (!Array.isArray(values)) return [];
		return [
			...new Set(
				values
					.filter(
						(value): value is string =>
							typeof value === "string" &&
							value.trim().length > 0,
					)
					.map((value) => value.trim()),
			),
		];
	}

	function getChoiceId(nodeId: string, index: number) {
		return `choice-${nodeId}-${index + 1}`;
	}

	function normalizeNodes(rawNodes: any[]) {
		return rawNodes.map((node: any, index: number) => {
			const id = String(node.id ?? index + 1);
			return {
				...node,
				id,
				data: {
					...(node.data ?? {}),
					choices: Array.isArray(node.data?.choices)
						? node.data.choices.map(
								(choice: any, choiceIndex: number) => ({
									...choice,
									id: String(
										choice.id ??
											getChoiceId(id, choiceIndex),
									),
								}),
							)
						: [],
				},
			};
		});
	}

	function migrateEdges(rawEdges: any[], normalizedNodes: any[]) {
		return rawEdges.map((edge: any) => {
			if (edge.sourceHandle) return { ...edge, id: String(edge.id) };
			const sourceNode = normalizedNodes.find(
				(node) => node.id === String(edge.source),
			);
			const targetNode = normalizedNodes.find(
				(node) => node.id === String(edge.target),
			);
			const targetName = targetNode?.data?.name ?? String(edge.target);
			const choice = sourceNode?.data?.choices?.find(
				(candidate: any) =>
					candidate.next === targetName ||
					candidate.next === String(edge.target),
			);
			return {
				...edge,
				id: String(edge.id),
				sourceHandle: choice?.id,
			};
		});
	}

	function updateNodeDefinitions() {
		nodes = nodes.map((node) => ({
			...node,
			data: {
				...(node.data ?? {}),
				traitDefinitions,
				conditionDefinitions,
			},
		}));
	}

	function updateDefinitions(
		kind: "traits" | "conditions",
		values: string[],
	) {
		const cleaned = cleanDefinitions(values);
		if (kind === "traits") traitDefinitions = cleaned;
		else conditionDefinitions = cleaned;
		syncDialogueConfig();
		updateNodeDefinitions();
	}

	function addDefinition(kind: "traits" | "conditions") {
		const values =
			kind === "traits" ? traitDefinitions : conditionDefinitions;
		if (values.at(-1) === "") return;
		const updated = [...values, ""];
		if (kind === "traits") traitDefinitions = updated;
		else conditionDefinitions = updated;
		syncDialogueConfig();
		updateNodeDefinitions();
	}

	function removeDefinition(kind: "traits" | "conditions", index: number) {
		const values =
			kind === "traits" ? traitDefinitions : conditionDefinitions;
		updateDefinitions(
			kind,
			values.filter((_, i) => i !== index),
		);
	}

	// plain reactive arrays work better, it seems
	let nodes: Node[] = [
		{
			id: "1",
			type: "textUpdater",
			data: {
				name: "start",
				text: "",
				choices: [],
				traitDefinitions: [],
				conditionDefinitions: [],
			},
			position: { x: 0, y: 0 },
		},
	];
	let edges: Edge[] = [];

	function recomputeCounter() {
		const max = nodes
			.map((n) => Number(n.id))
			.filter((v) => !Number.isNaN(v))
			.reduce((a, b) => Math.max(a, b), 0);
		nodeCounter = Math.max(nodeCounter, max);
	}

	recomputeCounter();

	// autosave/restore
	onMount(() => {
		const raw = localStorage.getItem("dialogue_autosave");
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
				// normalize ids to strings and set nodes/edges as reactive arrays
				nodes = normalizeNodes(parsed.nodes);
				edges = migrateEdges(parsed.edges, nodes);
				traitDefinitions = cleanDefinitions(parsed.traitDefinitions);
				conditionDefinitions = cleanDefinitions(
					parsed.conditionDefinitions,
				);
				syncDialogueConfig();
				updateNodeDefinitions();
				recomputeCounter();
			}
		} catch (e) {
			console.warn("Failed to parse autosave:", e);
		}
	});

	// autosave whenever nodes/edges change
	$: {
		try {
			localStorage.setItem(
				"dialogue_autosave",
				JSON.stringify({
					nodes,
					edges,
					traitDefinitions,
					conditionDefinitions,
				}),
			);
		} catch (e) {
			console.warn("Autosave failed", e);
		}
	}

	function getNextId() {
		nodeCounter++;
		return String(nodeCounter);
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === "Escape" && configOpen) {
			configOpen = false;
			return;
		}

		const target = e.target as HTMLElement;
		const isEditing =
			target &&
			(target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable);
		const modifierPressed = e.ctrlKey || e.metaKey;

		if (modifierPressed && e.key.toLowerCase() === "z") {
			if (isEditing) return;
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
			return;
		}

		// Leave regular typing and native text undo/redo to the focused control.
		if (isEditing) {
			return;
		}

		if (e.key === "n" || e.key === "N") {
			e.preventDefault(); // only prevent default for this key
			addNode();
		}
	}

	function createNode(position: { x: number; y: number }) {
		const id = getNextId();
		return {
			id,
			type: "textUpdater",
			data: {
				name: `node_${id}`,
				text: "",
				choices: [],
				traitDefinitions,
				conditionDefinitions,
			},
			position,
		};
	}

	function addNode() {
		recordHistory();
		const rightmostX = nodes.reduce(
			(maxX, node) => Math.max(maxX, node.position.x),
			0,
		);
		const newNode = createNode({ x: rightmostX + 360, y: 0 });
		// reassign to trigger reactivity (important)
		nodes = [...nodes, newNode];
	}

	function onConnect(connection: Connection) {
		if (
			!connection.source ||
			!connection.target ||
			!connection.sourceHandle
		)
			return;
		recordHistory();
		// always reassign edges (avoid .push)
		const newEdge: Edge = {
			id: `${connection.source}-${connection.sourceHandle}-${connection.target}`,
			source: connection.source,
			target: connection.target,
			sourceHandle: connection.sourceHandle,
		};
		edges = [
			...edges.filter(
				(edge) =>
					!(
						edge.source === connection.source &&
						edge.sourceHandle === connection.sourceHandle
					),
			),
			newEdge,
		];
	}

	function onConnectEnd(event: MouseEvent | TouchEvent, state: any) {
		if (state.toNode || !state.fromNode || !state.fromHandle || !state.to)
			return;

		const source = String(state.fromNode.id);
		const sourceHandle = String(state.fromHandle.id);
		recordHistory();
		const newNode = createNode({ x: state.to.x, y: state.to.y });
		nodes = [...nodes, newNode];
		edges = [
			...edges.filter(
				(edge) =>
					!(
						edge.source === source &&
						edge.sourceHandle === sourceHandle
					),
			),
			{
				id: `${source}-${sourceHandle}-${newNode.id}`,
				source,
				target: newNode.id,
				sourceHandle,
			},
		];
	}

	function onBeforeDelete() {
		recordHistory();
		return true;
	}

	function downloadJson(filename: string, value: unknown) {
		const blob = new Blob([JSON.stringify(value, null, 4)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	function exportConfig() {
		downloadJson("dialogue-config.json", {
			traits: cleanDefinitions(traitDefinitions),
			conditions: cleanDefinitions(conditionDefinitions),
		});
	}

	function importConfig() {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "application/json";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;

			let parsed: any;
			try {
				parsed = JSON.parse(await file.text());
			} catch {
				alert("Invalid config JSON");
				return;
			}

			if (
				!parsed ||
				typeof parsed !== "object" ||
				(!Array.isArray(parsed.traits) &&
					!Array.isArray(parsed.traitDefinitions)) ||
				(!Array.isArray(parsed.conditions) &&
					!Array.isArray(parsed.conditionDefinitions))
			) {
				alert("Config JSON must contain traits and conditions arrays");
				return;
			}

			traitDefinitions = cleanDefinitions(
				parsed.traits ?? parsed.traitDefinitions,
			);
			conditionDefinitions = cleanDefinitions(
				parsed.conditions ?? parsed.conditionDefinitions,
			);
			syncDialogueConfig();
			updateNodeDefinitions();
		};
		input.click();
	}

	function exportDialogue() {
		const connectedNodeIds = new Set<string>();
		for (const edge of edges) {
			connectedNodeIds.add(edge.source);
			connectedNodeIds.add(edge.target);
		}
		const disconnectedNodes = nodes.filter(
			(node) => !connectedNodeIds.has(node.id),
		);
		if (disconnectedNodes.length > 0) {
			const names = disconnectedNodes
				.map((node) => node.data?.name || node.id)
				.join(", ");
			const shouldExport = confirm(
				`There ${disconnectedNodes.length === 1 ? "is" : "are"} ${disconnectedNodes.length} unconnected node${disconnectedNodes.length === 1 ? "" : "s"} (${names}). Export anyway?`,
			);
			if (!shouldExport) return;
		}

		const result: Record<string, any> = { nodes: {} };
		const nodesById = new Map(nodes.map((node) => [node.id, node]));
		for (const n of nodes) {
			const name = n.data?.name || n.id;
			const nodeObj: any = { text: n.data?.text || "", choices: [] };
			for (const c of n.data?.choices ?? []) {
				const choice: any = { text: c.text || "" };
				const edge = edges.find(
					(candidate) =>
						candidate.source === n.id &&
						candidate.sourceHandle === c.id,
				);
				const target = edge ? nodesById.get(edge.target) : undefined;
				const next = target?.data?.name || edge?.target;
				if (next) choice.next = next;
				if (Array.isArray(c.traits) && c.traits.length) {
					choice.traits = c.traits.map((t: any) =>
						!t.amount || t.amount === 1
							? t.name
							: { name: t.name, amount: t.amount },
					);
				}
				if (Array.isArray(c.conditions) && c.conditions.length)
					choice.conditions = c.conditions;
				nodeObj.choices.push(choice);
			}
			result.nodes[name] = nodeObj;
		}
		const json = JSON.stringify(result, null, 4);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "dialogue.json";
		a.click();
		URL.revokeObjectURL(url);
	}

	function importDialogue() {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "application/json";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			const text = await file.text();
			let json: any;
			try {
				json = JSON.parse(text);
			} catch {
				alert("Invalid JSON");
				return;
			}
			if (!json.nodes || typeof json.nodes !== "object") {
				alert("JSON missing 'nodes' object");
				return;
			}
			recordHistory();
			// wipie wipe
			nodes = [];
			edges = [];
			const names = Object.keys(json.nodes);
			const idMap: Record<string, string> = {};
			names.forEach((name, i) => {
				const raw = json.nodes[name];
				const id = String(i + 1);
				idMap[name] = id;
				nodes = [
					...nodes,
					{
						id,
						type: "textUpdater",
						data: {
							name,
							text: raw.text || "",
							traitDefinitions,
							conditionDefinitions,
							choices: (raw.choices ?? []).map(
								(c: any, choiceIndex: number) => {
									const choice: any = {
										id: String(
											c.id ??
												getChoiceId(id, choiceIndex),
										),
										text: c.text || "",
										next: c.next || "",
										traits: [],
										conditions: [],
									};
									if (Array.isArray(c.traits)) {
										choice.traits = c.traits.map(
											(t: any) =>
												typeof t === "string"
													? { name: t, amount: 1 }
													: {
															name: t.name || "",
															amount:
																t.amount ?? 1,
														},
										);
									}
									if (Array.isArray(c.conditions))
										choice.conditions = c.conditions;
									return choice;
								},
							),
						},
						position: {
							x: 500 * (i % 2 === 0 ? 1 : -1),
							y: 400 * i,
						},
					},
				];
			});
			names.forEach((name) => {
				const nodeId = idMap[name];
				const node = json.nodes[name];
				if (!node?.choices) return;
				node.choices.forEach((c: any, choiceIndex: number) => {
					if (!c.next) return;
					const targetId = idMap[c.next];
					if (!targetId) return;
					edges = [
						...edges,
						{
							id: `${nodeId}-${getChoiceId(nodeId, choiceIndex)}-${targetId}`,
							sourceHandle: getChoiceId(nodeId, choiceIndex),
							source: nodeId,
							target: targetId,
						},
					];
				});
			});
			recomputeCounter();
		};
		input.click();
	}

	function confirmWipe() {
		if (!wiping) {
			wiping = true;
			if (confirm("This will ERASE the entire dialogue. Continue?")) {
				doWipe();
			}
			wiping = false;
		}
	}
	function doWipe() {
		recordHistory();
		localStorage.removeItem("dialogue_autosave");
		nodeCounter = 0;
		nodes = [
			{
				id: "1",
				type: "textUpdater",
				data: {
					name: "start",
					text: "",
					choices: [],
					traitDefinitions,
					conditionDefinitions,
				},
				position: { x: 0, y: 0 },
			},
		];
		edges = [];
		recomputeCounter();
	}
</script>

<div style="height: 100vh; width: 100vw; position: relative;">
	<div class="btns">
		<button onclick={() => (configOpen = true)} class="top_btn config_btn"
			>Config</button
		>
		<button onclick={addNode} class="top_btn" style="background: #3b82f6;"
			>+ Add Node</button
		>
		<button
			onclick={exportDialogue}
			class="top_btn"
			style="background: #357560;">Export JSON</button
		>
		<button
			onclick={importDialogue}
			class="top_btn"
			style="background: #b89252;">Import JSON</button
		>
		<button
			onclick={confirmWipe}
			class="top_btn"
			style="background: #c22c2c;">New Dialogue</button
		>
	</div>

	{#if configOpen}
		<div
			class="config-backdrop"
			role="presentation"
			onclick={() => (configOpen = false)}
		>
			<dialog
				open
				class="config-panel"
				aria-modal="true"
				aria-labelledby="config-title"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<div class="config-header">
					<h2 id="config-title">Dialogue Config</h2>
					<button
						class="close-btn"
						aria-label="Close config"
						onclick={() => (configOpen = false)}>×</button
					>
				</div>
				<p class="config-help">
					Define reusable names once, then select them in choices.
				</p>
				<div class="config-actions">
					<button class="config-action" onclick={importConfig}
						>Import Config</button
					>
					<button class="config-action" onclick={exportConfig}
						>Export Config</button
					>
				</div>

				<div class="config-section">
					<div class="config-section-header">
						<h3>Traits</h3>
						<button
							class="config-add"
							onclick={() => addDefinition("traits")}
							>+ Add Trait</button
						>
					</div>
					{#each traitDefinitions as trait, index (index)}
						<div class="definition-row">
							<input
								value={trait}
								placeholder="e.g. courage"
								oninput={(e) =>
									updateDefinitions(
										"traits",
										traitDefinitions.map((value, i) =>
											i === index
												? (e.target as HTMLInputElement)
														.value
												: value,
										),
									)}
							/>
							<button
								class="definition-remove"
								aria-label="Remove trait"
								onclick={() =>
									removeDefinition("traits", index)}>×</button
							>
						</div>
					{/each}
					{#if traitDefinitions.length === 0}<span
							class="empty-config">No traits configured.</span
						>{/if}
				</div>

				<div class="config-section">
					<div class="config-section-header">
						<h3>Conditions</h3>
						<button
							class="config-add"
							onclick={() => addDefinition("conditions")}
							>+ Add Condition</button
						>
					</div>
					{#each conditionDefinitions as condition, index (index)}
						<div class="definition-row">
							<input
								value={condition}
								placeholder="e.g. has_key"
								oninput={(e) =>
									updateDefinitions(
										"conditions",
										conditionDefinitions.map((value, i) =>
											i === index
												? (e.target as HTMLInputElement)
														.value
												: value,
										),
									)}
							/>
							<button
								class="definition-remove"
								aria-label="Remove condition"
								onclick={() =>
									removeDefinition("conditions", index)}
								>×</button
							>
						</div>
					{/each}
					{#if conditionDefinitions.length === 0}<span
							class="empty-config">No conditions configured.</span
						>{/if}
				</div>
			</dialog>
		</div>
	{/if}

	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		onconnect={onConnect}
		onconnectend={onConnectEnd}
		onbeforedelete={onBeforeDelete}
		deleteKey={["Backspace", "Delete"]}
		fitView
	>
		<Controls orientation="horizontal" />
		<Background bgColor="#111" />
		<MiniMap bgColor="#000" nodeColor="#333" maskColor="#222" />
	</SvelteFlow>
</div>

<svelte:window on:keydown={onKeyDown} />

<style>
	.btns {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 100;
	}
	.top_btn {
		padding: 0.5rem 1.6rem;
		font-size: 0.9rem;
		color: white;
		border-radius: 8px;
		border: none;
		cursor: pointer;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
		margin-right: 0.5rem;
	}
	.config_btn {
		background: #347ead;
	}
	.config-backdrop {
		position: absolute;
		inset: 0;
		z-index: 200;
		background: rgba(0, 0, 0, 0.68);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 5rem;
	}
	.config-panel {
		margin: 0;
		width: min(32rem, calc(100vw - 2rem));
		max-height: calc(100vh - 7rem);
		overflow: auto;
		background: #101010;
		color: #f0f0f0;
		border: 1px solid #444;
		border-radius: 8px;
		padding: 1rem;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
	}
	.config-header,
	.config-section-header,
	.definition-row {
		display: flex;
		align-items: center;
	}
	.config-header,
	.config-section-header {
		justify-content: space-between;
	}
	.config-header h2,
	.config-section-header h3 {
		margin: 0;
	}
	.config-header h2 {
		font-size: 1.1rem;
	}
	.config-section-header h3 {
		font-size: 0.85rem;
		color: #41d992;
	}
	.config-help,
	.empty-config {
		color: #999;
		font-size: 0.75rem;
	}
	.config-help {
		margin: 0.35rem 0 1rem;
	}
	.config-section {
		border-top: 1px solid #333;
		padding: 0.8rem 0;
	}
	.config-actions {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.2rem;
	}
	.definition-row {
		gap: 0.4rem;
		margin-top: 0.45rem;
	}
	.definition-row input {
		flex: 1;
		min-width: 0;
		background: #050505;
		color: white;
		border: 1px solid #333;
		border-radius: 5px;
		padding: 0.4rem;
	}
	.config-add,
	.close-btn,
	.definition-remove {
		background: #222;
		color: #f0f0f0;
		border: 0;
		border-radius: 4px;
		cursor: pointer;
	}
	.config-add {
		padding: 0.3rem 0.5rem;
		font-size: 0.7rem;
	}
	.config-action {
		background: #252525;
		color: #bbb;
		border: 1px solid #444;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.68rem;
		padding: 0.35rem 0.55rem;
	}
	.config-action:hover {
		background: #333;
		color: #fff;
	}
	.close-btn {
		font-size: 1.3rem;
		line-height: 1;
		padding: 0.15rem 0.45rem;
	}
	.definition-remove {
		font-size: 1rem;
		padding: 0.2rem 0.5rem;
	}
</style>
