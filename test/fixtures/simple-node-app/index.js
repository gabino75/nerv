/**
 * Simple Node.js app for NERV E2E testing
 * Used as a test fixture for creating projects and running tasks
 */

import http from 'http';

const PORT = process.env.PORT || 3000;

/**
 * Add two numbers together
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
export function add(a, b) {
  return a + b;
}

/**
 * Subtract b from a
 * @param {number} a - First number
 * @param {number} b - Number to subtract
 * @returns {number} Difference of a and b
 */
export function subtract(a, b) {
  return a - b;
}

/**
 * Simple HTTP server for testing
 */
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Hello from simple-node-app!' }));
  } else if (req.url === '/add') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result: add(2, 3) }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Only start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
  });
}

export default server;
