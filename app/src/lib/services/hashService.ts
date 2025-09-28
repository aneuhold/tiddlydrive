import type { HashWorkerMessage, HashWorkerResponse } from '$lib/workers/hashWorker';
import HashWorker from '$lib/workers/hashWorker?worker';

/**
 * Service for computing content hashes using a Web Worker to avoid blocking the main thread.
 * This is particularly important for large HTML files that could cause UI freezes during hash computation.
 */
class HashService {
  private worker: Worker | null = null;
  private nextMessageId = 1;
  private pendingPromises = new Map<
    string,
    { resolve: (hash: string) => void; reject: (error: Error) => void }
  >();

  /**
   * Generate a hash of the given content using the web worker
   *
   * @param content The content to hash
   * @returns Promise that resolves to the hash string
   */
  async generateContentHash(content: string): Promise<string> {
    // Try to use the worker first
    this.initWorker();

    if (this.worker) {
      return this.generateHashWithWorker(content);
    } else {
      // Fallback to synchronous computation if worker fails
      return this.generateHashSync(content);
    }
  }

  /**
   * Clean up the worker and any pending operations
   */
  destroy(): void {
    if (this.worker) {
      this.worker.removeEventListener('message', this.handleWorkerMessage);
      this.worker.removeEventListener('error', this.handleWorkerError);
      this.worker.terminate();
      this.worker = null;
    }

    // Reject all pending promises
    const error = new Error('HashService destroyed');
    this.pendingPromises.forEach(({ reject }) => {
      reject(error);
    });
    this.pendingPromises.clear();
  }

  /**
   * Initialize the hash service and create the worker
   */
  private initWorker(): void {
    if (this.worker) return;

    try {
      this.worker = new HashWorker();
      this.worker.addEventListener('message', this.handleWorkerMessage);
      this.worker.addEventListener('error', this.handleWorkerError);
    } catch (_error) {
      console.warn('[hashService] Failed to create worker, falling back to synchronous hashing');
      this.worker = null;
    }
  }

  /**
   * Handle messages from the worker
   *
   * @param event Message event from the worker
   */
  private handleWorkerMessage = (event: MessageEvent<HashWorkerResponse>): void => {
    const { id, hash, error } = event.data;
    const pendingPromise = this.pendingPromises.get(id);

    if (!pendingPromise) {
      console.warn(`[hashService] Received response for unknown message ID: ${id}`);
      return;
    }

    this.pendingPromises.delete(id);

    if (error) {
      pendingPromise.reject(new Error(error));
    } else {
      pendingPromise.resolve(hash);
    }
  };

  /**
   * Handle worker errors
   *
   * @param event Error event from the worker
   */
  private handleWorkerError = (event: ErrorEvent): void => {
    console.error('[hashService] Worker error:', event.error);

    // Reject all pending promises
    const error = new Error(`Worker error: ${event.message}`);
    this.pendingPromises.forEach(({ reject }) => {
      reject(error);
    });
    this.pendingPromises.clear();
  };

  /**
   * Generate hash using the web worker
   *
   * @param content The content to hash
   */
  private generateHashWithWorker(content: string): Promise<string> {
    const id = (this.nextMessageId++).toString();

    return new Promise<string>((resolve, reject) => {
      this.pendingPromises.set(id, { resolve, reject });

      const message: HashWorkerMessage = { id, content };
      if (this.worker) {
        this.worker.postMessage(message);
      } else {
        reject(new Error('Worker not available'));
      }

      // Set a timeout to prevent hanging indefinitely
      setTimeout(() => {
        if (this.pendingPromises.has(id)) {
          this.pendingPromises.delete(id);
          reject(new Error('Hash computation timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Synchronous fallback hash computation (same algorithm as the worker)
   *
   * @param content The content to hash
   * @returns Promise that resolves to the hash string
   */
  private generateHashSync(content: string): Promise<string> {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Promise.resolve(hash.toString(36));
  }
}

const hashService = new HashService();
export default hashService;
