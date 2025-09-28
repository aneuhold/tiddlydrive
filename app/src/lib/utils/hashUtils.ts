/**
 * Shared utility functions for content hashing
 * This prevents code duplication between the hash service and worker
 */

/**
 * Generate a simple hash of content for conflict detection
 * Uses a basic hash algorithm that's fast and sufficient for our use case
 *
 * @param content The content to hash
 * @returns A hash string representation
 */
export function generateContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}
