import fetch from 'node-fetch';

export interface IPFSConfig {
  apiUrl: string;
}

/**
 * IPFS API client for Kubo HTTP API
 */
export class IPFSClient {
  private apiUrl: string;

  constructor(config: IPFSConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Add data to IPFS
   */
  async add(data: Buffer | Uint8Array | string): Promise<{ cid: string; size: number }> {
    const formData = new FormData();
    const blob = typeof data === 'string' 
      ? new Blob([data], { type: 'text/plain' })
      : new Blob([data], { type: 'application/octet-stream' });
    
    formData.append('file', blob);

    const response = await fetch(`${this.apiUrl}/api/v0/add`, {
      method: 'POST',
      body: formData as any,
    });

    if (!response.ok) {
      throw new Error(`IPFS add failed: ${response.statusText}`);
    }

    const result = await response.json() as { Hash: string; Size: string };
    return {
      cid: result.Hash,
      size: parseInt(result.Size, 10),
    };
  }

  /**
   * Get data from IPFS by CID (raw content)
   */
  async get(cid: string): Promise<Buffer> {
    const response = await fetch(`${this.apiUrl}/api/v0/cat?arg=${cid}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`IPFS cat failed: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Get data from IPFS with timing information (for bandwidth measurement)
   */
  async getWithTiming(cid: string): Promise<{ data: Buffer; downloadTimeMs: number }> {
    const startTime = Date.now();
    const data = await this.get(cid);
    const downloadTimeMs = Date.now() - startTime;
    return { data, downloadTimeMs };
  }

  /**
   * Calculate bandwidth in Mbps from bytes and milliseconds
   */
  static calculateBandwidthMbps(bytes: number, milliseconds: number): number {
    if (milliseconds === 0) return 0;
    const megabits = (bytes * 8) / 1_000_000;
    const seconds = milliseconds / 1000;
    return megabits / seconds;
  }

  /**
   * Get IPFS bandwidth stats from Kubo
   */
  async getBandwidthStats(): Promise<{ totalIn: number; totalOut: number; rateIn: number; rateOut: number }> {
    const response = await fetch(`${this.apiUrl}/api/v0/stats/bw`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`IPFS stats/bw failed: ${response.statusText}`);
    }

    const result = await response.json() as {
      TotalIn: number;
      TotalOut: number;
      RateIn: number;
      RateOut: number;
    };

    return {
      totalIn: result.TotalIn,
      totalOut: result.TotalOut,
      rateIn: result.RateIn,
      rateOut: result.RateOut,
    };
  }

  /**
   * Pin CID to ensure persistence
   */
  async pin(cid: string): Promise<{ pins: string[] }> {
    const response = await fetch(`${this.apiUrl}/api/v0/pin/add?arg=${cid}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`IPFS pin failed: ${response.statusText}`);
    }

    const result = await response.json() as { Pins: string[] };
    return { pins: result.Pins };
  }

  /**
   * Unpin CID
   */
  async unpin(cid: string): Promise<{ pins: string[] }> {
    const response = await fetch(`${this.apiUrl}/api/v0/pin/rm?arg=${cid}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`IPFS unpin failed: ${response.statusText}`);
    }

    const result = await response.json() as { Pins: string[] };
    return { pins: result.Pins };
  }

  /**
   * List all pinned CIDs
   */
  async listPins(): Promise<{ cids: string[] }> {
    const response = await fetch(`${this.apiUrl}/api/v0/pin/ls`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`IPFS pin ls failed: ${response.statusText}`);
    }

    const result = await response.json() as { Keys: Record<string, { Type: string }> };
    const cids = Object.keys(result.Keys);
    return { cids };
  }

  /**
   * Get IPFS node ID and peer info
   */
  async id(): Promise<{ id: string; addresses: string[] }> {
    const response = await fetch(`${this.apiUrl}/api/v0/id`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`IPFS id failed: ${response.statusText}`);
    }

    const result = await response.json() as { 
      ID: string; 
      Addresses: string[] 
    };
    
    return {
      id: result.ID,
      addresses: result.Addresses,
    };
  }

  /**
   * Check if IPFS daemon is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.id();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Connect to a peer
   */
  async swarmConnect(multiaddr: string): Promise<void> {
    const response = await fetch(
      `${this.apiUrl}/api/v0/swarm/connect?arg=${encodeURIComponent(multiaddr)}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error(`IPFS swarm connect failed: ${response.statusText}`);
    }
  }

  /**
   * Get file stats (size, hash, etc.)
   */
  async stat(cid: string): Promise<{ size: number; cumulativeSize: number; blocks: number }> {
    const response = await fetch(`${this.apiUrl}/api/v0/files/stat?arg=/ipfs/${cid}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`IPFS stat failed: ${response.statusText}`);
    }

    const result = await response.json() as {
      Size: number;
      CumulativeSize: number;
      Blocks: number;
    };

    return {
      size: result.Size,
      cumulativeSize: result.CumulativeSize,
      blocks: result.Blocks,
    };
  }
}
