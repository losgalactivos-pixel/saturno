// Animación de entrada: se ve al abrir Saturno, una vez por sesión (no al recargar).
// Script clásico en <head> para decidir antes del primer pintado. La animación es solo CSS;
// aquí se permite saltarla con un toque o una tecla y se retira al terminar.
const root = document.documentElement;
let seen = false;
try {
  seen = sessionStorage.getItem('saturno:splash') === '1';
  sessionStorage.setItem('saturno:splash', '1');
} catch {
  /* sin almacenamiento: se muestra siempre */
}
if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('no-splash');

document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  if (root.classList.contains('no-splash')) {
    splash.remove();
    return;
  }
  const skip = () => splash.classList.add('is-leaving');
  splash.addEventListener('pointerdown', skip);
  document.addEventListener('keydown', skip);
  splash.addEventListener('animationend', (e) => {
    if (e.target !== splash) return;
    splash.remove();
    document.removeEventListener('keydown', skip);
    // La vista aparece suavemente detrás del splash.
    const main = document.getElementById('main');
    main.classList.remove('is-entering');
    void main.offsetWidth;
    main.classList.add('is-entering');
  });
});
