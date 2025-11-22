(function () {
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  const flashMessages = document.querySelectorAll('.flash');
  if (flashMessages.length) {
    setTimeout(() => {
      flashMessages.forEach((flash) => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 400);
      });
    }, 4000);
  }

  window.confirmDelete = (message = 'Are you sure you want to proceed?') => {
    return window.confirm(message);
  };
})();

