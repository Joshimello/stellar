<script lang="ts">
	import toast from 'svelte-french-toast';
	import { imagesQueue, isUploading, sessionConfig, sessionId, uploadProgress } from '../stores.js';
	import { formatFileSize, imageUploadService, validateImageFiles } from '../upload.js';

	let fileInput: HTMLInputElement;
	let dragOver = false;

	// Handle file selection
	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			addFiles(target.files);
			target.value = ''; // Clear input to allow re-selecting same files
		}
	}

	// Handle drag and drop
	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			addFiles(files);
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragOver = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
	}

	// Add files to queue with validation
	function addFiles(fileList: FileList) {
		const { valid, invalid } = validateImageFiles(fileList);

		if (invalid.length > 0) {
			toast.error(`Invalid files:\n${invalid.join('\n')}`);
		}

		if (valid.length > 0) {
			imagesQueue.update((queue) => [...queue, ...valid]);
			toast.success(`Added ${valid.length} image(s) to queue`);
		}
	}

	// Remove file from queue
	function removeFromQueue(index: number) {
		imagesQueue.update((queue) => queue.filter((_, i) => i !== index));
	}

	// Clear entire queue
	function clearQueue() {
		imagesQueue.set([]);
		toast.success('Queue cleared');
	}

	// Start upload process
	async function startUpload() {
		if ($imagesQueue.length === 0) {
			toast.error('No images in queue');
			return;
		}

		if (!$sessionId) {
			toast.error('No active session. Please create a session first.');
			return;
		}

		try {
			// Set upload delay from config
			imageUploadService.setUploadDelay($sessionConfig.uploadDelay);
			await imageUploadService.processUploadQueue($imagesQueue, $sessionId);
			imagesQueue.set([]); // Clear queue after successful upload
		} catch (error) {
			toast.error(`Upload failed: ${error}`);
		}
	}

	// Cancel upload
	function cancelUpload() {
		imageUploadService.cancelUpload();
	}

	// Trigger file input
	function triggerFileInput() {
		fileInput.click();
	}
</script>

<div class="image-uploader">
	<h3 class="title">Image Upload</h3>

	<!-- File input (hidden) -->
	<input
		bind:this={fileInput}
		type="file"
		accept="image/jpeg,image/jpg,image/png"
		multiple
		style="display: none;"
		on:change={handleFileSelect}
	/>

	<!-- Drop zone -->
	<div
		class="drop-zone"
		class:drag-over={dragOver}
		role="button"
		tabindex="0"
		on:click={triggerFileInput}
		on:drop={handleDrop}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:keydown={(e) => e.key === 'Enter' && triggerFileInput()}
	>
		<div class="drop-zone-content">
			<svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
				/>
			</svg>
			<p class="drop-text">
				{#if dragOver}
					Drop files here
				{:else}
					Click to select or drag & drop images
				{/if}
			</p>
			<p class="drop-hint">JPG, PNG files up to 50MB</p>
		</div>
	</div>

	<!-- Queue management -->
	{#if $imagesQueue.length > 0}
		<div class="queue-section">
			<div class="queue-header">
				<h4>Queue ({$imagesQueue.length} files)</h4>
				<div class="queue-actions">
					{#if !$isUploading}
						<button class="btn btn-primary" on:click={startUpload}> Upload All </button>
						<button class="btn btn-secondary" on:click={clearQueue}> Clear Queue </button>
					{:else}
						<button class="btn btn-danger" on:click={cancelUpload}> Cancel Upload </button>
					{/if}
				</div>
			</div>

			<!-- Upload progress -->
			{#if $isUploading}
				<div class="progress-section">
					<div class="progress-bar">
						<div class="progress-fill" style="width: {$uploadProgress}%"></div>
					</div>
					<span class="progress-text">{Math.round($uploadProgress)}% complete</span>
				</div>
			{/if}

			<!-- File list -->
			<div class="file-list">
				{#each $imagesQueue as file, index}
					<div class="file-item">
						<div class="file-info">
							<span class="file-name" title={file.name}>{file.name}</span>
							<span class="file-size">{formatFileSize(file.size)}</span>
						</div>
						{#if !$isUploading}
							<button
								class="remove-btn"
								on:click={() => removeFromQueue(index)}
								title="Remove from queue"
							>
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.image-uploader {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.title {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0;
		color: #374151;
	}

	.drop-zone {
		border: 2px dashed #d1d5db;
		border-radius: 8px;
		padding: 32px;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s;
		background: #f9fafb;
	}

	.drop-zone:hover,
	.drop-zone.drag-over {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.drop-zone-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.upload-icon {
		width: 48px;
		height: 48px;
		color: #6b7280;
	}

	.drop-text {
		font-size: 1rem;
		font-weight: 500;
		color: #374151;
		margin: 0;
	}

	.drop-hint {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0;
	}

	.queue-section {
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 16px;
		background: white;
	}

	.queue-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.queue-header h4 {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
		color: #374151;
	}

	.queue-actions {
		display: flex;
		gap: 8px;
	}

	.btn {
		padding: 6px 12px;
		border: 1px solid;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s;
	}

	.btn-primary {
		background: #3b82f6;
		color: white;
		border-color: #3b82f6;
	}

	.btn-primary:hover {
		background: #2563eb;
		border-color: #2563eb;
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

	.btn-danger {
		background: #ef4444;
		color: white;
		border-color: #ef4444;
	}

	.btn-danger:hover {
		background: #dc2626;
		border-color: #dc2626;
	}

	.progress-section {
		margin-bottom: 16px;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background: #e5e7eb;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 8px;
	}

	.progress-fill {
		height: 100%;
		background: #3b82f6;
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.file-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.file-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px;
		background: #f9fafb;
		border-radius: 4px;
		border: 1px solid #e5e7eb;
	}

	.file-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}

	.file-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-size {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.remove-btn {
		background: none;
		border: none;
		color: #6b7280;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.remove-btn:hover {
		color: #ef4444;
		background: #fef2f2;
	}
</style>
