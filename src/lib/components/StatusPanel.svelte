<script lang="ts">
	import { onMount } from 'svelte';
	import toast from 'svelte-french-toast';
	import { graphqlClient } from '../graphql.js';
	import {
		chunksInfo,
		clearLogs,
		isDownloadingChunks,
		sessionId,
		sessionStatus,
		splatChunks,
		statusLogs,
		uploadedImages,
		websocketConnected
	} from '../stores.js';

	let statusPollingInterval: number | null = null;
	let autoScroll = true;
	let logContainer: HTMLDivElement;

	// Start polling session status
	function startStatusPolling() {
		if (statusPollingInterval) return;

		statusPollingInterval = setInterval(async () => {
			if ($sessionId) {
				try {
					const status = await graphqlClient.getSessionStatus($sessionId);
					sessionStatus.set(status);

					const chunks = await graphqlClient.getChunksInfo($sessionId);
					chunksInfo.set(chunks);
				} catch (error) {
					// Silently fail polling to avoid spam
				}
			}
		}, 3000); // Poll every 3 seconds
	}

	// Stop polling session status
	function stopStatusPolling() {
		if (statusPollingInterval) {
			clearInterval(statusPollingInterval);
			statusPollingInterval = null;
		}
	}

	// Auto-scroll logs to bottom
	function scrollToBottom() {
		if (autoScroll && logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	}

	// Handle scroll to detect if user scrolled up
	function handleScroll() {
		if (logContainer) {
			const isAtBottom =
				logContainer.scrollTop + logContainer.clientHeight >= logContainer.scrollHeight - 10;
			autoScroll = isAtBottom;
		}
	}

	// This function is now handled in GaussianViewer component
	// Keeping for backward compatibility but showing appropriate message
	function showDownloadMessage() {
		toast('Use the "Download PLY" button in the 3D viewer to export the combined scene', {
			duration: 4000,
			icon: 'ℹ️'
		});
	}

	// Toggle auto-scroll
	function toggleAutoScroll() {
		autoScroll = !autoScroll;
		if (autoScroll) {
			scrollToBottom();
		}
	}

	// Reactive statement to scroll when logs change
	$: if ($statusLogs.length > 0) {
		setTimeout(scrollToBottom, 0);
	}

	// Start/stop polling based on session
	$: if ($sessionId) {
		startStatusPolling();
	} else {
		stopStatusPolling();
		sessionStatus.set(null);
		chunksInfo.set([]);
	}

	onMount(() => {
		return () => {
			stopStatusPolling();
		};
	});
</script>

<div class="status-panel">
	<!-- Session Status -->
	<div class="section">
		<h3 class="section-title">Session Status</h3>
		<div class="status-grid">
			{#if $sessionStatus}
				<div class="status-item">
					<span class="status-label">Session ID:</span>
					<span class="status-value" title={$sessionStatus.sessionId}>
						{$sessionStatus.sessionId.substring(0, 8)}...
					</span>
				</div>
				<div class="status-item">
					<span class="status-label">Images:</span>
					<span class="status-value">{$sessionStatus.imageCount}</span>
				</div>
				<div class="status-item">
					<span class="status-label">Chunks:</span>
					<span class="status-value">{$sessionStatus.chunksProcessed}</span>
				</div>
				<div class="status-item">
					<span class="status-label">Active:</span>
					<span class="status-value" class:status-active={$sessionStatus.isActive}>
						{$sessionStatus.isActive ? 'Yes' : 'No'}
					</span>
				</div>
				<div class="status-item">
					<span class="status-label">Loops:</span>
					<span class="status-value" class:status-loops={$sessionStatus.hasLoops}>
						{$sessionStatus.hasLoops ? 'Detected' : 'None'}
					</span>
				</div>
				<div class="status-item">
					<span class="status-label">WebSocket:</span>
					<span class="status-value" class:status-connected={$websocketConnected}>
						{$websocketConnected ? 'Connected' : 'Disconnected'}
					</span>
				</div>
				<div class="status-item">
					<span class="status-label">Downloading:</span>
					<span class="status-value" class:status-downloading={$isDownloadingChunks}>
						{$isDownloadingChunks ? 'Yes' : 'No'}
					</span>
				</div>
			{:else}
				<div class="no-session">
					<span>No active session</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Uploaded Images -->
	<div class="section">
		<h3 class="section-title">Uploaded Images ({$uploadedImages.length})</h3>
		{#if $uploadedImages.length > 0}
			<div class="image-list">
				{#each $uploadedImages as imageName}
					<div class="image-item">
						<span class="image-name" title={imageName}>{imageName}</span>
					</div>
				{/each}
			</div>
		{:else}
			<div class="empty-state">No images uploaded yet</div>
		{/if}
	</div>

	<!-- Chunks Info -->
	<div class="section">
		<h3 class="section-title">
			Chunks ({$chunksInfo.length})
			{#if $splatChunks.length > 0}
				<button class="btn btn-sm btn-secondary" on:click={showDownloadMessage}>
					Download in 3D Viewer
				</button>
			{/if}
		</h3>
		{#if $chunksInfo.length > 0}
			<div class="chunks-list">
				{#each $chunksInfo as chunk}
					<div class="chunk-item">
						<div class="chunk-info">
							<span class="chunk-id" title={chunk.chunkId}>
								{chunk.chunkId.substring(0, 8)}...
							</span>
							<span class="chunk-frames">
								Frames {chunk.startFrame}-{chunk.endFrame}
							</span>
						</div>
						<div class="chunk-status">
							<span class="status-badge" class:aligned={chunk.isAligned}>
								{chunk.isAligned ? '✓ Aligned' : '✗ Unaligned'}
							</span>
							<span class="status-badge" class:gaussian={chunk.hasGaussianData}>
								{chunk.hasGaussianData ? '✓ Gaussian' : '✗ No Gaussian'}
							</span>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="empty-state">No chunks processed yet</div>
		{/if}
	</div>

	<!-- Status Logs -->
	<div class="section logs-section">
		<div class="logs-header">
			<h3 class="section-title">Status Logs ({$statusLogs.length})</h3>
			<div class="logs-controls">
				<button
					class="btn btn-sm"
					class:active={autoScroll}
					on:click={toggleAutoScroll}
					title="Toggle auto-scroll"
				>
					{autoScroll ? '📜' : '🔒'}
				</button>
				<button class="btn btn-sm" on:click={clearLogs}> Clear </button>
			</div>
		</div>

		<div class="logs-container" bind:this={logContainer} on:scroll={handleScroll}>
			{#if $statusLogs.length > 0}
				{#each $statusLogs as log}
					<div class="log-entry">{log}</div>
				{/each}
			{:else}
				<div class="empty-state">No logs yet</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.status-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		height: 100%;
	}

	.section {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 16px;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 12px 0;
		color: #374151;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.status-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.status-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 4px 0;
	}

	.status-label {
		font-size: 0.875rem;
		color: #6b7280;
		font-weight: 500;
	}

	.status-value {
		font-size: 0.875rem;
		color: #374151;
		font-weight: 600;
	}

	.status-active {
		color: #10b981;
	}

	.status-loops {
		color: #f59e0b;
	}

	.status-connected {
		color: #10b981;
	}

	.status-downloading {
		color: #f59e0b;
	}

	.no-session {
		grid-column: 1 / -1;
		text-align: center;
		color: #6b7280;
		font-style: italic;
		padding: 16px 0;
	}

	.image-list {
		max-height: 120px;
		overflow-y: auto;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
	}

	.image-item {
		padding: 8px 12px;
		border-bottom: 1px solid #f3f4f6;
	}

	.image-item:last-child {
		border-bottom: none;
	}

	.image-name {
		font-size: 0.875rem;
		color: #374151;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chunks-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 200px;
		overflow-y: auto;
	}

	.chunk-item {
		padding: 8px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}

	.chunk-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}

	.chunk-id {
		font-size: 0.75rem;
		font-weight: 600;
		color: #374151;
		font-family: monospace;
	}

	.chunk-frames {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.chunk-status {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.status-badge {
		font-size: 0.625rem;
		padding: 2px 6px;
		border-radius: 12px;
		font-weight: 600;
		text-align: center;
		background: #f3f4f6;
		color: #6b7280;
	}

	.status-badge.aligned {
		background: #d1fae5;
		color: #065f46;
	}

	.status-badge.gaussian {
		background: #dbeafe;
		color: #1e40af;
	}

	.logs-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.logs-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.logs-controls {
		display: flex;
		gap: 8px;
	}

	.logs-container {
		flex: 1;
		min-height: 200px;
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		padding: 8px;
		background: #f9fafb;
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', monospace;
	}

	.log-entry {
		font-size: 0.75rem;
		color: #374151;
		margin-bottom: 4px;
		line-height: 1.4;
		word-break: break-all;
	}

	.log-entry:last-child {
		margin-bottom: 0;
	}

	.empty-state {
		text-align: center;
		color: #6b7280;
		font-style: italic;
		padding: 16px 0;
		font-size: 0.875rem;
	}

	.btn {
		padding: 4px 8px;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		background: white;
		color: #374151;
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 500;
		transition: all 0.2s;
	}

	.btn:hover {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	.btn-sm {
		padding: 2px 6px;
		font-size: 0.625rem;
	}

	.btn-secondary {
		background: #6b7280;
		color: white;
		border-color: #6b7280;
	}

	.btn-secondary:hover {
		background: #4b5563;
		border-color: #4b5563;
	}

	.btn.active {
		background: #3b82f6;
		color: white;
		border-color: #3b82f6;
	}
</style>
