import { keccak256, concat, toUtf8Bytes } from 'ethers';
import { MerkleTree } from 'merkletreejs';

/**
 * Default chunk size for file splitting (256KB)
 */
export const DEFAULT_CHUNK_SIZE = 256 * 1024;

/**
 * Split file buffer into fixed-size chunks
 */
export function chunkFile(data: Buffer | Uint8Array, chunkSize: number = DEFAULT_CHUNK_SIZE): Buffer[] {
  const buffer = Buffer.from(data);
  const chunks: Buffer[] = [];
  
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, buffer.length);
    chunks.push(buffer.slice(i, end));
  }
  
  return chunks;
}

/**
 * Hash a chunk with an operator's public key
 * Used for creating unique Merkle trees per operator
 */
export function hashChunkWithKey(chunk: Buffer, publicKey: string): string {
  const combined = concat([chunk, toUtf8Bytes(publicKey)]);
  return keccak256(combined);
}

/**
 * Build Merkle tree from hashed chunks
 */
export function buildMerkleTree(hashedChunks: string[]): MerkleTree {
  return new MerkleTree(
    hashedChunks,
    keccak256,
    { sortPairs: true }
  );
}

/**
 * Generate Merkle root for a file with operator's public key
 */
export function generateMerkleRoot(
  fileData: Buffer | Uint8Array,
  operatorPublicKey: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): string {
  const chunks = chunkFile(fileData, chunkSize);
  const hashedChunks = chunks.map(chunk => hashChunkWithKey(chunk, operatorPublicKey));
  const tree = buildMerkleTree(hashedChunks);
  return tree.getRoot().toString('hex');
}

/**
 * Generate Merkle proof for a specific chunk index
 */
export function generateMerkleProof(
  fileData: Buffer | Uint8Array,
  chunkIndex: number,
  operatorPublicKey: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): { proof: string[]; leaf: string } {
  const chunks = chunkFile(fileData, chunkSize);
  
  if (chunkIndex < 0 || chunkIndex >= chunks.length) {
    throw new Error(`Invalid chunk index: ${chunkIndex}. File has ${chunks.length} chunks.`);
  }
  
  const hashedChunks = chunks.map(chunk => hashChunkWithKey(chunk, operatorPublicKey));
  const tree = buildMerkleTree(hashedChunks);
  const leaf = hashedChunks[chunkIndex];
  const proof = tree.getProof(leaf).map(p => p.data.toString('hex'));
  
  return { proof, leaf };
}

/**
 * Verify a Merkle proof
 */
export function verifyMerkleProof(
  proof: string[],
  leaf: string,
  root: string
): boolean {
  const tree = new MerkleTree([], keccak256, { sortPairs: true });
  const proofBuffers = proof.map(p => Buffer.from(p, 'hex'));
  const leafBuffer = Buffer.from(leaf, 'hex');
  const rootBuffer = Buffer.from(root, 'hex');
  
  return tree.verify(proofBuffers, leafBuffer, rootBuffer);
}

/**
 * Verify file matches expected Merkle root
 */
export function verifyFileMerkleRoot(
  fileData: Buffer | Uint8Array,
  expectedRoot: string,
  operatorPublicKey: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): boolean {
  const calculatedRoot = generateMerkleRoot(fileData, operatorPublicKey, chunkSize);
  return calculatedRoot === expectedRoot;
}
