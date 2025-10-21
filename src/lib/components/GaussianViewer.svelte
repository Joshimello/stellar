<script lang="ts">
	import { Canvas, T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { onDestroy, onMount } from 'svelte';
	import * as THREE from 'three';
	import { splatChunks } from '../stores.js';

	// Import dynamically to avoid SSR issues
	let GaussianSplats3DLib: any = null;
	let viewer: any = null;
	let threeScene: THREE.Scene | null = null;
	let loadedScenes = new Set<string>();
	let isLibraryLoaded = false;

	// Camera settings
	let cameraPosition: [number, number, number] = [5, 5, 5];
	let cameraTarget: [number, number, number] = [0, 0, 0];

	// Load GaussianSplats3D library dynamically
	onMount(async () => {
		try {
			GaussianSplats3DLib = await import('@mkkellogg/gaussian-splats-3d');
			isLibraryLoaded = true;
			console.log('GaussianSplats3D library loaded');
			// Initialize viewer if scene is ready
			if (threeScene) {
				initViewer();
			}
		} catch (error) {
			console.error('Failed to load GaussianSplats3D library:', error);
		}
	});

	// Initialize the DropInViewer
	function initViewer() {
		if (!threeScene || viewer || !isLibraryLoaded || !GaussianSplats3DLib) return;

		try {
			viewer = new GaussianSplats3DLib.DropInViewer({
				gpuAcceleratedSort: true,
				sharedMemoryForWorkers: true,
				sphericalHarmonicsDegree: 2,
				halfPrecisionCovariancesOnGPU: true,
				dynamicScene: false,
				antialiased: false,
				focalAdjustment: 1.0,
				logLevel: GaussianSplats3DLib.LogLevel?.None || 0,
				enableOptionalEffects: false,
				inMemoryCompressionLevel: 2,
				freeIntermediateSplatData: false
			});

			threeScene.add(viewer);
			console.log('GaussianSplats3D DropInViewer initialized');
		} catch (error) {
			console.error('Failed to initialize GaussianSplats3D viewer:', error);
		}
	}

	// Load a new splat scene
	async function loadSplatScene(chunkId: string, blobUrl: string) {
		if (!viewer || loadedScenes.has(chunkId)) return;

		try {
			await viewer.addSplatScene(blobUrl, {
				splatAlphaRemovalThreshold: 5,
				showLoadingUI: false,
				position: [0, 0, 0],
				rotation: [0, 0, 0, 1],
				scale: [1, 1, 1]
			});

			loadedScenes.add(chunkId);
			console.log(`Loaded splat scene for chunk: ${chunkId}`);
		} catch (error) {
			console.error(`Failed to load splat scene for chunk ${chunkId}:`, error);
		}
	}

	// Clear all loaded scenes
	function clearScenes() {
		if (viewer && threeScene) {
			threeScene.remove(viewer);
			viewer = null;
			loadedScenes.clear();
			initViewer();
		}
	}

	// Scene reference callback
	function onSceneMount(scene: THREE.Scene) {
		threeScene = scene;
		// Initialize viewer if library is already loaded
		if (isLibraryLoaded) {
			initViewer();
		}
	}

	// Reactive statement to load new chunks
	$: {
		if ($splatChunks.length > 0 && viewer) {
			for (const chunk of $splatChunks) {
				if (!loadedScenes.has(chunk.id)) {
					loadSplatScene(chunk.id, chunk.url);
				}
			}
		}
	}

	onDestroy(() => {
		// Clean up blob URLs
		$splatChunks.forEach((chunk) => {
			URL.revokeObjectURL(chunk.url);
		});

		if (viewer && threeScene) {
			threeScene.remove(viewer);
		}
	});
</script>

<div class="gaussian-viewer">
	<Canvas>
		<T.Scene oncreate={onSceneMount}>
			<!-- Camera -->
			<T.PerspectiveCamera makeDefault position={cameraPosition} fov={60} near={0.1} far={1000}>
				<OrbitControls
					target={cameraTarget}
					enableDamping={true}
					dampingFactor={0.05}
					enablePan={true}
					enableZoom={true}
					enableRotate={true}
					minDistance={0.5}
					maxDistance={100}
					minPolarAngle={0}
					maxPolarAngle={Math.PI}
				/>
			</T.PerspectiveCamera>

			<!-- Lighting -->
			<T.AmbientLight intensity={0.6} />
			<T.DirectionalLight position={[10, 10, 5]} intensity={0.4} castShadow={true} />

			<!-- Grid helper for reference -->
			<T.GridHelper args={[10, 10]} />

			<!-- Axes helper for reference -->
			<T.AxesHelper args={[1]} />
		</T.Scene>
	</Canvas>

	<!-- Viewer controls overlay -->
	<div class="viewer-controls">
		<button class="btn btn-sm" onclick={clearScenes} disabled={$splatChunks.length === 0}>
			Clear Scenes
		</button>

		<div class="info">
			<span class="text-sm text-gray-600">
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
		background: #000;
	}

	.viewer-controls {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: rgba(0, 0, 0, 0.7);
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
