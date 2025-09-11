/**
 * Shows a simple toast message in the bottom-right corner.
 *
 * @param message The text to show
 * @param timeout Milliseconds before the toast auto-dismisses
 */
export const showToast = (message: string, timeout = 2000): void => {
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
};

/**
 * Displays a simple blocking alert with a title and message body.
 *
 * @param title Title of the error
 * @param body Message body
 */
export const showError = (title: string, body: string): void => {
  alert(title + '\n' + body);
};
