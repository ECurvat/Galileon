fetch('data/lignes.json')
  .then(res => res.json())
  .then(lignes => {
    const container = document.getElementById('lignes');

    lignes.forEach(ligne => {
      const btn = document.createElement('button');
      btn.textContent = ligne.nom;
      btn.addEventListener('click', () => {
        window.location.href = `ligne.html?ligne=${encodeURIComponent(ligne.nom)}`;
      });
      container.appendChild(btn);
    });
  });
