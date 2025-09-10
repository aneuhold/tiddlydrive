/**
 *
 * @param message
 * @param timeout
 */
export function showToast(message: string, timeout = 2000) {
  let container = document.getElementById('td2-toast');
  if (!container) {
    container = document.createElement('div');
    container.id = 'td2-toast';
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      zIndex: '10000',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    });
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, {
    background: 'rgba(0,0,0,0.85)',
    color: '#fff',
    padding: '0.6rem 0.9rem',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontWeight: '500',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
  });
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 300ms';
    setTimeout(() => {
      el.remove();
    }, 320);
  }, timeout);
}

/**
 *
 * @param title
 * @param body
 */
export function showError(title: string, body: string) {
  alert(title + '\n' + body);
}
