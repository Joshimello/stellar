<script lang="ts">
	import GaussianViewer from '$lib/components/GaussianViewer.svelte';
	import ImageUploader from '$lib/components/ImageUploader.svelte';
	import SessionController from '$lib/components/SessionController.svelte';
	import StatusPanel from '$lib/components/StatusPanel.svelte';
	import { addLog } from '$lib/stores.js';
	import { onMount } from 'svelte';
	import { Toaster } from 'svelte-french-toast';

	onMount(() => {
		addLog('Application initialized');
	});
</script>

<div class="app">
	<!-- Main 3D Viewer (full screen) -->
	<div class="viewer-container">
		<GaussianViewer />
	</div>

	<!-- Control Panel (right side) -->
	<div class="control-panel">
		<div class="panel-content">
			<!-- Session Management -->
			<div class="control-section">
				<SessionController />
			</div>

			<!-- Image Upload -->
			<div class="control-section">
				<ImageUploader />
			</div>

			<!-- Status and Logs -->
			<div class="control-section status-section">
				<StatusPanel />
			</div>
		</div>
	</div>

	<!-- Toast notifications -->
	<Toaster
		position="bottom-right"
		toastOptions={{
			duration: 4000,
			style: 'background: #363636; color: #fff; border-radius: 8px;'
		}}
	/>
</div>

<style>
	.app {
		position: relative;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		background: #000;
		display: flex;
	}

	.viewer-container {
		flex: 1;
		position: relative;
		width: 100%;
		height: 100%;
	}

	.control-panel {
		width: 400px;
		height: 100vh;
		background: #f9fafb;
		border-left: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
		overflow-y: auto;
	}

	.control-section {
		flex-shrink: 0;
	}

	.status-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	/* Mobile responsiveness */
	@media (max-width: 1024px) {
		.app {
			flex-direction: column;
		}

		.viewer-container {
			height: 60vh;
		}

		.control-panel {
			width: 100%;
			height: 40vh;
			border-left: none;
			border-top: 1px solid #e5e7eb;
		}

		.panel-content {
			padding: 12px;
			gap: 12px;
		}
	}

	@media (max-width: 768px) {
		.control-panel {
			width: 100%;
		}

		.panel-content {
			padding: 8px;
			gap: 8px;
		}
	}
</style>
