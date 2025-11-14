import express, { Request, Response } from 'express';
import { config } from 'dotenv';
import { Wallet } from 'ethers';
import { 
  IPFSClient, 
  generateMerkleRoot, 
  TaskExecutionRequest, 
  TaskExecutionResponse,
  ProofOfTask,
  TaskDefinition,
  DEFAULT_CHUNK_SIZE
} from '@pinception/shared';

config();

const app = express();
app.use(express.json());

// Configuration
const KUBO_API_URL = process.env.KUBO_API_URL || 'http://localhost:5001';
const PORT = parseInt(process.env.EXECUTION_SERVICE_PORT || '4003', 10);
const OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY!;
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || String(DEFAULT_CHUNK_SIZE), 10);

if (!OPERATOR_PRIVATE_KEY) {
  throw new Error('OPERATOR_PRIVATE_KEY is required');
}

// Initialize services
const ipfsClient = new IPFSClient({ apiUrl: KUBO_API_URL });
const wallet = new Wallet(OPERATOR_PRIVATE_KEY);

// Get operator's public key for Merkle tree generation
const operatorPublicKey = wallet.address;

/**
 * Health check endpoint
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const ipfsAvailable = await ipfsClient.isAvailable();
    const ipfsId = ipfsAvailable ? await ipfsClient.id() : null;
    
    res.json({
      status: 'healthy',
      ipfs: {
        available: ipfsAvailable,
        peerId: ipfsId?.id,
      },
      operator: {
        address: operatorPublicKey,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Execute task endpoint - called by Othentic network
 */
app.post('/task/execute', async (req: Request<{}, {}, TaskExecutionRequest>, res: Response<TaskExecutionResponse>) => {
  try {
    const { taskDefinitionId, data } = req.body;

    console.log(`[Execution Service] Received task ${taskDefinitionId} for CID: ${data.cid}`);

    // Verify IPFS is available
    if (!await ipfsClient.isAvailable()) {
      throw new Error('IPFS daemon is not available');
    }

    let proofOfTask: ProofOfTask;

    switch (taskDefinitionId) {
      case TaskDefinition.InitialPin:
        proofOfTask = await executeInitialPin(data.cid);
        break;
      
      case TaskDefinition.PeriodicCheck:
        proofOfTask = await executePeriodicCheck(data.cid);
        break;
      
      case TaskDefinition.ChallengeResolution:
        proofOfTask = await executeChallengeResolution(data.cid);
        break;
      
      default:
        throw new Error(`Unknown task definition: ${taskDefinitionId}`);
    }

    console.log(`[Execution Service] Task ${taskDefinitionId} completed successfully`);
    console.log(`[Execution Service] Merkle Root: ${proofOfTask.merkleRoot}`);

    res.json({
      success: true,
      proofOfTask: JSON.stringify(proofOfTask),
    });

  } catch (error) {
    console.error('[Execution Service] Task execution failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Execute Initial Pin & Verification task
 */
async function executeInitialPin(cid: string): Promise<ProofOfTask> {
  console.log(`[Initial Pin] Retrieving file from IPFS: ${cid}`);
  
  // 1. Retrieve file from IPFS
  const fileData = await ipfsClient.get(cid);
  console.log(`[Initial Pin] Retrieved ${fileData.length} bytes`);
  
  // 2. Generate Merkle root with operator's key
  const merkleRoot = generateMerkleRoot(fileData, operatorPublicKey, CHUNK_SIZE);
  console.log(`[Initial Pin] Generated Merkle root: ${merkleRoot}`);
  
  // 3. Pin locally
  await ipfsClient.pin(cid);
  console.log(`[Initial Pin] Pinned CID locally`);
  
  // 4. Get IPFS peer ID
  const ipfsId = await ipfsClient.id();
  
  // 5. Calculate chunk count
  const chunkCount = Math.ceil(fileData.length / CHUNK_SIZE);
  
  return {
    cid,
    merkleRoot,
    chunkCount,
    fileSize: fileData.length,
    timestamp: Date.now(),
    ipfsPeerId: ipfsId.id,
  };
}

/**
 * Execute Periodic Retrievability Check task
 */
async function executePeriodicCheck(cid: string): Promise<ProofOfTask> {
  console.log(`[Periodic Check] Verifying storage of: ${cid}`);
  
  // 1. Verify file is still pinned
  const pins = await ipfsClient.listPins();
  if (!pins.cids.includes(cid)) {
    throw new Error(`CID ${cid} is not pinned locally`);
  }
  
  // 2. Retrieve file to prove we still have it
  const fileData = await ipfsClient.get(cid);
  console.log(`[Periodic Check] Verified ${fileData.length} bytes`);
  
  // 3. Regenerate Merkle root to prove integrity
  const merkleRoot = generateMerkleRoot(fileData, operatorPublicKey, CHUNK_SIZE);
  console.log(`[Periodic Check] Regenerated Merkle root: ${merkleRoot}`);
  
  // 4. Get IPFS peer ID
  const ipfsId = await ipfsClient.id();
  
  const chunkCount = Math.ceil(fileData.length / CHUNK_SIZE);
  
  return {
    cid,
    merkleRoot,
    chunkCount,
    fileSize: fileData.length,
    timestamp: Date.now(),
    ipfsPeerId: ipfsId.id,
  };
}

/**
 * Execute Challenge Resolution task
 */
async function executeChallengeResolution(cid: string): Promise<ProofOfTask> {
  console.log(`[Challenge Resolution] Responding to challenge for: ${cid}`);
  
  // 1. Verify file is pinned
  const pins = await ipfsClient.listPins();
  if (!pins.cids.includes(cid)) {
    throw new Error(`CID ${cid} is not available - challenge is valid`);
  }
  
  // 2. Retrieve file and generate proof
  const fileData = await ipfsClient.get(cid);
  console.log(`[Challenge Resolution] Retrieved ${fileData.length} bytes`);
  
  // 3. Generate Merkle root with full proof capability
  const merkleRoot = generateMerkleRoot(fileData, operatorPublicKey, CHUNK_SIZE);
  console.log(`[Challenge Resolution] Generated Merkle root: ${merkleRoot}`);
  
  // 4. Get IPFS peer ID
  const ipfsId = await ipfsClient.id();
  
  const chunkCount = Math.ceil(fileData.length / CHUNK_SIZE);
  
  return {
    cid,
    merkleRoot,
    chunkCount,
    fileSize: fileData.length,
    timestamp: Date.now(),
    ipfsPeerId: ipfsId.id,
  };
}

/**
 * Start the service
 */
async function start() {
  try {
    // Verify IPFS connection
    const ipfsAvailable = await ipfsClient.isAvailable();
    if (!ipfsAvailable) {
      throw new Error('Cannot connect to IPFS daemon. Is Kubo running?');
    }

    const ipfsId = await ipfsClient.id();
    console.log(`[Execution Service] Connected to IPFS node: ${ipfsId.id}`);
    console.log(`[Execution Service] Operator address: ${operatorPublicKey}`);
    
    app.listen(PORT, () => {
      console.log(`[Execution Service] Listening on port ${PORT}`);
      console.log(`[Execution Service] Health check: http://localhost:${PORT}/health`);
      console.log(`[Execution Service] Task execution: http://localhost:${PORT}/task/execute`);
    });
  } catch (error) {
    console.error('[Execution Service] Startup failed:', error);
    process.exit(1);
  }
}

start();
