<script>
  import { resolve } from '$app/paths';

  const year = new Date().getFullYear();
</script>

<main class="policy">
  <div class="policy-card">
    <h1 class="header-4">Privacy Policy</h1>
    <p class="subtitle-1 muted">Last updated: {year}</p>
    <p>
      <strong>Summary:</strong> Tiddly Drive 2 runs entirely in your browser. It never uploads, proxies,
      or stores your TiddlyWiki content on any server operated by this project. The only remote services
      contacted are Google APIs needed to open and save the file you explicitly select, plus optional
      third‑party resources (fonts / icons) shown in the page head.
    </p>
    <h2>Data We Access</h2>
    <ul>
      <li>
        <strong>Selected File Content:</strong> The HTML of the TiddlyWiki file you open using Google
        Drive’s “Open with” flow.
      </li>
      <li>
        <strong>Minimal Metadata:</strong>
        File name, mime type, modified time, and file version (for conflict detection).
      </li>
    </ul>
    <h2>Data We Do <em>Not</em> Collect</h2>
    <ul>
      <li>No analytics, tracking pixels, ads, or profiling.</li>
      <li>No account emails, contacts, or any other Drive files beyond the one you choose.</li>
    </ul>
    <h2>OAuth Scope Justification</h2>
    <p>
      The app requests only the <code>https://www.googleapis.com/auth/drive.file</code> scope so it can
      read and update the specific file you pick. This does not grant broad read access to your entire
      Drive.
    </p>
    <h2>Data Storage & Retention</h2>
    <p>
      No persistent storage outside your browser’s runtime is used. When you close the tab, the
      in‑memory content and token are discarded. Any local preferences (e.g. autosave enabled) are
      stored in the browser's localStorage.
    </p>
    <h2>Third‑Party Services</h2>
    <ul>
      <li>
        <strong>Google Identity Services / Drive API:</strong> Authentication & file operations.
      </li>
      <li><strong>Google Fonts / Material Icons:</strong> UI fonts & icons.</li>
    </ul>
    <h2>Security</h2>
    <p>
      All requests occur over HTTPS. Save operations perform a version check against Google Drive’s
      reported file version to help prevent accidental overwrites. No secret keys are embedded
      client‑side beyond the public OAuth Client ID.
    </p>
    <h2>Data Deletion</h2>
    <p>
      Because no server copy is retained, deletion is controlled entirely by you via Google Drive.
      Removing the file from Drive removes the only stored copy. Clear local preferences by deleting
      this site’s cookies in your browser.
    </p>
    <h2>Reporting Issues</h2>
    <p>
      Open a GitHub issue at
      <a href="https://github.com/aneuhold/tiddlydrive/issues" target="_blank" rel="noreferrer"
        >tiddlydrive/issues</a
      >
      for privacy or security concerns.
    </p>
    <p class="back-link">
      <a data-sveltekit-preload-data="hover" href={resolve('/info')}>← Back to info home</a>
    </p>
  </div>
</main>

<style>
  .policy {
    max-width: 860px;
    margin: 0 auto;
    padding: 3.5rem 1.25rem 4rem;
  }
  .policy-card {
    background: #fff;
    text-align: left;
    padding: clamp(1.8rem, 3vw, 2.6rem) clamp(1.25rem, 2.2vw, 2.2rem);
    border-radius: 16px;
    box-shadow: 0 4px 18px -2px var(--color-shadow-light);
    position: relative;
  }
  .policy-card h1 {
    margin-top: 0;
  }
  .policy-card h2 {
    scroll-margin-top: 80px;
  }
  .policy-card p + h2,
  .policy-card ul + h2 {
    margin-top: 2.4rem;
  }
  .policy-card ul {
    list-style: disc;
  }
  h1 {
    margin: 0 0 0.25rem;
  }
  h2 {
    margin-top: 2rem;
    font-size: 1.05rem;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    opacity: 0.85;
  }
  ul {
    margin: 0.75rem 0 1.25rem;
    padding-left: 1.1rem;
  }
  li {
    line-height: 1.45;
    margin: 0.4rem 0;
  }
  p {
    line-height: 1.5;
  }
  code {
    background: var(--color-primary-100);
    padding: 2px 5px;
    border-radius: 5px;
    font-size: 0.85em;
  }
  .back-link {
    margin-top: 3rem;
  }
  .muted {
    opacity: 0.75;
  }
</style>
