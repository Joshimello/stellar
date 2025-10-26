import { get } from 'svelte/store';
import {
	serverUrl,
	websocketConnected,
	addLog,
	sessionStatus,
	chunksInfo,
	addSplatChunk,
	isDownloadingChunks
} from './stores.js';

export interface WebSocketMessage {
	type: string;
	[key: string]: any;
}

class WebSocketService {
	private ws: WebSocket | null = null;
	private sessionId: string = '';
	private reconnectAttempts: number = 0;
	private maxReconnectAttempts: number = 5;
	private reconnectDelay: number = 1000;
	private isIntentionallyClosed: boolean = false;

	async connect(sessionId: string): Promise<boolean> {
		this.sessionId = sessionId;
		this.isIntentionallyClosed = false;

		return new Promise((resolve) => {
			try {
				const wsUrl = `${get(serverUrl).replace('http', 'ws')}/ws/${sessionId}`;
				this.ws = new WebSocket(wsUrl);

				this.ws.onopen = () => {
					addLog('WebSocket connected');
					websocketConnected.set(true);
					this.reconnectAttempts = 0;
					resolve(true);
				};

				this.ws.onmessage = (event) => {
					try {
						const data: WebSocketMessage = JSON.parse(event.data);
						this.handleMessage(data);
					} catch (error) {
						addLog(`Failed to parse WebSocket message: ${error}`);
					}
				};

				this.ws.onclose = (event) => {
					websocketConnected.set(false);
					if (!this.isIntentionallyClosed) {
						addLog('WebSocket connection closed');
						this.attemptReconnect();
					}
				};

				this.ws.onerror = (error) => {
					addLog('WebSocket error occurred');
					websocketConnected.set(false);
					resolve(false);
				};

				// Timeout after 5 seconds
				setTimeout(() => {
					if (this.ws?.readyState !== WebSocket.OPEN) {
						resolve(false);
					}
				}, 5000);
			} catch (error) {
				addLog(`Failed to connect WebSocket: ${error}`);
				resolve(false);
			}
		});
	}

	private async attemptReconnect(): Promise<void> {
		if (this.isIntentionallyClosed || this.reconnectAttempts >= this.maxReconnectAttempts) {
			return;
		}

		this.reconnectAttempts++;
		addLog(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

		await new Promise((resolve) => setTimeout(resolve, this.reconnectDelay));

		const connected = await this.connect(this.sessionId);
		if (!connected) {
			// Exponential backoff
			this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
		}
	}

	private async handleMessage(data: WebSocketMessage): Promise<void> {
		const { type } = data;

		switch (type) {
			case 'connected':
				addLog(`✓ WebSocket connected for session: ${data.session_id}`);
				break;

			case 'image_added':
				addLog(`✓ Image added: ${data.image_path} (Total: ${data.image_count})`);
				break;

			case 'chunk_processing_start':
				const { chunk_id, start_frame, end_frame } = data;
				addLog(`🔄 Processing chunk ${chunk_id} (frames ${start_frame}-${end_frame})`);
				addLog(`📥 Setting download state to TRUE - uploads will be paused`);
				// Set downloading state to pause uploads during processing
				isDownloadingChunks.set(true);
				break;

			case 'global_alignment_updated':
				const { num_chunks, num_loops } = data;
				addLog(`🔄 Global alignment updated: ${num_chunks} chunks, ${num_loops} loops`);
				break;

			case 'loop_detected':
				const { loop_pair, chunk_id: loopChunkId } = data;
				addLog(`🔄 Loop detected: ${loop_pair} in chunk ${loopChunkId}`);
				break;

			case 'chunk_complete':
				await this.handleChunkComplete(data);
				break;

			case 'error':
				addLog(`❌ Error: ${data.message}`);
				addLog(`📤 Clearing download state due to error - uploads will resume`);
				// Clear downloading state on error
				isDownloadingChunks.set(false);
				break;

			default:
				addLog(`📨 Unknown message type: ${type}`);
				break;
		}
	}

	private async handleChunkComplete(data: any): Promise<void> {
		const {
			chunk_id,
			start_frame,
			end_frame,
			has_gaussian_data,
			is_aligned,
			has_global_alignment,
			download_urls
		} = data;

		const statusParts = [];
		if (has_global_alignment) {
			statusParts.push('globally aligned');
		} else if (is_aligned) {
			statusParts.push('pairwise aligned');
		} else {
			statusParts.push('unaligned');
		}

		const status = statusParts.join(', ');
		addLog(`✅ Chunk ${chunk_id} complete (${status}, frames ${start_frame}-${end_frame})`);
		addLog(`📋 Chunk processing finished, checking for download URLs...`);

		// Update chunks info
		chunksInfo.update((chunks) => {
			const existingIndex = chunks.findIndex((c) => c.chunkId === chunk_id);
			const newChunk = {
				chunkId: chunk_id,
				startFrame: start_frame,
				endFrame: end_frame,
				isAligned: is_aligned || has_global_alignment,
				hasGaussianData: has_gaussian_data
			};

			if (existingIndex >= 0) {
				chunks[existingIndex] = newChunk;
				return [...chunks];
			} else {
				return [...chunks, newChunk];
			}
		});

		// Download Gaussian splat PLY file if available
		if (download_urls?.gaussian_splat) {
			addLog(`🔗 Download URL found: ${download_urls.gaussian_splat}`);
			addLog(`⬇️ Starting download process for chunk ${chunk_id}...`);
			try {
				await this.downloadGaussianSplat(download_urls.gaussian_splat, chunk_id);
			} catch (error) {
				addLog(`❌ Failed to download chunk ${chunk_id}: ${error}`);
				addLog(`📤 Clearing download state due to download error - uploads will resume`);
				// Clear downloading state on download error
				isDownloadingChunks.set(false);
			}
		} else {
			addLog(`❌ No download URL available for chunk ${chunk_id}`);
			addLog(`📤 No download needed - clearing download state, uploads will resume`);
			// No download available, clear downloading state
			isDownloadingChunks.set(false);
		}
	}

	private async downloadGaussianSplat(url: string, chunkId: string): Promise<void> {
		try {
			const fullUrl = `${get(serverUrl)}${url}`;
			addLog(`🌐 Fetching from: ${fullUrl}`);
			addLog(`⏳ Starting HTTP request...`);

			const response = await fetch(fullUrl, { timeout: 30000 } as any);
			addLog(`📡 HTTP response received: ${response.status} ${response.statusText}`);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}

			addLog(`📦 Converting response to blob...`);
			const blob = await response.blob();
			addLog(`💾 Downloaded chunk ${chunkId} (${blob.size} bytes)`);
			addLog(`🗃️ Adding chunk to splat store...`);

			// Add to splat chunks store
			addSplatChunk(chunkId, blob);
			addLog(`✅ Chunk ${chunkId} successfully added to store`);
		} catch (error) {
			addLog(`💥 Download error details: ${error}`);
			throw new Error(`Error downloading chunk ${chunkId}: ${error}`);
		} finally {
			addLog(`📤 Download complete - clearing download state, uploads will resume`);
			// Clear downloading state to resume uploads
			isDownloadingChunks.set(false);
		}
	}

	disconnect(): void {
		this.isIntentionallyClosed = true;
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		websocketConnected.set(false);
		addLog('WebSocket disconnected');
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}
}

export const websocketService = new WebSocketService();
