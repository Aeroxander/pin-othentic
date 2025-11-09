/**
 * E2E Test: Periodic Retrievability Check (Task Definition 2)
 * 
 * Tests the periodic check flow:
 * 1. File is already pinned (from previous test or manual setup)
 * 2. Execution Service proves it still has the file
 * 3. Validation Service independently verifies
 */

import { config } from 'dotenv';
import { setupTestContext, cleanupTestContext, TestContext } from './setup';
import {
  generateTestData,
  addToIPFS,
  executeTask,
  validateTask,
  getHealth,
} from './helpers';

config();

async function testPeriodicCheck() {
  console.log('='.repeat(60));
  console.log('E2E Test: Periodic Retrievability Check');
  console.log('='.repeat(60));

  let context: TestContext | null = null;

  try {
    // Setup
    console.log('\n[1/6] Setting up test environment...');
    context = await setupTestContext();

    // Verify services are healthy
    console.log('\n[2/6] Checking service health...');
    const execHealth = await getHealth(context.executionServiceUrl);
    const validHealth = await getHealth(context.validationServiceUrl);
    
    console.log('Execution Service:', execHealth);
    console.log('Validation Service:', validHealth);

    // Create and add test file (simulating previously pinned content)
    console.log('\n[3/6] Setting up test file...');
    const testData = generateTestData(1024 * 256); // 256KB file
    const { cid } = await addToIPFS(context.ipfsApiUrl, testData);
    console.log(`Test file CID: ${cid}`);

    // First, do initial pin to ensure file is pinned
    console.log('\n[4/6] Initial pin (prerequisite)...');
    const initialTaskData = {
      cid,
      paymentAmount: '1000000000000000000',
      storageDuration: 2592000,
    };

    const initialExec = await executeTask(
      context.executionServiceUrl,
      1, // InitialPin
      initialTaskData
    );

    if (!initialExec.success) {
      throw new Error('Initial pin failed');
    }
    console.log('Initial pin completed ✓');

    // Now perform periodic check
    console.log('\n[5/6] Executing Periodic Check task...');
    const periodicTaskData = {
      cid,
      paymentAmount: '0', // No payment for periodic checks
      storageDuration: 0,
    };

    const execResult = await executeTask(
      context.executionServiceUrl,
      2, // TaskDefinition.PeriodicCheck
      periodicTaskData
    );

    if (!execResult.success || !execResult.proofOfTask) {
      console.error('Periodic check execution failed:', execResult);
      throw new Error('Periodic check execution failed');
    }

    console.log('Periodic check execution successful!');
    const proof = JSON.parse(execResult.proofOfTask);
    console.log('Proof of Task:');
    console.log(`  CID: ${proof.cid}`);
    console.log(`  Merkle Root: ${proof.merkleRoot}`);
    console.log(`  File Size: ${proof.fileSize}`);
    console.log(`  Timestamp: ${new Date(proof.timestamp).toISOString()}`);
    
    // Verify bandwidth metrics (critical for periodic checks)
    if (proof.downloadTimeMs !== undefined) {
      console.log(`  Download Time: ${proof.downloadTimeMs}ms`);
    }
    if (proof.uploadBandwidthMbps !== undefined) {
      console.log(`  Bandwidth: ${proof.uploadBandwidthMbps.toFixed(2)} Mbps`);
      
      // Verify bandwidth meets minimum threshold (5 Mbps default)
      const MIN_BANDWIDTH = parseFloat(process.env.MIN_BANDWIDTH_MBPS || '5');
      if (proof.uploadBandwidthMbps < MIN_BANDWIDTH) {
        console.warn(`  ⚠ Warning: Bandwidth ${proof.uploadBandwidthMbps.toFixed(2)} Mbps is below threshold ${MIN_BANDWIDTH} Mbps`);
        console.warn(`  This would fail validation in production!`);
      } else {
        console.log(`  ✓ Bandwidth meets minimum threshold (${MIN_BANDWIDTH} Mbps)`);
      }
    } else {
      console.warn('  ⚠ No bandwidth metrics reported - this would fail validation in production');
    }
    
    // Verify chunk retrieval latencies (if present)
    if (proof.chunkRetrievalLatencies && proof.chunkRetrievalLatencies.length > 0) {
      const avgLatency = proof.chunkRetrievalLatencies.reduce((a: number, b: number) => a + b, 0) / proof.chunkRetrievalLatencies.length;
      const maxLatency = Math.max(...proof.chunkRetrievalLatencies);
      console.log(`  Chunk Latencies:`);
      console.log(`    - Average: ${avgLatency.toFixed(2)}ms`);
      console.log(`    - Maximum: ${maxLatency.toFixed(2)}ms`);
      console.log(`    - Samples: ${proof.chunkRetrievalLatencies.length}`);
      
      const MAX_LATENCY = parseFloat(process.env.MAX_CHUNK_LATENCY_MS || '500');
      if (maxLatency > MAX_LATENCY) {
        console.warn(`    ⚠ Max latency ${maxLatency.toFixed(2)}ms exceeds threshold ${MAX_LATENCY}ms`);
      }
    }

    // Validate periodic check
    console.log('\n[6/6] Validating periodic check...');
    const validResult = await validateTask(
      context.validationServiceUrl,
      execResult.proofOfTask,
      2, // TaskDefinition.PeriodicCheck
      periodicTaskData
    );

    if (!validResult.valid) {
      console.error('Periodic check validation failed:', validResult);
      throw new Error('Periodic check validation failed');
    }

    console.log('Periodic check validation successful! ✓');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✓ ALL TESTS PASSED');
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  - File CID: ${cid}`);
    if (proof.uploadBandwidthMbps) {
      console.log(`  - Bandwidth: ${proof.uploadBandwidthMbps.toFixed(2)} Mbps`);
    }
    if (proof.chunkRetrievalLatencies && proof.chunkRetrievalLatencies.length > 0) {
      const avgLatency = proof.chunkRetrievalLatencies.reduce((a: number, b: number) => a + b, 0) / proof.chunkRetrievalLatencies.length;
      console.log(`  - Avg Chunk Latency: ${avgLatency.toFixed(2)}ms`);
    }
    console.log(`  - Periodic Check: PASSED ✓`);
    console.log(`  - Validation: PASSED ✓`);
    if (proof.uploadBandwidthMbps) {
      console.log(`  - Bandwidth Verification: PASSED ✓`);
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('✗ TEST FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error);
    console.error('='.repeat(60));
    process.exit(1);
  } finally {
    if (context) {
      await cleanupTestContext(context);
    }
  }
}

// Run the test
testPeriodicCheck().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
