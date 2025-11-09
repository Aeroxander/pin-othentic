# Pinception E2E Testing Guide

This directory contains end-to-end tests for the Pinception IPFS pinning service using the Othentic Stack.

## Overview

The E2E tests verify the complete workflow of the three task definitions:

1. **Initial Pin & Verification** - Pin a new file and verify it across the network
2. **Periodic Retrievability Check** - Verify continued storage of pinned files
3. **Challenge Resolution** - Prove data availability when challenged

## Prerequisites

Before running tests, ensure you have:

- Docker and Docker Compose installed
- Node.js 20+ and npm
- At least 4GB of available disk space for IPFS

## Quick Start

### 1. Setup Environment

```bash
# From project root
cd /Users/alexanderklus/Applications/pic-othentic

# Copy environment template
cp .env.example .env

# The default .env.example has Anvil's first test private key
# You can use it as-is for local testing
```

### 2. Start Services

```bash
# Build and start all services (IPFS, Execution Service, Validation Service)
npm run docker:up

# Wait for services to be ready (about 30 seconds)
# You can check logs with:
npm run docker:logs
```

### 3. Run All Tests

```bash
# Run complete E2E test suite
npm run test:e2e
```

This will:
- Verify all services are running
- Execute all three task definition tests
- Display comprehensive results

### 4. Run Individual Tests

```bash
# Test Initial Pin workflow
npm run test:e2e:initial-pin

# Test Periodic Check workflow
npm run test:e2e:periodic

# Test Challenge Resolution workflow
npm run test:e2e:challenge
```

## Test Architecture

```
test/
├── e2e/
│   ├── setup.ts                    # Test environment setup
│   ├── helpers.ts                  # Utility functions for testing
│   ├── test-initial-pin.ts         # Task 1: Initial Pin test
│   ├── test-periodic-check.ts      # Task 2: Periodic Check test
│   ├── test-challenge-resolution.ts # Task 3: Challenge Resolution test
│   ├── package.json                # Test dependencies
│   └── tsconfig.json               # TypeScript configuration
└── run-e2e-tests.sh                # Test runner script
```

## Test Flows

### Initial Pin & Verification (Task 1)

```
1. Generate random test data (512KB)
2. Add file to IPFS
3. Execute Initial Pin task on Execution Service
   └─> Downloads file (with timing)
   └─> Measures bandwidth
   └─> Generates Merkle root with operator's key
   └─> Pins locally
   └─> Returns proof with bandwidth metrics
4. Validate task on Validation Service
   └─> Independently retrieves file
   └─> Verifies file size
   └─> Verifies Merkle root
   └─> Validates bandwidth reporting
   └─> Pins for redundancy
5. Verify file can be retrieved
6. Assert bandwidth metrics are present and valid
```

**Expected Output:**
- ✓ File added to IPFS
- ✓ Execution Service generates valid proof
- ✓ Bandwidth metrics recorded (downloadTimeMs, uploadBandwidthMbps)
- ✓ Validation Service confirms proof
- ✓ File is pinned and retrievable
- ✓ Bandwidth > 0 Mbps

### Periodic Retrievability Check (Task 2)

```
1. Pin test file (256KB)
2. Execute Periodic Check task
   └─> Verifies file is still pinned
   └─> Measures chunk retrieval latencies (5 samples)
   └─> Calculates upload bandwidth
   └─> Regenerates Merkle root
   └─> Returns proof with performance metrics
3. Validate periodic check
   └─> Retrieves file from network (with timing)
   └─> Verifies Merkle root matches
   └─> Enforces minimum bandwidth threshold (5 Mbps)
   └─> Validates chunk latencies
   └─> Attempts to connect to operator's IPFS node
4. Assert bandwidth meets minimum requirements
```

**Expected Output:**
- ✓ File remains available
- ✓ Merkle root verification succeeds
- ✓ Bandwidth ≥ 5 Mbps (or MIN_BANDWIDTH_MBPS env var)
- ✓ Chunk latencies recorded and reasonable
- ✓ Operator proves continued storage and performance

### Challenge Resolution (Task 3)

```
1. Pin test file (128KB)
2. Simulate challenge scenario
3. Execute Challenge Resolution task
   └─> Measures response start time
   └─> Verifies file is available
   └─> Tracks response time
   └─> Calculates bandwidth
   └─> Generates full Merkle proof
   └─> Returns challenge response with timing
4. Validate challenge resolution
   └─> Retrieves file (with timing)
   └─> Verifies response time < 30 seconds
   └─> Enforces minimum bandwidth (2 Mbps)
   └─> Verifies Merkle proof
   └─> Confirms operator node is reachable
5. Assert performance meets challenge requirements
```

**Expected Output:**
- ✓ Challenge is refuted
- ✓ Response time < 30 seconds (or MAX_CHALLENGE_RESPONSE_TIME_MS)
- ✓ Bandwidth ≥ 2 Mbps (or MIN_CHALLENGE_BANDWIDTH_MBPS)
- ✓ Operator provides valid proof
- ✓ Data availability and performance confirmed

## Bandwidth Testing Configuration

The E2E tests validate Proof of Bandwidth metrics. You can configure thresholds using environment variables:

### Environment Variables

```bash
# Minimum bandwidth for periodic checks (default: 5 Mbps)
MIN_BANDWIDTH_MBPS=5

# Minimum bandwidth for challenges (default: 2 Mbps)
MIN_CHALLENGE_BANDWIDTH_MBPS=2

# Maximum chunk latency (default: 500ms)
MAX_CHUNK_LATENCY_MS=500

# Maximum challenge response time (default: 30000ms = 30s)
MAX_CHALLENGE_RESPONSE_TIME_MS=30000

# Skip node reachability checks for local testing
SKIP_NODE_REACHABILITY_CHECK=true
```

### Testing with Different Thresholds

**Strict Mode (Production-like):**
```bash
MIN_BANDWIDTH_MBPS=10 \
MIN_CHALLENGE_BANDWIDTH_MBPS=5 \
MAX_CHUNK_LATENCY_MS=200 \
npm run test:e2e
```

**Relaxed Mode (Development):**
```bash
MIN_BANDWIDTH_MBPS=1 \
MIN_CHALLENGE_BANDWIDTH_MBPS=0.5 \
MAX_CHUNK_LATENCY_MS=1000 \
SKIP_NODE_REACHABILITY_CHECK=true \
npm run test:e2e
```

**Observe Metrics Only (No Enforcement):**
```bash
MIN_BANDWIDTH_MBPS=0.1 \
MIN_CHALLENGE_BANDWIDTH_MBPS=0.1 \
npm run test:e2e
```

### Expected Bandwidth Metrics

For local testing with Docker, typical bandwidth metrics are:

| File Size | Expected Download Time | Expected Bandwidth |
|-----------|------------------------|-------------------|
| 128 KB | 5-50ms | 20-200 Mbps |
| 256 KB | 10-80ms | 25-200 Mbps |
| 512 KB | 20-150ms | 27-200 Mbps |
| 1 MB | 40-300ms | 27-200 Mbps |

**Note:** Local IPFS-to-IPFS transfers are very fast. Production across the internet will have lower bandwidth and higher latency.

### What Tests Verify

1. **Initial Pin**: Bandwidth metrics are present and > 0
2. **Periodic Check**: 
   - Bandwidth ≥ MIN_BANDWIDTH_MBPS
   - Chunk latencies recorded
   - Average latency reasonable
3. **Challenge Resolution**:
   - Response time < MAX_CHALLENGE_RESPONSE_TIME_MS
   - Bandwidth ≥ MIN_CHALLENGE_BANDWIDTH_MBPS

## Troubleshooting

### Services Not Starting

```bash
# Check Docker status
docker-compose ps

# View service logs
docker-compose logs ipfs
docker-compose logs execution-service
docker-compose logs validation-service

# Restart services
npm run docker:restart
```

### IPFS Connection Issues

```bash
# Verify IPFS is running
curl -X POST http://localhost:5001/api/v0/id

# Check IPFS logs
docker-compose logs ipfs

# Restart IPFS
docker-compose restart ipfs
```

### Test Failures

**Common Issues:**

1. **"IPFS daemon is not available"**
   - Wait longer for IPFS to initialize (can take 30-60s on first run)
   - Check `docker-compose logs ipfs`

2. **"Service at http://localhost:4003/health did not become ready"**
   - Services may need more time to build on first run
   - Check logs: `docker-compose logs execution-service`

3. **"Merkle root mismatch"**
   - This indicates a bug in the Merkle tree implementation
   - Verify chunk size is consistent across services

4. **"File size mismatch"**
   - IPFS may be corrupting files or returning incorrect data
   - Try restarting IPFS: `docker-compose restart ipfs`

5. **"Bandwidth below threshold" or "No bandwidth metrics reported"**
   - For local testing, set relaxed thresholds: `MIN_BANDWIDTH_MBPS=0.1`
   - Check service logs to ensure bandwidth measurement code is running
   - Verify services are using the latest build with PoB integration

6. **"Response time exceeds limit"**
   - Local testing should be fast; if slow, check system resources
   - Increase threshold for testing: `MAX_CHALLENGE_RESPONSE_TIME_MS=60000`
   - Check Docker container CPU/memory limits

### Reset Everything

```bash
# Stop all services and remove volumes
docker-compose down -v

# Remove IPFS data
docker volume rm pic-othentic_ipfs_data

# Start fresh
npm run docker:up

# Wait for initialization and run tests
sleep 30
npm run test:e2e
```

## Manual Testing

You can also test services manually:

### Add File to IPFS

```bash
# Create test file
echo "Hello Pinception!" > test.txt

# Add to IPFS
curl -X POST -F file=@test.txt http://localhost:5001/api/v0/add
```

### Execute Task

```bash
# Execute Initial Pin task
curl -X POST http://localhost:4003/task/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "taskDefinitionId": 1,
    "data": {
      "cid": "QmYourCidHere",
      "paymentAmount": "1000000000000000000",
      "storageDuration": 2592000
    }
  }'
```

### Validate Task

```bash
# Validate task (use proofOfTask from execution response)
curl -X POST http://localhost:4004/task/validate \
  -H 'Content-Type: application/json' \
  -d '{
    "proofOfTask": "{\"cid\":\"QmYourCidHere\",\"merkleRoot\":\"...\"}",
    "taskDefinitionId": 1,
    "data": {
      "cid": "QmYourCidHere",
      "paymentAmount": "1000000000000000000",
      "storageDuration": 2592000
    }
  }'
```

## CI/CD Integration

The tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build services
        run: npm run build
      
      - name: Start services
        run: npm run docker:up
      
      - name: Wait for services
        run: sleep 30
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Show logs on failure
        if: failure()
        run: npm run docker:logs
```

## Next Steps

After local testing succeeds:

1. **Test on Anvil (local Ethereum testnet)**
   - Start Anvil: `anvil`
   - Deploy mock contracts
   - Connect services to Anvil RPC

2. **Test on Real Testnet (Sepolia + Base Sepolia)**
   - Configure L1/L2 endpoints in `.env`
   - Deploy Othentic contracts
   - Register as operator
   - Run E2E tests against testnet

3. **Mainnet Deployment**
   - Follow production deployment guide
   - Use hardware wallet for operator key
   - Set up monitoring and alerting

## Resources

- [Othentic Documentation](https://docs.othentic.xyz)
- [IPFS Kubo API](https://docs.ipfs.tech/reference/kubo/rpc/)
- [Original Design Document](https://raw.githubusercontent.com/wesfloyd/pinception/refs/heads/main/docs/design.md)

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review service logs: `npm run docker:logs`
3. Open an issue on GitHub with logs and error messages
