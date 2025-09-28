/**
 * Web Worker for computing content hashes on a separate thread
 * This prevents the hash computation from blocking the main UI thread
 */

/**
 * Message format sent to the worker
 */
export interface HashWorkerMessage {
  id: string;
  content: string;
}

/**
 * Response format sent from the worker
 */
export interface HashWorkerResponse {
  id: string;
  hash: string;
  error?: string;
}

/**
 * Generate a simple hash of content for conflict detection
 *
 * @param content The content to hash
 * @returns A hash string representation
 */
function generateContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

// Handle messages from the main thread
self.addEventListener('message', (event: MessageEvent<HashWorkerMessage>) => {
  const { id, content } = event.data;

  try {
    const hash = generateContentHash(content);

    const response: HashWorkerResponse = {
      id,
      hash
    };

    self.postMessage(response);
  } catch (error) {
    // Send error response
    const errorResponse: HashWorkerResponse = {
      id,
      hash: '',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };

    self.postMessage(errorResponse);
  }
});
