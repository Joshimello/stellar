<script lang="ts">
  import { onDestroy } from 'svelte';
  import toast from 'svelte-french-toast';
  import { graphqlClient } from '../graphql.js';
  import {
  	addLog,
  	resetStores,
  	serverUrl,
  	sessionConfig,
  	sessionId,
  	websocketConnected
  } from '../stores.js';
  import { websocketService } from '../websocket.js';

  let isCreatingSession = false;
  let isClosingSession = false;

  // Create a new session
  async function createSession() {
    if (isCreatingSession) return;

    const config = $sessionConfig;

    if (!config.chunkSize || config.chunkSize < 1) {
      toast.error('Chunk size must be at least 1');
      return;
    }

    if (!config.overlap || config.overlap < 0) {
      toast.error('Overlap must be 0 or greater');
      return;
    }

    isCreatingSession = true;

    try {
      addLog('Creating session...');
      const newSessionId = await graphqlClient.createSession({
        chunkSize: config.chunkSize,
        overlap: config.overlap,
        loopEnable: config.loopEnable
      });

      sessionId.set(newSessionId);
      addLog(`✅ Session created: ${newSessionId}`);
      toast.success('Session created successfully');

      // Connect WebSocket
      addLog('Connecting WebSocket...');
      const connected = await websocketService.connect(newSessionId);

      if (!connected) {
        addLog('⚠️ WebSocket connection failed, but processing can continue without real-time updates');
        toast.error('WebSocket connection failed, but session is active');
      }

    } catch (error) {
      addLog(`❌ Failed to create session: ${error}`);
      toast.error(`Failed to create session: ${error}`);
    } finally {
      isCreatingSession = false;
    }
  }

  // Close the current session
  async function closeSession() {
    if (!$sessionId || isClosingSession) return;

    isClosingSession = true;

    try {
      addLog('Closing session...');

      // Disconnect WebSocket first
      websocketService.disconnect();

      // Close session via GraphQL
      const success = await graphqlClient.closeSession($sessionId);

      if (success) {
        addLog('✅ Session closed successfully');
        toast.success('Session closed');
      } else {
        addLog('⚠️ Session may not have closed properly');
        toast.error('Session may not have closed properly');
      }

      // Reset all stores regardless of success
      resetStores();

    } catch (error) {
      addLog(`❌ Failed to close session: ${error}`);
      toast.error(`Failed to close session: ${error}`);
      // Reset stores even on error
      resetStores();
    } finally {
      isClosingSession = false;
    }
  }

  // Update server URL
  function updateServerUrl(event: Event) {
    const target = event.target as HTMLInputElement;
    let url = target.value.trim();

    // Remove trailing slash
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    // Add protocol if missing
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }

    serverUrl.set(url);
  }

  // Update session config
  function updateChunkSize(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value);
    if (!isNaN(value) && value > 0) {
      sessionConfig.update(config => ({ ...config, chunkSize: value }));
    }
  }

  function updateOverlap(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value);
    if (!isNaN(value) && value >= 0) {
      sessionConfig.update(config => ({ ...config, overlap: value }));
    }
  }

  function updateLoopEnable(event: Event) {
    const target = event.target as HTMLInputElement;
    sessionConfig.update(config => ({ ...config, loopEnable: target.checked }));
  }

  function updateUploadDelay(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseFloat(target.value) * 1000; // Convert to milliseconds
    if (!isNaN(value) && value >= 0) {
      sessionConfig.update(config => ({ ...config, uploadDelay: value }));
    }
  }

  // Cleanup on component destroy
  onDestroy(() => {
    websocketService.disconnect();
  });
</script>

<div class="session-controller">
  <h3 class="title">Session Management</h3>

  <!-- Server Configuration -->
  <div class="config-section">
    <label class="label">
      Server URL
      <input
        type="url"
        class="input"
        value={$serverUrl}
        on:input={updateServerUrl}
        placeholder="http://localhost:8000"
        disabled={!!$sessionId}
      />
    </label>
  </div>

  <!-- Session Configuration -->
  <div class="config-section">
    <h4 class="subtitle">Session Configuration</h4>

    <div class="config-grid">
      <label class="label">
        Chunk Size
        <input
          type="number"
          class="input"
          value={$sessionConfig.chunkSize}
          on:input={updateChunkSize}
          min="1"
          max="20"
          disabled={!!$sessionId}
        />
      </label>

      <label class="label">
        Overlap
        <input
          type="number"
          class="input"
          value={$sessionConfig.overlap}
          on:input={updateOverlap}
          min="0"
          max="10"
          disabled={!!$sessionId}
        />
      </label>

      <label class="label">
        Upload Delay (seconds)
        <input
          type="number"
          class="input"
          value={$sessionConfig.uploadDelay / 1000}
          on:input={updateUploadDelay}
          min="0.1"
          max="10"
          step="0.1"
          disabled={!!$sessionId}
        />
      </label>

      <label class="checkbox-label">
        <input
          type="checkbox"
          class="checkbox"
          checked={$sessionConfig.loopEnable}
          on:change={updateLoopEnable}
          disabled={!!$sessionId}
        />
        Enable Loop Detection
      </label>
    </div>
  </div>

  <!-- Session Controls -->
  <div class="controls">
    {#if !$sessionId}
      <button
        class="btn btn-primary btn-large"
        on:click={createSession}
        disabled={isCreatingSession || !$serverUrl}
      >
        {#if isCreatingSession}
          Creating Session...
        {:else}
          Create Session
        {/if}
      </button>
    {:else}
      <div class="session-info">
        <div class="session-status">
          <span class="status-label">Session Active</span>
          <span class="status-id" title={$sessionId}>
            {$sessionId.substring(0, 8)}...
          </span>
          <span
            class="connection-status"
            class:connected={$websocketConnected}
            class:disconnected={!$websocketConnected}
          >
            {$websocketConnected ? '🟢' : '🔴'}
          </span>
        </div>

        <button
          class="btn btn-danger"
          on:click={closeSession}
          disabled={isClosingSession}
        >
          {#if isClosingSession}
            Closing Session...
          {:else}
            Close Session
          {/if}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .session-controller {
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

  .subtitle {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #374151;
  }

  .config-section {
    padding: 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .config-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    grid-column: 1 / -1;
  }

  .input {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
    background: white;
    transition: border-color 0.2s;
  }

  .input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 1px #3b82f6;
  }

  .input:disabled {
    background: #f3f4f6;
    color: #6b7280;
    cursor: not-allowed;
  }

  .checkbox {
    width: 16px;
    height: 16px;
    accent-color: #3b82f6;
  }

  .checkbox:disabled {
    cursor: not-allowed;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .btn {
    padding: 8px 16px;
    border: 1px solid;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
    text-align: center;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-large {
    padding: 12px 24px;
    font-size: 1rem;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
    border-color: #2563eb;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
    border-color: #ef4444;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
    border-color: #dc2626;
  }

  .session-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: #f0f9ff;
    border: 1px solid #7dd3fc;
    border-radius: 8px;
  }

  .session-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #0369a1;
  }

  .status-id {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', monospace;
    font-size: 0.75rem;
    background: white;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #bae6fd;
    color: #0369a1;
  }

  .connection-status {
    font-size: 1rem;
    margin-left: auto;
  }

  .connection-status.connected {
    color: #10b981;
  }

  .connection-status.disconnected {
    color: #ef4444;
  }
</style>
