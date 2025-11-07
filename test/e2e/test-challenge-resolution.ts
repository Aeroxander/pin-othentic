/**
 * E2E Test: Challenge Resolution (Task Definition 3)
 * 
 * Tests the challenge resolution flow:
 * 1. File is pinned
 * 2. Challenge is issued
 * 3. Execution Service provides proof
 * 4. Validation Service verifies the proof
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

async function testChallengeResolution() {
  console.log('='.repeat(60));
  console.log('E2E Test: Challenge Resolution');
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

    // Create and add test file
    console.log('\n[3/6] Setting up test file...');
    const testData = generateTestData(1024 * 128); // 128KB file
    const { cid } = await addToIPFS(context.ipfsApiUrl, testData);
    console.log(`Test file CID: ${cid}`);

    // First, do initial pin
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

    // Execute challenge resolution
    console.log('\n[5/6] Executing Challenge Resolution task...');
    const challengeTaskData = {
      cid,
      paymentAmount: '0',
      storageDuration: 0,
    };

    const execResult = await executeTask(
      context.executionServiceUrl,
      3, // TaskDefinition.ChallengeResolution
      challengeTaskData
    );

    if (!execResult.success || !execResult.proofOfTask) {
      console.error('Challenge resolution execution failed:', execResult);
      throw new Error('Challenge resolution execution failed');
    }

    console.log('Challenge resolution execution successful!');
    const proof = JSON.parse(execResult.proofOfTask);
    console.log('Proof of Task:');
    console.log(`  CID: ${proof.cid}`);
    console.log(`  Merkle Root: ${proof.merkleRoot}`);
    console.log(`  File Size: ${proof.fileSize}`);
    console.log(`  Timestamp: ${new Date(proof.timestamp).toISOString()}`);

    // Validate challenge resolution
    console.log('\n[6/6] Validating challenge resolution...');
    const validResult = await validateTask(
      context.validationServiceUrl,
      execResult.proofOfTask,
      3, // TaskDefinition.ChallengeResolution
      challengeTaskData
    );

    if (!validResult.valid) {
      console.error('Challenge resolution validation failed:', validResult);
      throw new Error('Challenge resolution validation failed');
    }

    console.log('Challenge resolution validation successful! ✓');
    console.log('Challenge refuted - operator has valid data ✓');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✓ ALL TESTS PASSED');
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  - File CID: ${cid}`);
    console.log(`  - Challenge Resolution: PASSED ✓`);
    console.log(`  - Validation: PASSED ✓`);
    console.log(`  - Operator proved data availability ✓`);
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
testChallengeResolution().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
