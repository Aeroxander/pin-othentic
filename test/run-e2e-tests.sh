#!/bin/bash

# E2E Test Runner Script
# Starts services and runs all end-to-end tests

set -e

echo "========================================"
echo "Pinception E2E Test Runner"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}.env file created${NC}"
fi

# Start services
echo -e "\n${YELLOW}Starting services...${NC}"
docker-compose up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Check if services are running
if ! docker-compose ps | grep -q "Up"; then
    echo -e "${RED}Error: Services failed to start${NC}"
    docker-compose logs
    exit 1
fi

echo -e "${GREEN}Services started successfully${NC}"

# Run tests
echo -e "\n${YELLOW}Installing test dependencies...${NC}"
cd test/e2e
npm install

echo -e "\n${YELLOW}Running E2E tests...${NC}"
echo "========================================"

# Run all tests
npm run test

# Check test results
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}========================================"
    echo -e "✓ ALL TESTS PASSED"
    echo -e "========================================${NC}\n"
    exit 0
else
    echo -e "\n${RED}========================================"
    echo -e "✗ TESTS FAILED"
    echo -e "========================================${NC}\n"
    echo -e "${YELLOW}Service logs:${NC}"
    docker-compose logs --tail=50
    exit 1
fi
