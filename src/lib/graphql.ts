import { get } from 'svelte/store';
import { serverUrl } from './stores.js';

export interface SessionConfig {
  chunkSize: number;
  overlap: number;
  loopEnable: boolean;
}

export interface SessionStatus {
  sessionId: string;
  imageCount: number;
  chunksProcessed: number;
  isActive: boolean;
  hasLoops: boolean;
}

export interface ChunkInfo {
  chunkId: string;
  startFrame: number;
  endFrame: number;
  isAligned: boolean;
  hasGaussianData: boolean;
}

class GraphQLClient {
  private getGraphQLUrl(): string {
    return `${get(serverUrl)}/graphql`;
  }

  private async makeRequest(query: string, variables?: any): Promise<any> {
    const response = await fetch(this.getGraphQLUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: variables || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'GraphQL error');
    }

    return result.data;
  }

  async createSession(config: SessionConfig): Promise<string> {
    const mutation = `
      mutation CreateSession($config: SessionConfig) {
        createSession(config: $config)
      }
    `;

    const variables = {
      config: {
        chunkSize: config.chunkSize,
        overlap: config.overlap,
        loopEnable: config.loopEnable,
      },
    };

    const data = await this.makeRequest(mutation, variables);
    return data.createSession;
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const mutation = `
      mutation CloseSession($sessionId: String!) {
        closeSession(sessionId: $sessionId)
      }
    `;

    const data = await this.makeRequest(mutation, { sessionId });
    return data.closeSession;
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus | null> {
    const query = `
      query GetSessionStatus($sessionId: String!) {
        getSessionStatus(sessionId: $sessionId) {
          sessionId
          imageCount
          chunksProcessed
          isActive
          hasLoops
        }
      }
    `;

    const data = await this.makeRequest(query, { sessionId });
    return data.getSessionStatus;
  }

  async getChunksInfo(sessionId: string): Promise<ChunkInfo[]> {
    const query = `
      query GetChunks($sessionId: String!) {
        getChunks(sessionId: $sessionId) {
          chunkId
          startFrame
          endFrame
          isAligned
          hasGaussianData
        }
      }
    `;

    const data = await this.makeRequest(query, { sessionId });
    return data.getChunks || [];
  }
}

export const graphqlClient = new GraphQLClient();
