// Animación de entrada: se ve al abrir Saturno, una vez por sesión (no al recargar).
// Va justo después del splash en el <body>: el navegador lo ejecuta con el CSS ya cargado y antes
// de pintar. El splash viene oculto y solo se muestra si ese CSS es el que lo anima (justo después
// de publicar, el navegador puede tener aún el CSS anterior en caché). La animación es solo CSS;
// aquí se permite saltarla con un toque o una tecla y se retira al terminar.
{
  const splash = document.getElementById('splash');
  let show = getComputedStyle(splash).position === 'fixed' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    if (sessionStorage.getItem('saturno:splash')) show = false;
    else if (show) sessionStorage.setItem('saturno:splash', '1');
  } catch {
    /* sin almacenamiento: se muestra siempre */
  }

  if (!show) {
    splash.remove();
  } else {
    splash.hidden = false;
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
  }
}
