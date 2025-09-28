/**
 * Web Worker for computing content hashes on a separate thread
 * This prevents the hash computation from blocking the main UI thread
 */

import { generateContentHash } from '$lib/utils/hashUtils';

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
