import { writable } from 'svelte/store';

// Session management
export const sessionId = writable<string>('');
export const serverUrl = writable<string>('http://localhost:8000');

// Image upload management
export const imagesQueue = writable<File[]>([]);
export const uploadedImages = writable<string[]>([]);
export const isUploading = writable<boolean>(false);
export const uploadProgress = writable<number>(0);

// Status and logging
export const statusLogs = writable<string[]>([]);
export const sessionStatus = writable<{
  sessionId: string;
  imageCount: number;
  chunksProcessed: number;
  isActive: boolean;
  hasLoops: boolean;
} | null>(null);

// Gaussian splat data
export const splatChunks = writable<{ id: string; blob: Blob; url: string }[]>([]);
export const chunksInfo = writable<Array<{
  chunkId: string;
  startFrame: number;
  endFrame: number;
  isAligned: boolean;
  hasGaussianData: boolean;
}>>([]);

// WebSocket connection status
export const websocketConnected = writable<boolean>(false);

// Session configuration
export const sessionConfig = writable({
  chunkSize: 6,
  overlap: 3,
  loopEnable: true,
  uploadDelay: 2000 // milliseconds
});

// Add a new log entry
export function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  const logMessage = `[${timestamp}] ${message}`;
  statusLogs.update(logs => [...logs.slice(-49), logMessage]); // Keep last 50 logs
}

// Clear all logs
export function clearLogs() {
  statusLogs.set([]);
}

// Add image to upload queue
export function addImagesToQueue(files: File[]) {
  imagesQueue.update(queue => [...queue, ...files]);
}

// Remove image from queue
export function removeImageFromQueue(index: number) {
  imagesQueue.update(queue => queue.filter((_, i) => i !== index));
}

// Add uploaded image
export function addUploadedImage(imageName: string) {
  uploadedImages.update(images => [...images, imageName]);
}

// Clear all uploaded images
export function clearUploadedImages() {
  uploadedImages.set([]);
}

// Add splat chunk
export function addSplatChunk(id: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  splatChunks.update(chunks => [...chunks, { id, blob, url }]);
}

// Clear splat chunks and revoke URLs
export function clearSplatChunks() {
  splatChunks.update(chunks => {
    chunks.forEach(chunk => URL.revokeObjectURL(chunk.url));
    return [];
  });
}

// Reset all stores to initial state
export function resetStores() {
  sessionId.set('');
  imagesQueue.set([]);
  uploadedImages.set([]);
  isUploading.set(false);
  uploadProgress.set(0);
  statusLogs.set([]);
  sessionStatus.set(null);
  chunksInfo.set([]);
  websocketConnected.set(false);
  clearSplatChunks();
}
