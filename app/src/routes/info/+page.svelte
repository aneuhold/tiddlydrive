<script>
  import { resolve } from '$app/paths';

  // Marketing landing page (moved under /info)
</script>

<main class="landing">
  <header class="hero">
    <h1 class="header-2 brand">Tiddly Drive 2</h1>
    <h2 class="header-6 subtitle">
      Open & save your single‑file TiddlyWiki right from Google Drive.
    </h2>
  </header>
  <section class="feature-intro">
    <p class="subtitle-1">
      A modern, privacy‑first bridge between Google Drive and classic TiddlyWiki files.
    </p>
    <ul class="feature-list">
      <li>
        <strong>Minimal Scope:</strong> Uses only <code>drive.file</code> for the files you choose.
        <sup>1</sup>
      </li>
      <li><strong>Client‑Side Processing:</strong> Your content never leaves your browser.</li>
      <li><strong>Stateless Backend:</strong> Secure token refresh only - no data storage.</li>
      <li><strong>Open Source:</strong> GNU licensed and community friendly.</li>
    </ul>
  </section>
  <section class="actions">
    <a
      class="primary-btn button-text"
      href="https://github.com/aneuhold/tiddlydrive"
      target="_blank"
      rel="noreferrer"
    >
      View Repository
    </a>
    <div class="inline-links subtitle-1">
      <a data-sveltekit-preload-data="hover" href={resolve('/info/privacy')}>Privacy Policy</a>
      <span aria-hidden="true">·</span>
      <a data-sveltekit-preload-data="hover" href={resolve('/info/terms')}>Terms of Service</a>
    </div>
  </section>
  <p class="scope-caveat">
    <sup>1</sup> Additional scopes (<code>drive.install</code>,
    <code>userinfo.email</code>, <code>userinfo.profile</code>) are required for Google Drive "Open
    With" integration and marketplace publishing but are not used by the application.
  </p>
</main>

<style>
  .landing {
    max-width: 960px;
    margin: 0 auto;
    text-align: center;
    padding: 0 1.25rem 4rem;
  }
  .hero {
    padding-top: 3.5rem;
  }
  .subtitle {
    margin-top: 0.85rem;
    font-weight: 500;
  }
  .feature-intro {
    margin-top: 1.75rem;
  }
  .feature-list {
    display: grid;
    gap: 0.75rem;
    list-style: none;
    padding: 0;
    margin: 1.1rem 0 0;
  }
  .feature-list li {
    background: #fff;
    padding: 1rem 1.15rem;
    border-radius: 12px;
    box-shadow: 0 2px 4px var(--color-shadow-light);
    font-size: 0.95rem;
  }
  .scope-caveat {
    margin-top: 0.75rem;
    font-size: 0.8rem;
    color: var(--color-text-muted, #666);
    text-align: center;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }
  .actions {
    margin-top: 2.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.85rem;
  }
  .inline-links a {
    color: var(--color-primary-700, var(--color-primary));
  }
  code {
    background: var(--color-accent-light);
    padding: 2px 5px;
    border-radius: 6px;
    font-size: 0.85em;
  }
  @media (max-width: 640px) {
    .header-2 {
      font-size: 2.5rem;
    }
    .feature-list li {
      padding: 0.9rem 0.95rem;
    }
  }
</style>
