// Test script to verify indexer payload matches backend expectations
const sampleIndexerPayload = {
  transactionHash: "0x021dfd8df75b8ce9b852f5b4e1a02069bc6f53894559830e4d8167edcbbeb12c",
  fid: 12345,
  ca: "0xb2c8284e2a6e67700082686ffea026064a987b07",
  direction: true, // false=DOWN, true=UP
  duration: 7, // days
  timestamp: 1735689600, // unix timestamp
  source: "indexer",
  blockNumber: 34927787
};

console.log("Sample indexer payload:");
console.log(JSON.stringify(sampleIndexerPayload, null, 2));

// Expected calculated fields:
const calculatedFields = {
  id: sampleIndexerPayload.transactionHash, // Will be used as primary key
  expiresAt: sampleIndexerPayload.timestamp + (sampleIndexerPayload.duration * 24 * 60 * 60),
  status: 0 // ACTIVE
};

console.log("\nCalculated fields:");
console.log(JSON.stringify(calculatedFields, null, 2));

console.log("\nCurl command to test:");
console.log(`curl -X POST http://localhost:3000/signal-service/signal \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_BACKEND_API_KEY" \\
  -d '${JSON.stringify(sampleIndexerPayload)}'`);