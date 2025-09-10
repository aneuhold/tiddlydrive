<script>
  const year = new Date().getFullYear();
</script>

<main class="policy">
  <h1 class="header-4">Terms of Service</h1>
  <p class="subtitle-1 muted">Last updated: {year}</p>
  <h2>Acceptance</h2>
  <p>By using Tiddly Drive 2 you agree to these Terms. If you do not agree, discontinue use.</p>
  <h2>License</h2>
  <p>
    This project is open source under the MIT License. You may study, modify, and redistribute the
    code in accordance with that license.
  </p>
  <h2>Appropriate Use</h2>
  <p>
    You agree not to misuse Google APIs or attempt to access files you are not authorized to open.
    The app must not be used for unlawful content or to circumvent security controls.
  </p>
  <h2>Availability</h2>
  <p>
    The service is provided “AS IS” with no uptime guarantees. Features may change or be
    discontinued without prior notice.
  </p>
  <h2>Disclaimer</h2>
  <p>
    NO WARRANTY. To the maximum extent permitted by law, the maintainers disclaim all warranties,
    express or implied, including merchantability and fitness for a particular purpose.
  </p>
  <h2>Limitation of Liability</h2>
  <p>
    The maintainers are not liable for lost data, indirect, incidental, special, or consequential
    damages. Always keep backups of important TiddlyWiki files.
  </p>
  <h2>Changes</h2>
  <p>
    Material updates to these Terms or the Privacy Policy will be noted via the project repository.
    Continued use after changes constitutes acceptance.
  </p>
  <h2>Contact</h2>
  <p>
    Questions? Open an issue at
    <a href="https://github.com/aneuhold/tiddlydrive/issues" target="_blank" rel="noreferrer"
      >GitHub Issues</a
    >.
  </p>
  <p class="back-link"><a data-sveltekit-preload-data="hover" href="/">← Back to home</a></p>
</main>

<style>
  .policy {
    max-width: 860px;
    margin: 0 auto;
    padding: 3.5rem 1.25rem 4rem;
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
  p {
    line-height: 1.5;
  }
  .back-link {
    margin-top: 3rem;
  }
  .muted {
    opacity: 0.75;
  }
</style>
