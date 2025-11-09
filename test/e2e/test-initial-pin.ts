/**
 * E2E Test: Initial Pin & Verification (Task Definition 1)
 * 
 * Tests the complete flow:
 * 1. User adds file to IPFS
 * 2. Execution Service pins and generates proof
 * 3. Validation Service independently verifies
 */

import { config } from 'dotenv';
import { setupTestContext, cleanupTestContext, TestContext } from './setup';
import {
  generateTestData,
  addToIPFS,
  getFromIPFS,
  executeTask,
  validateTask,
  isPinned,
  getHealth,
} from './helpers';

config();

async function testInitialPin() {
  console.log('='.repeat(60));
  console.log('E2E Test: Initial Pin & Verification');
  console.log('='.repeat(60));

  let context: TestContext | null = null;

  try {
    // Setup
    console.log('\n[1/7] Setting up test environment...');
    context = await setupTestContext();

    // Verify services are healthy
    console.log('\n[2/7] Checking service health...');
    const execHealth = await getHealth(context.executionServiceUrl);
    const validHealth = await getHealth(context.validationServiceUrl);
    
    console.log('Execution Service:', execHealth);
    console.log('Validation Service:', validHealth);

    if (!execHealth.ipfs?.available || !validHealth.ipfs?.available) {
      throw new Error('IPFS not available on services');
    }

    // Create test data
    console.log('\n[3/7] Creating test data...');
    const testData = generateTestData(1024 * 512); // 512KB file
    console.log(`Generated ${testData.length} bytes of test data`);

    // Add to IPFS
    console.log('\n[4/7] Adding file to IPFS...');
    const { cid, size } = await addToIPFS(context.ipfsApiUrl, testData);
    console.log(`File added to IPFS:`);
    console.log(`  CID: ${cid}`);
    console.log(`  Size: ${size} bytes`);

    // Execute Initial Pin task
    console.log('\n[5/7] Executing Initial Pin task...');
    const taskData = {
      cid,
      paymentAmount: '1000000000000000000', // 1 ETH in wei
      storageDuration: 2592000, // 30 days in seconds
    };

    const execResult = await executeTask(
      context.executionServiceUrl,
      1, // TaskDefinition.InitialPin
      taskData
    );

    if (!execResult.success || !execResult.proofOfTask) {
      console.error('Execution failed:', execResult);
      throw new Error('Task execution failed');
    }

    console.log('Execution successful!');
    const proof = JSON.parse(execResult.proofOfTask);
    console.log('Proof of Task:');
    console.log(`  CID: ${proof.cid}`);
    console.log(`  Merkle Root: ${proof.merkleRoot}`);
    console.log(`  Chunk Count: ${proof.chunkCount}`);
    console.log(`  File Size: ${proof.fileSize}`);
    console.log(`  IPFS Peer ID: ${proof.ipfsPeerId}`);
    
    // Verify bandwidth metrics are present
    if (proof.downloadTimeMs !== undefined) {
      console.log(`  Download Time: ${proof.downloadTimeMs}ms`);
    }
    if (proof.uploadBandwidthMbps !== undefined) {
      console.log(`  Bandwidth: ${proof.uploadBandwidthMbps.toFixed(2)} Mbps`);
      
      // Verify bandwidth is reasonable (should be > 0 for any file)
      if (proof.uploadBandwidthMbps <= 0) {
        throw new Error('Bandwidth metric is invalid (≤0)');
      }
    } else {
      console.warn('  ⚠ No bandwidth metrics reported');
    }

    // Verify file is pinned on execution service
    const pinnedOnExec = await isPinned(context.ipfsApiUrl, cid);
    console.log(`  Pinned on Execution Service: ${pinnedOnExec}`);

    // Validate task
    console.log('\n[6/7] Validating task with Validation Service...');
    const validResult = await validateTask(
      context.validationServiceUrl,
      execResult.proofOfTask,
      1, // TaskDefinition.InitialPin
      taskData
    );

    if (!validResult.valid) {
      console.error('Validation failed:', validResult);
      throw new Error('Task validation failed');
    }

    console.log('Validation successful! ✓');

    // Verify file is pinned on validation service too
    const pinnedOnValid = await isPinned(context.ipfsApiUrl, cid);
    console.log(`  Pinned on Validation Service: ${pinnedOnValid}`);

    // Verify we can retrieve the file
    console.log('\n[7/7] Verifying file retrieval...');
    const retrievedData = await getFromIPFS(context.ipfsApiUrl, cid);
    
    if (Buffer.compare(testData, retrievedData) !== 0) {
      throw new Error('Retrieved data does not match original data');
    }

    console.log(`File retrieved successfully! ${retrievedData.length} bytes`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✓ ALL TESTS PASSED');
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  - File CID: ${cid}`);
    console.log(`  - File Size: ${size} bytes`);
    console.log(`  - Merkle Root: ${proof.merkleRoot}`);
    console.log(`  - Chunks: ${proof.chunkCount}`);
    if (proof.downloadTimeMs) {
      console.log(`  - Download Time: ${proof.downloadTimeMs}ms`);
    }
    if (proof.uploadBandwidthMbps) {
      console.log(`  - Bandwidth: ${proof.uploadBandwidthMbps.toFixed(2)} Mbps`);
    }
    console.log(`  - Execution: PASSED ✓`);
    console.log(`  - Validation: PASSED ✓`);
    console.log(`  - Retrieval: PASSED ✓`);
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
    // Cleanup
    if (context) {
      await cleanupTestContext(context);
    }
  }
}

// Run the test
testInitialPin().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
