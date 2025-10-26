<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import * as THREE from 'three';
	import { addLog, splatChunks } from '../stores.js';

	// Import dynamically to avoid SSR issues
	let SPLAT: any = null;
	let scene: any = null;
	let camera: any = null;
	let renderer: any = null;
	let controls: any = null;
	let canvas: HTMLCanvasElement | null = null;
	let container: HTMLDivElement | null = null;
	let threeScene: THREE.Scene | null = null;
	let loadedScenes = new Set<string>();
	let loadedSplats = new Map<string, any>();
	let isLibraryLoaded = false;
	let animationFrameId: number | null = null;
	let loadedChunksOrder: string[] = []; // Track loading order for cleanup
	let forceUpdate = 0; // Force reactive updates

	// Camera settings
	let cameraPosition: [number, number, number] = [5, 5, 5];
	let cameraTarget: [number, number, number] = [0, 0, 0];

	// Load gsplat library dynamically
	onMount(async () => {
		try {
			SPLAT = await import('gsplat');
			isLibraryLoaded = true;
			console.log('gsplat library loaded');
			// Initialize viewer if container is ready
			if (container) {
				initViewer();
			}
		} catch (error) {
			console.error('Failed to load gsplat library:', error);
		}
	});

	// Initialize the gsplat viewer
	function initViewer() {
		if (!container || renderer || !isLibraryLoaded || !SPLAT) return;

		try {
			// Create canvas and append to container
			canvas = document.createElement('canvas');
			canvas.style.width = '100%';
			canvas.style.height = '100%';
			container.appendChild(canvas);

			// Initialize gsplat components
			scene = new SPLAT.Scene();
			camera = new SPLAT.Camera();
			renderer = new SPLAT.WebGLRenderer(canvas);
			controls = new SPLAT.OrbitControls(camera, canvas);

			// Set white background color
			renderer.backgroundColor = new SPLAT.Color32(255, 255, 255, 255);

			// Set up camera
			camera.position = new SPLAT.Vector3(5, 5, 5);
			controls.setCameraTarget(new SPLAT.Vector3(0, 0, 0));

			// Start render loop
			startRenderLoop();

			console.log('gsplat viewer initialized');
		} catch (error) {
			console.error('Failed to initialize gsplat viewer:', error);
		}
	}

	// Start the render loop
	function startRenderLoop() {
		if (!renderer || !scene || !camera || !controls) return;

		const frame = () => {
			controls.update();
			renderer.render(scene, camera);
			animationFrameId = requestAnimationFrame(frame);
		};

		animationFrameId = requestAnimationFrame(frame);
	}

	// Load a new splat scene from blob URL with memory cleanup
	async function loadSplatScene(chunkId: string, blobUrl: string) {
		if (!scene || !SPLAT || loadedScenes.has(chunkId)) {
			addLog(`⏩ Skipping chunk ${chunkId} - already loaded or scene not ready`);
			return;
		}

		try {
			addLog(`🔄 Loading splat chunk: ${chunkId}`);
			addLog(
				`📋 Current loaded scenes: ${loadedScenes.size}, pending in queue: ${$splatChunks.length}`
			);

			// Convert blob URL to ArrayBuffer
			addLog(`📡 Fetching blob from URL for chunk ${chunkId}...`);
			const response = await fetch(blobUrl);
			const arrayBuffer = await response.arrayBuffer();
			addLog(`📦 Got ArrayBuffer for chunk ${chunkId}: ${arrayBuffer.byteLength} bytes`);

			// Load PLY from ArrayBuffer
			addLog(`🎯 Loading PLY into scene for chunk ${chunkId}...`);
			const splat = SPLAT.PLYLoader.LoadFromArrayBuffer(arrayBuffer, scene);
			addLog(`✨ PLY loaded successfully for chunk ${chunkId}`);

			// Store reference to the splat for potential cleanup
			loadedSplats.set(chunkId, splat);
			loadedScenes.add(chunkId);
			loadedScenes = new Set(loadedScenes); // Force reactivity

			// Track loading order
			loadedChunksOrder = [...loadedChunksOrder, chunkId]; // Force reactivity

			addLog(`✅ Loaded splat chunk: ${chunkId} (${loadedScenes.size} total)`);
			addLog(`📊 Scene now contains ${loadedScenes.size} chunks`);

			// Clean up memory - keep last 2 loaded chunks, remove older ones
			if (loadedChunksOrder.length > 2) {
				const chunksToRemove = loadedChunksOrder.slice(0, -2); // All except last 2
				addLog(`🧹 Cleaning up ${chunksToRemove.length} old chunks: ${chunksToRemove.join(', ')}`);

				splatChunks.update((chunks) => {
					return chunks.filter((chunk) => {
						const shouldRemove = chunksToRemove.includes(chunk.id);

						if (shouldRemove) {
							URL.revokeObjectURL(chunk.url);
							addLog(`🗑️ Cleaned up old chunk: ${chunk.id}`);
						}

						return !shouldRemove;
					});
				});
			} else {
				addLog(
					`💾 Keeping chunk ${chunkId} in memory (${loadedChunksOrder.length}/2 recent chunks)`
				);
			}
		} catch (error) {
			addLog(`❌ Failed to load chunk ${chunkId}: ${error}`);
			console.error(`Failed to load PLY splat scene for chunk ${chunkId}:`, error);
		}
	}

	// Clear all loaded scenes
	function clearScenes() {
		if (scene) {
			// Remove all splats from scene
			loadedSplats.forEach((splat) => {
				scene.removeObject(splat);
			});
			loadedSplats.clear();
			loadedScenes.clear();
			loadedScenes = new Set();
			loadedChunksOrder = [];
			addLog('🧹 Cleared all splat scenes');
		}
	}

	// Download combined scene using Scene.saveToFile()
	function downloadCombinedScene() {
		if (!scene || loadedScenes.size === 0) {
			addLog('❌ No loaded scenes to download');
			return;
		}

		try {
			// Use gsplat's built-in export functionality
			scene.saveToFile(null, 'ply'); // null = auto-generate filename
			addLog(`✅ Downloaded combined PLY with ${loadedScenes.size} chunks`);
		} catch (error) {
			addLog(`❌ Failed to download combined scene: ${error}`);
			console.error('Failed to download combined scene:', error);
		}
	}

	// Process pending chunks
	function processNewChunks() {
		if (!scene || !isLibraryLoaded) {
			addLog(
				`⏸️ Cannot process chunks - scene ready: ${!!scene}, library loaded: ${isLibraryLoaded}`
			);
			return;
		}

		const pendingChunks = $splatChunks.filter((chunk) => !loadedScenes.has(chunk.id));
		if (pendingChunks.length > 0) {
			addLog(
				`🔍 Processing ${pendingChunks.length} pending chunks: ${pendingChunks.map((c) => c.id).join(', ')}`
			);
			for (const chunk of pendingChunks) {
				loadSplatScene(chunk.id, chunk.url);
			}
		} else {
			addLog(
				`✨ No pending chunks to process (${$splatChunks.length} total, ${loadedScenes.size} loaded)`
			);
		}
	}

	// Reactive statement to initialize viewer when container and library are ready
	$: if (container && isLibraryLoaded && !renderer) {
		initViewer();
	}

	// Monitor splatChunks changes and process new ones immediately
	$: if ($splatChunks.length > 0) {
		processNewChunks();
	}

	// Force reactive updates when chunks complete loading
	$: forceUpdate && processNewChunks();

	onDestroy(() => {
		// Stop render loop
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}

		// Clean up remaining blob URLs
		$splatChunks.forEach((chunk) => {
			URL.revokeObjectURL(chunk.url);
		});

		// Clean up gsplat resources
		if (renderer) {
			renderer.dispose?.();
		}

		// Remove canvas from container
		if (canvas && container) {
			container.removeChild(canvas);
		}

		// Clear references
		scene = null;
		camera = null;
		renderer = null;
		controls = null;
		canvas = null;
		loadedSplats.clear();
		loadedScenes.clear();
	});
</script>

<div class="gaussian-viewer">
	<!-- gsplat canvas container -->
	<div class="canvas-container" bind:this={container}></div>

	<!-- Viewer controls overlay -->
	<div class="viewer-controls">
		<button class="btn btn-sm" onclick={clearScenes} disabled={loadedScenes.size === 0}>
			Clear Scene
		</button>

		<button
			class="btn btn-sm btn-primary"
			onclick={downloadCombinedScene}
			disabled={loadedScenes.size === 0}
		>
			Download PLY
		</button>

		<div class="info">
			<span class="text-sm text-black">
				Loaded: {loadedScenes.size} chunks
			</span>
			{#if $splatChunks.length > 0}
				<span class="text-sm text-gray-500">
					In memory: {$splatChunks.length}
				</span>
			{/if}
			{#if loadedChunksOrder.length > 0}
				<span class="text-sm text-gray-400">
					Kept: {Math.min(2, loadedChunksOrder.length)}
				</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.gaussian-viewer {
		position: relative;
		width: 100%;
		height: 100%;
		background: #fff;
	}

	.canvas-container {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.viewer-controls {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: rgba(0, 0, 0, 0.1);
		padding: 12px;
		border-radius: 8px;
		backdrop-filter: blur(4px);
	}

	.btn {
		padding: 6px 12px;
		border: 1px solid #333;
		border-radius: 4px;
		background: #222;
		color: #fff;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn:hover:not(:disabled) {
		background: #333;
		border-color: #444;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-sm {
		font-size: 0.875rem;
		padding: 4px 8px;
	}

	.btn-primary {
		background: #0066cc;
		border-color: #0056b3;
	}

	.btn-primary:hover:not(:disabled) {
		background: #0056b3;
		border-color: #004494;
	}

	.info {
		color: #ccc;
		font-size: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.text-sm {
		font-size: 0.875rem;
	}

	.text-gray-500 {
		color: #6b7280;
	}

	.text-gray-400 {
		color: #9ca3af;
	}
</style>
