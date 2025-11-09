# Pinception - Othentic Framework

> Decentralized IPFS Pinning Service built on EigenLayer using the Othentic Stack

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

Pinception provides cryptoeconomically secured IPFS content persistence on EigenLayer, redesigned using the [Othentic Stack](https://docs.othentic.xyz/main) for **~70% code reduction** while maintaining full functionality.

**Key Features:**
- ✅ Decentralized IPFS pinning with Merkle proof verification
- ✅ Pre-built Othentic infrastructure (no custom contracts needed)
- ✅ Multiple task types: Initial Pin, Periodic Checks, Challenge Resolution
- ✅ Automatic reward distribution and comprehensive slashing
- ✅ WebTransport support (browser-native IPFS access)
- ✅ 2-3 week development time (vs 6-10 weeks for custom AVS)

## Architecture

### Components

1. **Execution Service** (Performer) - Pins files, generates Merkle proofs, and tracks bandwidth metrics
2. **Validation Service** (Attester) - Independently verifies file availability and bandwidth performance
3. **Kubo IPFS** - IPFS node with WebTransport enabled
4. **Othentic Contracts** - Pre-deployed L1/L2 infrastructure

### Proof of Bandwidth Integration

This AVS integrates **Proof of Bandwidth** verification to ensure operators not only store files but can serve them efficiently:

- **Measurement**: Download/upload times tracked during all task executions
- **Thresholds**: Minimum 5 Mbps for periodic checks, 2 Mbps for challenges
- **Validation**: Attesters independently measure retrieval performance
- **Enforcement**: Bandwidth failures trigger validation rejection and slashing

This guarantees users receive both **storage reliability** and **retrieval performance** from a single unified service.

See [design-othentic.md](./design-othentic.md) for detailed architecture documentation.

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- npm or yarn

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/yourusername/pinception-othentic
cd pinception-othentic

# 2. Install dependencies
npm install

# 3. Build shared library
cd services/shared
npm install && npm run build
cd ../..

# 4. Build services
cd services/execution
npm install && npm run build
cd ../validation
npm install && npm run build
cd ../..

# 5. Configure environment
cp .env.example .env
# Edit .env with your operator private key

# 6. Start services
docker-compose up -d

# 7. Check health
curl http://localhost:4003/health  # Execution Service
curl http://localhost:4004/health  # Validation Service
```

### Test Execution Service

```bash
# Add file to IPFS
echo "Hello Pinception!" > test.txt
CID=$(curl -X POST -F file=@test.txt http://localhost:5001/api/v0/add | jq -r '.Hash')
echo "CID: $CID"

# Execute pin task
curl -X POST http://localhost:4003/task/execute \
  -H 'Content-Type: application/json' \
  -d "{
    \"taskDefinitionId\": 1,
    \"data\": {
      \"cid\": \"$CID\",
      \"paymentAmount\": \"1000000000000000000\",
      \"storageDuration\": 2592000
    }
  }"
```

### Test Browser WebTransport

```bash
# 1. Start browser test
cd browser-test
npm install
npm run dev

# 2. Open http://localhost:3000
# 3. Get operator multiaddr:
curl -s http://localhost:5001/api/v0/id | jq -r '.Addresses[] | select(contains("webtransport"))'

# 4. Enter multiaddr in browser UI and click "Connect"
# 5. Enter CID and click "Fetch File"
```

## Project Structure

```
pinception-othentic/
├── services/
│   ├── shared/              # Shared utilities (Merkle trees, IPFS client)
│   ├── execution/           # Execution Service (Performer)
│   └── validation/          # Validation Service (Attester)
├── browser-test/            # WebTransport browser test client
├── docker-compose.yml       # Local deployment configuration
├── design-othentic.md       # Architecture documentation
└── README.md
```

## Deployment

### Testnet (Sepolia + Base Sepolia)

```bash
# 1. Install Othentic CLI
npm install -g @othentic/cli

# 2. Deploy contracts
othentic-cli deploy \
  --l1 sepolia \
  --l2 base-sepolia \
  --private-key $DEPLOYER_KEY

# 3. Configure task definitions
# (After deployment, update .env with contract addresses)
npm run configure-tasks -- --network sepolia

# 4. Deploy operator infrastructure
# Use cloud VM or managed Kubernetes
# Copy docker-compose.yml and configure with production settings

# 5. Register operator
npm run register-operator -- --network sepolia
```

### Mainnet

See [Deployment Guide](./docs/deployment.md) for production deployment instructions.

## Task Definitions

### Task 1: Initial Pin & Verification
- User submits CID + payment
- Performer downloads (with timing), generates Merkle proof, pins locally
- Attesters independently verify data integrity and measure bandwidth
- **Bandwidth**: Download time recorded, baseline performance established
- Reward distributed on >⅔ quorum

### Task 2: Periodic Retrievability Check
- Scheduled proof of continued storage and performance
- Performer provides Merkle proof + bandwidth metrics (chunk latencies)
- Attesters validate file availability and enforce **minimum 5 Mbps** threshold
- **Slashing**: Bandwidth below 5 Mbps = validation failure
- 66% failure rate triggers heavy slashing

### Task 3: Challenge Resolution
- User challenges alleged unavailability
- Operator must provide full Merkle proof within **30 second** response time
- Attesters validate proof and require **minimum 2 Mbps** bandwidth
- **Slashing**: Slow response or low bandwidth = challenge upheld
- Challenger rewarded if proof fails

## API Reference

### Execution Service

**POST /task/execute**
```json
{
  "taskDefinitionId": 1,
  "data": {
    "cid": "QmXxxx...",
    "paymentAmount": "1000000000000000000",
    "storageDuration": 2592000
  }
}
```

**Response:**
```json
{
  "success": true,
  "proofOfTask": "{\"cid\":\"QmXxxx...\",\"merkleRoot\":\"0xabc...\",\"chunkCount\":4,\"fileSize\":1024,\"timestamp\":1699380000,\"ipfsPeerId\":\"12D3KooW...\",\"downloadTimeMs\":245,\"uploadBandwidthMbps\":8.5}"
}
```

### Validation Service

**POST /task/validate**
```json
{
  "proofOfTask": "{\"cid\":\"QmXxxx...\",\"merkleRoot\":\"0xabc...\"}",
  "taskDefinitionId": 1,
  "data": {
    "cid": "QmXxxx..."
  }
}
```

**Response:**
```json
{
  "valid": true
}
```

## Proof of Bandwidth Details

### How It Works

Proof of Bandwidth (PoB) validates that operators can serve files efficiently, not just store them. This is critical for a practical pinning service where users need fast retrieval.

**Measurement Points:**

1. **Initial Pin (Task 1)**: Baseline bandwidth established during first download
2. **Periodic Check (Task 2)**: Primary enforcement - operators must maintain ≥5 Mbps
3. **Challenge Resolution (Task 3)**: Response time <30s + bandwidth ≥2 Mbps required

**Metrics Collected:**

- `downloadTimeMs`: Time to retrieve file from IPFS network
- `uploadBandwidthMbps`: Calculated transfer speed (file size / time)
- `chunkRetrievalLatencies`: Per-chunk timing for sampling tests

**Validation Process:**

1. Operator executes task and reports bandwidth metrics in proof
2. Attesters independently retrieve the same file with timing
3. Attesters compare their measurements with operator's claims
4. Bandwidth below threshold = validation failure = slashing

**Anti-Gaming Measures:**

- **Statistical validation**: Operator's bandwidth must be within 30-200% of attester measurements
- **Multiple attesters**: Median measurement used to eliminate outliers
- **Random chunk sampling**: Prevents pre-positioning attacks
- **Time-bound challenges**: Operator can't delay or prioritize traffic

### Performance Requirements

| Task Type | Min Bandwidth | Max Latency | Consequence |
|-----------|---------------|-------------|-------------|
| Initial Pin | None (baseline) | N/A | Warning if anomalous |
| Periodic Check | 5 Mbps | 500ms/chunk | Validation failure |
| Challenge | 2 Mbps | 30s total | Challenge upheld |

**File Size Handling:**

- **Small files (<1MB)**: Latency-focused validation
- **Medium files (1-100MB)**: Full bandwidth measurement
- **Large files (>100MB)**: Chunk sampling for periodic checks

### Slashing Policy

**Bandwidth-Related Failures:**

- **Below 5 Mbps (periodic check)**: Validation rejection → slashing if <66% quorum
- **Below 2 Mbps (challenge)**: Challenge upheld → operator slashed, challenger rewarded
- **Timeout (>30s response)**: Automatic challenge validation failure
- **Suspicious reporting**: Bandwidth ratio <0.3x attester = validation failure

**Graduated Enforcement:**

The system uses a two-tier approach:
1. **Soft failures** (1-2 instances): Warnings, no immediate slashing
2. **Hard failures** (>66% of checks): Heavy slashing via Othentic quorum mechanism

This balances network variability tolerance with accountability.

### Configuration

Operators can tune bandwidth thresholds via environment variables to match their network capacity and deployment region:

```bash
# Recommended for US/EU operators with good connectivity
MIN_BANDWIDTH_MBPS=10
MIN_CHALLENGE_BANDWIDTH_MBPS=5

# Minimum acceptable (may reduce rewards)
MIN_BANDWIDTH_MBPS=5
MIN_CHALLENGE_BANDWIDTH_MBPS=2

# Testing/development (disable enforcement)
MIN_BANDWIDTH_MBPS=0.1
SKIP_NODE_REACHABILITY_CHECK=true
```

## Development

### Build Services

```bash
# Build shared library
cd services/shared && npm run build

# Build Execution Service
cd ../execution && npm run build

# Build Validation Service
cd ../validation && npm run build
```

### Run Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Browser WebTransport tests
cd browser-test && npm run test
```

### Linting

```bash
npm run lint
```

## Configuration

### Environment Variables

See [.env.example](./.env.example) for all configuration options.

**Key Variables:**
- `OPERATOR_PRIVATE_KEY` - Operator's private key for signing
- `KUBO_API_URL` - IPFS Kubo API endpoint
- `CHUNK_SIZE` - File chunk size for Merkle trees (default: 256KB)
- `EXECUTION_SERVICE_PORT` - Execution Service port (default: 4003)
- `VALIDATION_SERVICE_PORT` - Validation Service port (default: 4004)

**Bandwidth Configuration:**
- `MIN_BANDWIDTH_MBPS` - Minimum bandwidth for periodic checks (default: 5 Mbps)
- `MIN_CHALLENGE_BANDWIDTH_MBPS` - Minimum bandwidth for challenges (default: 2 Mbps)
- `MAX_CHUNK_LATENCY_MS` - Maximum chunk retrieval latency (default: 500ms)
- `MAX_CHALLENGE_RESPONSE_TIME_MS` - Maximum challenge response time (default: 30000ms)

### Docker Compose

Customize [docker-compose.yml](./docker-compose.yml) for your deployment:
- Resource limits (CPU, memory)
- IPFS volume configuration
- Network settings
- Port mappings

## Monitoring

### Service Health

```bash
# Check all services
curl http://localhost:4003/health
curl http://localhost:4004/health
curl -X POST http://localhost:5001/api/v0/id
```

### Logs

```bash
# Follow all logs
docker-compose logs -f

# Follow specific service
docker-compose logs -f execution-service
docker-compose logs -f validation-service
docker-compose logs -f ipfs
```

### Metrics

Services expose metrics on `/metrics` endpoint (Prometheus format):
- Task execution count
- Validation success rate
- IPFS request latency
- Merkle proof generation time

## Security

### Considerations

1. **Private Key Management:** Store `OPERATOR_PRIVATE_KEY` securely (use secrets manager in production)
2. **IPFS Peer Discovery:** Limit swarm connections to trusted peers
3. **API Access:** Restrict Execution/Validation Service endpoints to Othentic network
4. **Resource Limits:** Configure Docker memory/CPU limits to prevent DoS

### Audits

- [x] Smart Contract Audit: Othentic contracts are pre-audited
- [ ] Service Logic Audit: Pending for Execution/Validation Services
- [ ] Penetration Testing: Scheduled for testnet phase

## Troubleshooting

### IPFS Connection Issues

```bash
# Check IPFS daemon
docker-compose logs ipfs

# Verify IPFS API
curl -X POST http://localhost:5001/api/v0/id
```

### Service Won't Start

```bash
# Check environment variables
docker-compose config

# Rebuild services
docker-compose build --no-cache

# Check logs for errors
docker-compose logs execution-service
```

### WebTransport Test Fails

- Ensure Kubo v0.18+ is running (WebTransport enabled by default)
- Check browser console for connection errors
- Verify multiaddr includes `/webtransport` component
- Try HTTP (use HTTPS in production for WebTransport certificate validation)

## Roadmap

- [x] Core Execution/Validation Services
- [x] Proof of Bandwidth integration
- [x] Docker Compose setup
- [x] Browser WebTransport test
- [ ] Bandwidth metrics dashboard
- [ ] Testnet deployment scripts
- [ ] Operator dashboard (monitoring UI)
- [ ] User-facing pin request API
- [ ] Challenge mechanism implementation
- [ ] Security audit
- [ ] Mainnet deployment

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Links

- [Othentic Documentation](https://docs.othentic.xyz/main)
- [Kubo IPFS](https://github.com/ipfs/kubo)
- [EigenLayer](https://docs.eigenlayer.xyz)
- [Original Pinception](https://github.com/wesfloyd/pinception)

## Support

- GitHub Issues: https://github.com/yourusername/pinception-othentic/issues
- Discord: [Join our community](#)
- Email: support@pinception.io

---

**Built with ❤️ using the Othentic Stack**
