<svelte:options customElement={{ tag: "moji-moe", props: { canvasResolution: { type: "Number" }, size: { type: "Number" }, rows: { type: "Number" }, copyToClipboard: { type: "Boolean" } } }} />

<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { DEFAULT_CONFIG, type MojiConfig } from "./config";
	import { parseLabels, type Candidate } from "./core";
	import { DrawingPad } from "./drawing";
	import { preprocess } from "./preprocess";
	import { Recognizer } from "./recognizer";

	interface Props {
		/** URL of the ONNX classifier model. Defaults to the bundled DaKanji model. */
		modelUrl?: string;
		/** URL of the newline-free label file (one line, one class label per character). */
		labelsUrl?: string;
		/** URL of the onnxruntime-web UMD bundle, loaded once via a <script> tag. */
		ortUrl?: string;
		/** How many ranked candidates to show. */
		topK?: number;
		/** Canvas drawing-surface resolution in pixels. */
		canvasResolution?: number;
		/** Canvas display width in CSS pixels. */
		size?: number;
		/** Maximum number of candidate rows to display. */
		rows?: number;
		/** Whether selecting a candidate automatically copies it to the clipboard. */
		copyToClipboard?: boolean;
	}

	let {
		modelUrl = DEFAULT_CONFIG.modelUrl,
		labelsUrl = DEFAULT_CONFIG.labelsUrl,
		ortUrl = DEFAULT_CONFIG.ortUrl,
		topK = DEFAULT_CONFIG.topK,
		canvasResolution = 480,
		size = 320,
		rows = 3,
		copyToClipboard = true,
	}: Props = $props();

	let canvasEl: HTMLCanvasElement;
	let resultsEl: HTMLUListElement;
	let pad: DrawingPad | null = null;
	let recognizer: Recognizer | null = null;
	let recognitionTimer: ReturnType<typeof setTimeout> | null = null;
	let copiedResetTimer: ReturnType<typeof setTimeout> | null = null;
	let revision = 0;

	let isEmpty = $state(true);
	let candidates = $state<Candidate[]>([]);
	let errorMessage = $state<string | null>(null);
	let modelLoading = $state(true);
	let recognizing = $state(false);
	let copiedCharacter = $state<string | null>(null);
	let resultColumns = $state(1);
	let resultCellSize = $state(52);
	let resultsObserver: ResizeObserver | null = null;

	const visibleCandidates = $derived(candidates.slice(0, Math.max(1, Math.floor(rows)) * resultColumns));
	const resultsHeight = $derived(Math.max(1, Math.floor(rows)) * resultCellSize + (Math.max(1, Math.floor(rows)) - 1) * 8);

	function describeError(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	function candidateLabel(candidate: Candidate): string {
		return candidate.character ?? `Class ${candidate.index}`;
	}

	// The drawing pad is the source of truth for the current ink; when it changes we either
	// reset the candidate list or schedule a recognition pass after a short debounce.
	function handlePadChange(): void {
		isEmpty = pad?.empty ?? true;
		revision += 1;
		if (isEmpty) {
			candidates = [];
			return;
		}
		if (!recognizer || pad?.isDrawing) return;
		queueRecognition();
	}

	function queueRecognition(): void {
		if (recognitionTimer !== null) clearTimeout(recognitionTimer);
		// Debounce the recognition pass so a fast stroke sequence does not trigger an eager model
		// eval on every pointermove sample while the user is still drawing.
		recognitionTimer = setTimeout(() => {
			recognitionTimer = null;
			void recognizeCurrentDrawing();
		}, 150);
	}

	async function recognizeCurrentDrawing(): Promise<void> {
		if (recognizing || !recognizer || !pad || pad.empty || pad.isDrawing) return;
		const currentRevision = revision;
		recognizing = true;
		try {
			const image = preprocess(canvasEl, recognizer.settings);
			if (!image) return;
			const ranked = await recognizer.recognize(image);
			if (revision !== currentRevision) return;
			candidates = ranked;
			errorMessage = null;
		} catch (error) {
			if (revision === currentRevision) errorMessage = `Recognition failed: ${describeError(error)}`;
		} finally {
			recognizing = false;
		}
	}

	async function fetchAsset(path: string, optional = false): Promise<Response | null> {
		const url = new URL(path, document.baseURI);
		const response = await fetch(url);
		if (optional && response.status === 404) return null;
		if (!response.ok) throw new Error(`Could not load ${path}: HTTP ${response.status}.`);
		if (response.headers.get("content-type")?.includes("text/html")) {
			if (optional) return null;
			throw new Error(`Missing ${path}.`);
		}
		return response;
	}

	async function loadRecognizer(): Promise<void> {
		modelLoading = true;
		const settings: MojiConfig = { ...DEFAULT_CONFIG, modelUrl, labelsUrl, ortUrl, topK };
		try {
			const modelResponse = await fetchAsset(settings.modelUrl);
			if (!modelResponse) throw new Error(`Missing ${settings.modelUrl}.`);
			const modelBytes = new Uint8Array(await modelResponse.arrayBuffer());
			const labelsResponse = await fetchAsset(settings.labelsUrl, true);
			const labels = labelsResponse ? parseLabels(await labelsResponse.text()) : null;
			recognizer = await Recognizer.create(modelBytes, settings, labels);
			errorMessage = null;
			if (pad && !pad.empty) queueRecognition();
		} catch (error) {
			errorMessage = `Could not load model: ${describeError(error)}`;
		} finally {
			modelLoading = false;
		}
	}

	async function selectCandidate(candidate: Candidate): Promise<void> {
		const character = candidateLabel(candidate);
		if (copyToClipboard) {
			try {
				if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(character);
				if (copiedResetTimer !== null) clearTimeout(copiedResetTimer);
				copiedCharacter = character;
				copiedResetTimer = setTimeout(() => {
					copiedResetTimer = null;
					copiedCharacter = null;
				}, 220);
				}
			} catch (error) {
				errorMessage = `Could not copy character: ${describeError(error)}`;
			}
		}
		const root = canvasEl.getRootNode();
		if (root instanceof ShadowRoot) {
			root.host.dispatchEvent(
				new CustomEvent("select", {
					detail: { character },
					bubbles: true,
					composed: true,
				}),
			);
		}
	}

	onMount(() => {
		pad = new DrawingPad(canvasEl, handlePadChange);
		resultsObserver = new ResizeObserver(([entry]) => {
			resultColumns = Math.max(1, Math.floor((entry.contentRect.width + 8) / 60));
			resultCellSize = (entry.contentRect.width - (resultColumns - 1) * 8) / resultColumns;
		});
		resultsObserver.observe(resultsEl);
		void loadRecognizer();
	});

	onDestroy(() => {
		if (recognitionTimer !== null) clearTimeout(recognitionTimer);
		if (copiedResetTimer !== null) clearTimeout(copiedResetTimer);
		pad?.dispose();
		resultsObserver?.disconnect();
		void recognizer?.dispose();
	});
</script>

<section class="moji-moe" style:width={`${size}px`} aria-label="Kanji handwriting panel">
	<div class="pad">
		<canvas bind:this={canvasEl} width={canvasResolution} height={canvasResolution} aria-label="Handwriting canvas"></canvas>
	</div>
	<div class="actions">
		<button type="button" onclick={() => pad?.undo()} disabled={isEmpty}>Undo</button>
		<button type="button" onclick={() => pad?.clear()} disabled={isEmpty}>Clear</button>
	</div>

	{#if errorMessage}
		<p class="error" role="alert">{errorMessage}</p>
	{/if}

	<ul class="results" bind:this={resultsEl} style:height={`${resultsHeight}px`} aria-label="Kanji candidates">
		{#each visibleCandidates as candidate (candidate.index)}
			<li>
				<button
					type="button"
					class:copied={copiedCharacter === candidateLabel(candidate)}
					onclick={() => void selectCandidate(candidate)}
					title={`${candidateLabel(candidate)} ${(candidate.score / 10).toFixed(1)}%`}
				>
					{candidateLabel(candidate)}
				</button>
			</li>
		{/each}
	</ul>
</section>

<style>
	.moji-moe {
		box-sizing: border-box;
		margin: 0 auto;
		font-family: system-ui, sans-serif;
		border: 1px solid #c6d1dd;
		border-radius: 7px;
	padding: 16px;
	}

	.pad {
		position: relative;
		overflow: hidden;
		outline: 1px solid #b8c8d9;
		border-radius: 10px;
		background: white;
	}

	canvas {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		touch-action: none;
		cursor: crosshair;
	}

	.actions {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}

	.actions button {
		flex: 1 1 0;
	}

	button {
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		background: #fff;
		border: 1px solid #c6d1dd;
		color: #183451;
		border-radius: 7px;
		padding: 10px 17px;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: #214fda;
		background: #eff4ff;
	}

	button:active:not(:disabled) {
		animation: button-press 120ms ease-out;
	}

	button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	:focus-visible {
		outline: 3px solid #e6a400;
		outline-offset: 3px;
	}

	.error {
		font-size: 0.875rem;
		color: #ae2424;
		margin: 10px 0 0;
	}

	.results {
		list-style: none;
		padding: 0;
		margin: 14px 0 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
		gap: 8px;
	}

	.results li {
		aspect-ratio: 1;
	}

	.results button {
		width: 100%;
		height: 100%;
		padding: 0;
		font-size: 1.5rem;
		font-family: "Noto Sans CJK JP", "Yu Gothic", sans-serif;
	}

	.results button.copied {
		animation: copied-flash 220ms ease-out;
	}

	@keyframes button-press {
		0% { transform: scale(1); }
		50% { transform: scale(0.95); }
		100% { transform: scale(1); }
	}

	@keyframes copied-flash {
		0% { background: #eff4ff; border-color: #214fda; }
		100% { background: #fff; border-color: #c6d1dd; }
	}
</style>
