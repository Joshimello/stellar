import { get } from 'svelte/store';
import { serverUrl, websocketConnected, addLog, sessionStatus, chunksInfo, addSplatChunk } from './stores.js';

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

    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

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

    // Update chunks info
    chunksInfo.update(chunks => {
      const existingIndex = chunks.findIndex(c => c.chunkId === chunk_id);
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
      try {
        await this.downloadGaussianSplat(download_urls.gaussian_splat, chunk_id);
      } catch (error) {
        addLog(`❌ Failed to download chunk ${chunk_id}: ${error}`);
      }
    }
  }

  private async downloadGaussianSplat(url: string, chunkId: string): Promise<void> {
    try {
      const fullUrl = `${get(serverUrl)}${url}`;
      const response = await fetch(fullUrl, { timeout: 30000 } as any);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      addLog(`💾 Downloaded chunk ${chunkId} (${blob.size} bytes)`);

      // Add to splat chunks store
      addSplatChunk(chunkId, blob);

    } catch (error) {
      throw new Error(`Error downloading chunk ${chunkId}: ${error}`);
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
