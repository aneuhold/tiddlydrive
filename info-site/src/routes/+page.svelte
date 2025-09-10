<script>
  const year = new Date().getFullYear();
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
      </li>
      <li><strong>Client‑Side Only:</strong> No server stores your content.</li>
      <li><strong>Open Source:</strong> MIT licensed and community friendly.</li>
    </ul>
  </section>
  <section class="actions">
    <a
      class="primary-btn button-text"
      href="https://github.com/aneuhold/tiddlydrive"
      target="_blank"
      rel="noreferrer">View Repository</a
    >
  </section>
  <footer class="site-footer subtitle-1">&copy; {year} Tiddly Drive 2</footer>
</main>

<style>
  .landing {
    max-width: 960px;
    margin: 0 auto;
    padding: calc(var(--standard-spacing) * 6) calc(var(--standard-spacing) * 2) 4rem;
  }
  .hero {
    margin-bottom: calc(var(--standard-spacing) * 5);
  }
  .brand {
    color: var(--color-primary);
    text-shadow: 0 2px 4px var(--color-shadow-light);
  }
  .subtitle {
    color: var(--color-text-secondary);
    font-weight: 400;
  }
  .feature-intro {
    background: var(--color-primary-100);
    padding: calc(var(--standard-spacing) * 3);
    border-radius: 16px;
    box-shadow: 0 4px 12px var(--color-shadow-light);
  }
  .feature-list {
    list-style: none;
    padding: 0;
    margin: calc(var(--standard-spacing) * 2) 0 0;
    text-align: left;
  }
  .feature-list li {
    background: #fff;
    margin: 0 0 var(--standard-spacing) 0;
    padding: calc(var(--standard-spacing) * 2);
    border-radius: 12px;
    box-shadow: 0 2px 6px var(--color-shadow-light);
  }
  .feature-list li strong {
    color: var(--color-primary);
  }
  .actions {
    margin: calc(var(--standard-spacing) * 4) 0 calc(var(--standard-spacing) * 6);
  }
  .primary-btn {
    display: inline-block;
    background: var(--color-primary);
    color: #fff;
    padding: 12px 28px;
    border-radius: 28px;
    letter-spacing: 0.05em;
    text-decoration: none;
    box-shadow: 0 4px 10px var(--color-shadow);
    transition:
      background 0.2s,
      transform 0.15s;
  }
  .primary-btn:hover {
    background: var(--color-primary-300);
  }
  .primary-btn:active {
    transform: translateY(2px);
  }
  .site-footer {
    margin-top: calc(var(--standard-spacing) * 8);
    color: var(--color-text-secondary);
  }
  code {
    background: var(--color-accent-light);
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 0.85em;
  }
  @media (max-width: 640px) {
    .header-2 {
      font-size: 2.5rem;
    }
    .feature-list li {
      padding: calc(var(--standard-spacing) * 1.5);
    }
  }
</style>
