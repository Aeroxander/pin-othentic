import express, { Request, Response } from 'express';
import { config } from 'dotenv';
import { 
  IPFSClient, 
  verifyFileMerkleRoot,
  TaskValidationRequest, 
  TaskValidationResponse,
  ProofOfTask,
  TaskDefinition,
  DEFAULT_CHUNK_SIZE
} from '@pinception/shared';

config();

const app = express();
app.use(express.json());

// Configuration
const KUBO_API_URL = process.env.KUBO_API_URL || 'http://localhost:5001';
const PORT = parseInt(process.env.VALIDATION_SERVICE_PORT || '4004', 10);
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || String(DEFAULT_CHUNK_SIZE), 10);

// Initialize IPFS client
const ipfsClient = new IPFSClient({ apiUrl: KUBO_API_URL });

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
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Validate task endpoint - called by Othentic network
 */
app.post('/task/validate', async (req: Request<{}, {}, TaskValidationRequest>, res: Response<TaskValidationResponse>) => {
  try {
    const { proofOfTask, taskDefinitionId, data } = req.body;

    console.log(`[Validation Service] Received validation request for task ${taskDefinitionId}`);

    // Parse Proof-of-Task
    const proof: ProofOfTask = JSON.parse(proofOfTask);
    console.log(`[Validation Service] Validating CID: ${proof.cid}`);

    // Verify IPFS is available
    if (!await ipfsClient.isAvailable()) {
      throw new Error('IPFS daemon is not available');
    }

    let isValid: boolean;

    switch (taskDefinitionId) {
      case TaskDefinition.InitialPin:
        isValid = await validateInitialPin(proof);
        break;
      
      case TaskDefinition.PeriodicCheck:
        isValid = await validatePeriodicCheck(proof);
        break;
      
      case TaskDefinition.ChallengeResolution:
        isValid = await validateChallengeResolution(proof);
        break;
      
      default:
        throw new Error(`Unknown task definition: ${taskDefinitionId}`);
    }

    console.log(`[Validation Service] Validation result: ${isValid ? 'VALID' : 'INVALID'}`);

    res.json({
      valid: isValid,
    });

  } catch (error) {
    console.error('[Validation Service] Validation failed:', error);
    res.status(500).json({
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Validate Initial Pin & Verification task
 */
async function validateInitialPin(proof: ProofOfTask): Promise<boolean> {
  console.log(`[Initial Pin Validation] Validating: ${proof.cid}`);
  
  try {
    // 1. Independently retrieve file from IPFS
    const fileData = await ipfsClient.get(proof.cid);
    console.log(`[Initial Pin Validation] Retrieved ${fileData.length} bytes`);
    
    // 2. Verify file size matches proof
    if (fileData.length !== proof.fileSize) {
      console.warn(`[Initial Pin Validation] File size mismatch: expected ${proof.fileSize}, got ${fileData.length}`);
      return false;
    }
    
    // 3. Verify Merkle root using performer's public key
    // Note: In production, we'd retrieve the performer's public key from the proof or on-chain registry
    const performerPublicKey = extractPerformerPublicKey(proof);
    const isValid = verifyFileMerkleRoot(fileData, proof.merkleRoot, performerPublicKey, CHUNK_SIZE);
    
    if (!isValid) {
      console.warn(`[Initial Pin Validation] Merkle root mismatch`);
      return false;
    }
    
    console.log(`[Initial Pin Validation] Merkle root verified successfully`);
    
    // 4. Pin locally for redundancy
    await ipfsClient.pin(proof.cid);
    console.log(`[Initial Pin Validation] Pinned CID locally for redundancy`);
    
    return true;
    
  } catch (error) {
    console.error(`[Initial Pin Validation] Error:`, error);
    return false;
  }
}

/**
 * Validate Periodic Retrievability Check task
 */
async function validatePeriodicCheck(proof: ProofOfTask): Promise<boolean> {
  console.log(`[Periodic Check Validation] Validating: ${proof.cid}`);
  
  try {
    // 1. Try to retrieve file from IPFS network
    const fileData = await ipfsClient.get(proof.cid);
    console.log(`[Periodic Check Validation] Retrieved ${fileData.length} bytes`);
    
    // 2. Verify file size
    if (fileData.length !== proof.fileSize) {
      console.warn(`[Periodic Check Validation] File size mismatch`);
      return false;
    }
    
    // 3. Verify Merkle root to ensure data integrity
    const performerPublicKey = extractPerformerPublicKey(proof);
    const isValid = verifyFileMerkleRoot(fileData, proof.merkleRoot, performerPublicKey, CHUNK_SIZE);
    
    if (!isValid) {
      console.warn(`[Periodic Check Validation] Merkle root verification failed`);
      return false;
    }
    
    console.log(`[Periodic Check Validation] File is available and intact`);
    
    // 4. Try connecting to operator's IPFS peer to verify they're hosting
    try {
      const operatorMultiaddr = await resolveOperatorMultiaddr(proof.ipfsPeerId);
      await ipfsClient.swarmConnect(operatorMultiaddr);
      console.log(`[Periodic Check Validation] Successfully connected to operator's IPFS node`);
    } catch (error) {
      console.warn(`[Periodic Check Validation] Could not connect to operator's IPFS node:`, error);
      // Non-fatal: file is available even if we couldn't connect directly to operator
    }
    
    return true;
    
  } catch (error) {
    console.error(`[Periodic Check Validation] Error:`, error);
    return false;
  }
}

/**
 * Validate Challenge Resolution task
 */
async function validateChallengeResolution(proof: ProofOfTask): Promise<boolean> {
  console.log(`[Challenge Resolution Validation] Validating: ${proof.cid}`);
  
  try {
    // 1. Attempt to retrieve file
    const fileData = await ipfsClient.get(proof.cid);
    console.log(`[Challenge Resolution Validation] File retrieved: ${fileData.length} bytes`);
    
    // 2. Verify file size
    if (fileData.length !== proof.fileSize) {
      console.warn(`[Challenge Resolution Validation] File size mismatch - challenge may be valid`);
      return false;
    }
    
    // 3. Verify Merkle root with full proof
    const performerPublicKey = extractPerformerPublicKey(proof);
    const isValid = verifyFileMerkleRoot(fileData, proof.merkleRoot, performerPublicKey, CHUNK_SIZE);
    
    if (!isValid) {
      console.warn(`[Challenge Resolution Validation] Merkle proof invalid - challenge is valid`);
      return false;
    }
    
    console.log(`[Challenge Resolution Validation] Challenge refuted - operator has valid data`);
    
    // 4. Verify we can connect to operator's node
    // Note: In development/testing, this may not work due to network isolation
    // In production, this would verify the operator's node is actually online
    const skipNodeReachabilityCheck = process.env.SKIP_NODE_REACHABILITY_CHECK === 'true';
    
    if (!skipNodeReachabilityCheck) {
      try {
        const operatorMultiaddr = await resolveOperatorMultiaddr(proof.ipfsPeerId);
        await ipfsClient.swarmConnect(operatorMultiaddr);
        console.log(`[Challenge Resolution Validation] Confirmed operator's node is online`);
      } catch (error) {
        console.warn(`[Challenge Resolution Validation] Operator's node not reachable:`, error);
        // If data is valid but node is offline, this is important for challenges
        // In development, we may skip this check
        return false;
      }
    } else {
      console.log(`[Challenge Resolution Validation] Skipping node reachability check (development mode)`);
    }
    
    return true;
    
  } catch (error) {
    console.error(`[Challenge Resolution Validation] Operator failed to provide data - challenge is valid`);
    return false;
  }
}

/**
 * Extract performer's public key from proof
 * TODO: In production, this should query AvsGovernance contract for operator's registered public key
 */
function extractPerformerPublicKey(proof: ProofOfTask): string {
  // For development, we use a fixed operator address from the environment
  // In production, this should query the on-chain registry to get the performer's address
  const operatorAddress = process.env.OPERATOR_ADDRESS || '0xBA56383F07Cd882dfEAbc7D6068Fd5D3bE844b64';
  return operatorAddress;
}

/**
 * Resolve operator's IPFS multiaddr from peer ID
 * TODO: In production, query AvsGovernance for operator's registered multiaddr
 */
async function resolveOperatorMultiaddr(peerId: string): Promise<string> {
  // Placeholder: in production, query operator registry for their multiaddr
  // For now, assume localhost for development
  return `/ip4/127.0.0.1/tcp/4001/p2p/${peerId}`;
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
    console.log(`[Validation Service] Connected to IPFS node: ${ipfsId.id}`);
    
    app.listen(PORT, () => {
      console.log(`[Validation Service] Listening on port ${PORT}`);
      console.log(`[Validation Service] Health check: http://localhost:${PORT}/health`);
      console.log(`[Validation Service] Task validation: http://localhost:${PORT}/task/validate`);
    });
  } catch (error) {
    console.error('[Validation Service] Startup failed:', error);
    process.exit(1);
  }
}

start();
