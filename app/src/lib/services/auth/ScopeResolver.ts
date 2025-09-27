/** Resolves and evaluates OAuth scopes */
export class ScopeResolver {
  private static DRIVE = 'https://www.googleapis.com/auth/drive';
  private static DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
  private static PARAM = 'td_scope';

  /**
   * Determine the effective desired scope from URL param (drive|drive.file).
   *
   * @returns Full scope URL
   */
  determine(): string {
    try {
      const params = new URLSearchParams(location.search);
      const raw = params.get(ScopeResolver.PARAM)?.trim();
      if (raw === 'drive') return ScopeResolver.DRIVE;
      if (raw === 'drive.file') return ScopeResolver.DRIVE_FILE;
    } catch {
      /* ignore */
    }
    return ScopeResolver.DRIVE_FILE;
  }

  /**
   * Returns whether granted scopes satisfy desired.
   *
   * @param granted Space-delimited string of scopes
   * @param desired Full scope URL desired
   * @returns True if satisfied
   */
  isSatisfied(granted: string | undefined, desired: string): boolean {
    if (!granted) return false;
    const list = granted.split(/\s+/).filter(Boolean);
    if (desired === ScopeResolver.DRIVE) return list.includes(ScopeResolver.DRIVE);
    if (desired === ScopeResolver.DRIVE_FILE)
      return list.includes(ScopeResolver.DRIVE) || list.includes(ScopeResolver.DRIVE_FILE);
    return list.includes(desired);
  }

  /**
   * Derives a short override flag for a desired scope.
   *
   * @param desired Desired full scope
   * @returns Short override value or null
   */
  deriveShort(desired: string): string | null {
    if (desired.endsWith('/drive')) return 'drive';
    if (desired.endsWith('/drive.file')) return 'drive.file';
    return null;
  }

  /**
   * Returns the short param currently on page (not validated)
   *
   * @returns The raw override value or null
   */
  currentPageOverride(): string | null {
    try {
      return new URLSearchParams(location.search).get(ScopeResolver.PARAM);
    } catch {
      return null;
    }
  }
}
