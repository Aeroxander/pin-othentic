/**
 * E2E Test Setup
 * Sets up local test environment with IPFS and services
 */

import { spawn, ChildProcess } from 'child_process';
import fetch from 'node-fetch';
import { config } from 'dotenv';

config();

export interface TestContext {
  ipfsProcess?: ChildProcess;
  executionProcess?: ChildProcess;
  validationProcess?: ChildProcess;
  ipfsApiUrl: string;
  executionServiceUrl: string;
  validationServiceUrl: string;
}

/**
 * Wait for a service to be ready
 */
export async function waitForService(
  url: string, 
  timeout: number = 30000,
  interval: number = 1000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Service not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Service at ${url} did not become ready within ${timeout}ms`);
}

/**
 * Wait for IPFS to be ready
 */
export async function waitForIPFS(apiUrl: string, timeout: number = 30000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${apiUrl}/api/v0/id`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json() as { ID: string };
        console.log(`IPFS ready with peer ID: ${data.ID}`);
        return;
      }
    } catch (error) {
      // IPFS not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`IPFS at ${apiUrl} did not become ready within ${timeout}ms`);
}

/**
 * Setup test context
 * Note: This assumes IPFS and services are running via docker-compose
 */
export async function setupTestContext(): Promise<TestContext> {
  const ipfsApiUrl = process.env.KUBO_API_URL || 'http://localhost:5001';
  const executionServiceUrl = `http://localhost:${process.env.EXECUTION_SERVICE_PORT || 4003}`;
  const validationServiceUrl = `http://localhost:${process.env.VALIDATION_SERVICE_PORT || 4004}`;
  
  console.log('Waiting for services to be ready...');
  
  // Wait for IPFS
  console.log('Checking IPFS...');
  await waitForIPFS(ipfsApiUrl);
  
  // Wait for Execution Service
  console.log('Checking Execution Service...');
  await waitForService(`${executionServiceUrl}/health`);
  
  // Wait for Validation Service
  console.log('Checking Validation Service...');
  await waitForService(`${validationServiceUrl}/health`);
  
  console.log('All services ready!');
  
  return {
    ipfsApiUrl,
    executionServiceUrl,
    validationServiceUrl,
  };
}

/**
 * Cleanup test context
 */
export async function cleanupTestContext(context: TestContext): Promise<void> {
  // Services are managed by docker-compose, so no cleanup needed
  console.log('Test context cleaned up');
}
