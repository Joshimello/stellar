import { get } from 'svelte/store';
import {
	serverUrl,
	isUploading,
	uploadProgress,
	addUploadedImage,
	addLog,
	isDownloadingChunks
} from './stores.js';

export class ImageUploadService {
	private uploadQueue: File[] = [];
	private isProcessing: boolean = false;
	private uploadDelay: number = 0; // No delay for faster uploads
	private shouldPause: boolean = false;
	private concurrentUploads: number = 3; // Upload 3 files simultaneously

	constructor() {
		// Monitor chunk downloading state
		isDownloadingChunks.subscribe((downloading) => {
			if (downloading && this.isProcessing) {
				this.shouldPause = true;
				addLog('⏸️ Pausing uploads for chunk processing');
			} else if (!downloading && this.shouldPause) {
				this.shouldPause = false;
				addLog('▶️ Resuming uploads');
			}
		});
	}

	setUploadDelay(delay: number): void {
		this.uploadDelay = delay;
	}

	setConcurrentUploads(count: number): void {
		this.concurrentUploads = Math.max(1, Math.min(count, 5)); // Limit 1-5 concurrent uploads
	}

	async uploadImage(file: File, sessionId: string): Promise<boolean> {
		if (!sessionId) {
			throw new Error('No active session');
		}

		const url = `${get(serverUrl)}/upload_image/${sessionId}`;
		const formData = new FormData();
		formData.append('file', file);

		try {
			const response = await fetch(url, {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
			}

			const data = await response.json();
			const fileName = file.name;

			addLog(`Uploaded ${fileName}, total images: ${data.image_count}`);
			addUploadedImage(fileName);

			return true;
		} catch (error) {
			addLog(`Failed to upload ${file.name}: ${error}`);
			throw error;
		}
	}

	async processUploadQueue(files: File[], sessionId: string): Promise<void> {
		if (this.isProcessing) {
			addLog('Upload already in progress');
			return;
		}

		this.uploadQueue = [...files];
		this.isProcessing = true;
		isUploading.set(true);
		uploadProgress.set(0);

		try {
			let uploadedCount = 0;

			// Process uploads in concurrent batches
			for (let i = 0; i < this.uploadQueue.length; i += this.concurrentUploads) {
				// Check if we should pause for chunk processing
				if (this.shouldPause) {
					addLog('⏸️ Upload paused for chunk processing...');
					// Wait until pause is lifted
					while (this.shouldPause && this.isProcessing) {
						await this.delay(500); // Check every 500ms
					}
					if (!this.isProcessing) break; // Upload was cancelled
					addLog('▶️ Upload resumed');
				}

				const batch = this.uploadQueue.slice(i, i + this.concurrentUploads);
				const batchPromises = batch.map(async (file, batchIndex) => {
					const globalIndex = i + batchIndex;
					addLog(`Uploading image ${globalIndex + 1}/${this.uploadQueue.length}: ${file.name}`);

					try {
						await this.uploadImage(file, sessionId);
						uploadedCount++;
						const progress = (uploadedCount / this.uploadQueue.length) * 100;
						uploadProgress.set(progress);
					} catch (error) {
						addLog(`Failed to upload ${file.name}: ${error}`);
						// Continue with other files in batch
					}
				});

				// Wait for current batch to complete
				await Promise.all(batchPromises);

				// Only add delay between batches if configured
				if (this.uploadDelay > 0 && i + this.concurrentUploads < this.uploadQueue.length) {
					await this.delay(this.uploadDelay);
				}
			}

			addLog(
				`All images uploaded (${uploadedCount}/${this.uploadQueue.length} successful). Waiting for processing to complete...`
			);
		} finally {
			this.isProcessing = false;
			isUploading.set(false);
			this.uploadQueue = [];
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	cancelUpload(): void {
		if (this.isProcessing) {
			this.uploadQueue = [];
			this.isProcessing = false;
			this.shouldPause = false;
			isUploading.set(false);
			uploadProgress.set(0);
			addLog('Upload cancelled');
		}
	}

	isUploading(): boolean {
		return this.isProcessing;
	}

	getQueueLength(): number {
		return this.uploadQueue.length;
	}
}

export const imageUploadService = new ImageUploadService();

// Utility function to validate image files
export function validateImageFiles(files: FileList | File[]): { valid: File[]; invalid: string[] } {
	const validExtensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];
	const maxSizeBytes = 50 * 1024 * 1024; // 50MB

	const valid: File[] = [];
	const invalid: string[] = [];

	const fileArray = Array.from(files);

	for (const file of fileArray) {
		const extension = '.' + file.name.split('.').pop()?.toLowerCase();

		if (!validExtensions.some((ext) => ext.toLowerCase() === extension)) {
			invalid.push(`${file.name}: Invalid file type (must be JPG or PNG)`);
			continue;
		}

		if (file.size > maxSizeBytes) {
			invalid.push(`${file.name}: File too large (max 50MB)`);
			continue;
		}

		if (file.size === 0) {
			invalid.push(`${file.name}: Empty file`);
			continue;
		}

		valid.push(file);
	}

	return { valid, invalid };
}

// Utility function to format file size
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
