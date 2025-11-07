/**
 * E2E Test Helpers
 * Utility functions for testing IPFS pinning service
 */

import fetch from 'node-fetch';
import { randomBytes } from 'crypto';

/**
 * Generate random test data
 */
export function generateTestData(sizeInBytes: number): Buffer {
  return randomBytes(sizeInBytes);
}

/**
 * Add file to IPFS
 */
export async function addToIPFS(
  apiUrl: string, 
  data: Buffer | string
): Promise<{ cid: string; size: number }> {
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;
  
  // Use multipart/form-data format manually for node-fetch
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="test.bin"\r\n`),
    Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch(`${apiUrl}/api/v0/add`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IPFS add failed: ${response.statusText} - ${text}`);
  }

  const result = await response.json() as { Hash: string; Size: string };
  return {
    cid: result.Hash,
    size: parseInt(result.Size, 10),
  };
}

/**
 * Get file from IPFS
 */
export async function getFromIPFS(apiUrl: string, cid: string): Promise<Buffer> {
  const response = await fetch(`${apiUrl}/api/v0/cat?arg=${cid}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`IPFS get failed: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Execute a task on the Execution Service
 */
export async function executeTask(
  serviceUrl: string,
  taskDefinitionId: number,
  data: { cid: string; paymentAmount: string; storageDuration: number }
): Promise<{ success: boolean; proofOfTask?: string; error?: string }> {
  const response = await fetch(`${serviceUrl}/task/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskDefinitionId, data }),
  });

  const result = await response.json();
  return result as { success: boolean; proofOfTask?: string; error?: string };
}

/**
 * Validate a task on the Validation Service
 */
export async function validateTask(
  serviceUrl: string,
  proofOfTask: string,
  taskDefinitionId: number,
  data: { cid: string; paymentAmount: string; storageDuration: number }
): Promise<{ valid: boolean; error?: string }> {
  const response = await fetch(`${serviceUrl}/task/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proofOfTask, taskDefinitionId, data }),
  });

  const result = await response.json();
  return result as { valid: boolean; error?: string };
}

/**
 * Check if a CID is pinned on IPFS
 */
export async function isPinned(apiUrl: string, cid: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/api/v0/pin/ls?arg=${cid}`, {
      method: 'POST',
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json() as { Keys: Record<string, any> };
    return cid in result.Keys;
  } catch {
    return false;
  }
}

/**
 * Get service health status
 */
export async function getHealth(serviceUrl: string): Promise<any> {
  const response = await fetch(`${serviceUrl}/health`);
  
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }
  
  return await response.json();
}
