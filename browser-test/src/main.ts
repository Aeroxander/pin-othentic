import { createLibp2p, Libp2p } from 'libp2p';
import { webTransport } from '@libp2p/webtransport';
import { noise } from '@chainsafe/libp2p-noise';
import { createBitswap } from 'ipfs-bitswap';
import { MemoryBlockstore } from 'blockstore-core/memory';
import { CID } from 'multiformats/cid';

let libp2pNode: Libp2p | null = null;
let bitswap: any = null;

// Logging utilities
function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const logEl = document.getElementById('log')!;
  const timestamp = new Date().toLocaleTimeString();
  const className = type;
  logEl.innerHTML += `<span class="${className}">[${timestamp}] ${message}</span>\n`;
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[${timestamp}]`, message);
}

function clearLog() {
  document.getElementById('log')!.innerHTML = '';
}

function setStatus(status: 'connected' | 'disconnected' | 'connecting') {
  const statusEl = document.getElementById('status')!;
  statusEl.className = `status ${status}`;
  statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

function updateButtons(connected: boolean) {
  (document.getElementById('connectBtn') as HTMLButtonElement).disabled = connected;
  (document.getElementById('disconnectBtn') as HTMLButtonElement).disabled = !connected;
  (document.getElementById('fetchBtn') as HTMLButtonElement).disabled = !connected;
}

// Connect to Kubo operator via WebTransport
export async function connect() {
  try {
    clearLog();
    setStatus('connecting');
    log('Initializing libp2p with WebTransport...', 'info');

    const blockstore = new MemoryBlockstore();

    // Create libp2p node with WebTransport
    libp2pNode = await createLibp2p({
      transports: [webTransport()],
      connectionEncryption: [noise()],
      connectionGater: {
        // Allow local addresses for testing
        denyDialMultiaddr: async () => false
      }
    });

    await libp2pNode.start();
    log('✓ libp2p node started', 'success');
    log(`Peer ID: ${libp2pNode.peerId.toString()}`, 'info');

    // Create Bitswap instance
    bitswap = createBitswap(libp2pNode, blockstore);
    await bitswap.start();
    log('✓ Bitswap started', 'success');

    // Get operator multiaddr from input
    const multiaddr = (document.getElementById('operatorMultiaddr') as HTMLInputElement).value.trim();
    if (!multiaddr) {
      throw new Error('Please enter operator multiaddr');
    }

    log(`Connecting to operator: ${multiaddr}`, 'info');
    
    // Dial the operator
    const connection = await libp2pNode.dial(multiaddr);
    log(`✓ Connected to operator!`, 'success');
    log(`Remote peer: ${connection.remotePeer.toString()}`, 'info');
    log(`Protocols: ${connection.remoteAddr.toString()}`, 'info');

    setStatus('connected');
    updateButtons(true);

  } catch (error) {
    log(`✗ Connection failed: ${(error as Error).message}`, 'error');
    console.error(error);
    setStatus('disconnected');
    updateButtons(false);
  }
}

// Disconnect from operator
export async function disconnect() {
  try {
    log('Disconnecting...', 'info');

    if (bitswap) {
      await bitswap.stop();
      bitswap = null;
      log('✓ Bitswap stopped', 'success');
    }

    if (libp2pNode) {
      await libp2pNode.stop();
      libp2pNode = null;
      log('✓ libp2p node stopped', 'success');
    }

    setStatus('disconnected');
    updateButtons(false);

  } catch (error) {
    log(`✗ Disconnect error: ${(error as Error).message}`, 'error');
    console.error(error);
  }
}

// Fetch file from IPFS via Bitswap
export async function fetchFile() {
  if (!libp2pNode || !bitswap) {
    log('✗ Not connected to operator', 'error');
    return;
  }

  try {
    const cidString = (document.getElementById('cid') as HTMLInputElement).value.trim();
    if (!cidString) {
      throw new Error('Please enter a CID');
    }

    log(`Fetching CID: ${cidString}`, 'info');
    
    // Parse CID
    const cid = CID.parse(cidString);
    log(`✓ CID parsed: ${cid.toString()}`, 'success');

    // Fetch block via Bitswap
    log('Requesting block via Bitswap...', 'info');
    const startTime = Date.now();
    
    const block = await bitswap.get(cid);
    
    const duration = Date.now() - startTime;
    log(`✓ Block received in ${duration}ms!`, 'success');
    log(`Block size: ${block.bytes.length} bytes`, 'info');
    
    // Try to decode as UTF-8 text
    try {
      const text = new TextDecoder().decode(block.bytes);
      log(`Content preview: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`, 'info');
    } catch {
      log(`Content is binary data`, 'info');
    }

    // Show hex preview
    const hex = Array.from(block.bytes.slice(0, 32))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    log(`Hex preview: ${hex}${block.bytes.length > 32 ? '...' : ''}`, 'info');

    log(`✓ File successfully retrieved via WebTransport!`, 'success');

  } catch (error) {
    log(`✗ Fetch failed: ${(error as Error).message}`, 'error');
    console.error(error);
  }
}

// Make functions available globally for onclick handlers
(window as any).connect = connect;
(window as any).disconnect = disconnect;
(window as any).fetchFile = fetchFile;

// Initial log message
log('Browser WebTransport test initialized', 'info');
log('Ready to connect to Kubo operator', 'info');
