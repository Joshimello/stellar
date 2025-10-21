<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import * as THREE from 'three';
	import { splatChunks } from '../stores.js';

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

	// Load a new splat scene from blob URL
	async function loadSplatScene(chunkId: string, blobUrl: string) {
		if (!scene || !SPLAT || loadedScenes.has(chunkId)) return;

		try {
			// Convert blob URL to ArrayBuffer
			const response = await fetch(blobUrl);
			const arrayBuffer = await response.arrayBuffer();

			// Load PLY from ArrayBuffer
			const splat = SPLAT.PLYLoader.LoadFromArrayBuffer(arrayBuffer, scene);

			// Store reference to the splat for potential cleanup
			loadedSplats.set(chunkId, splat);
			loadedScenes.add(chunkId);
			loadedScenes = new Set(loadedScenes);

			console.log(`Loaded PLY splat scene for chunk: ${chunkId}`);
		} catch (error) {
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
			console.log('Cleared all splat scenes');
		}
	}

	// Reactive statement to initialize viewer when container and library are ready
	$: if (container && isLibraryLoaded && !renderer) {
		initViewer();
	}

	// Reactive statement to load new chunks
	$: {
		if ($splatChunks.length > 0 && scene) {
			for (const chunk of $splatChunks) {
				if (!loadedScenes.has(chunk.id)) {
					loadSplatScene(chunk.id, chunk.url);
				}
			}
		}
	}

	onDestroy(() => {
		// Stop render loop
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}

		// Clean up blob URLs
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
		<button class="btn btn-sm" onclick={clearScenes} disabled={$splatChunks.length === 0}>
			Clear Scene
		</button>

		<div class="info">
			<span class="text-sm text-black">
				Loaded: {loadedScenes.size} / {$splatChunks.length} chunks
			</span>
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

	.info {
		color: #ccc;
		font-size: 0.75rem;
	}

	.text-sm {
		font-size: 0.875rem;
	}

	.text-gray-600 {
		color: #9ca3af;
	}
</style>
