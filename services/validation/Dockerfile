FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY services/validation/package*.json ./
RUN npm install

# Copy shared library
COPY services/shared /app/shared
WORKDIR /app/shared
RUN npm install && npm run build && npm link

# Copy service code and link shared
WORKDIR /app
COPY services/validation .
RUN npm link @pinception/shared

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 4004

# Run service
CMD ["node", "dist/index.js"]
