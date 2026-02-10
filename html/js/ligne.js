  let lastOrientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";

  function checkOrientation() {
    const currentOrientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";

    // Blocage en portrait
    // if (currentOrientation === "portrait") {
    //   document.getElementById("orientation-lock").style.display = "flex";
    // } else {
    //   document.getElementById("orientation-lock").style.display = "none";
    // }

    // Reload uniquement si changement d’orientation
    if (currentOrientation !== lastOrientation) {
      lastOrientation = currentOrientation;
      location.reload();
    }
  }

  // Vérification initiale
  checkOrientation();

  // Vérification à chaque resize
  window.addEventListener("resize", checkOrientation);

async function fetchLignes() {
  const response = await fetch('data/lignes.json');
  return await response.json();
}

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function afficherErreur(message) {
	const ligneNom = getParam('ligne');
	const main = document.getElementsByClassName("main")[0];
	const div = document.createElement("div");
	div.className = "erreur";
	div.style.backgroundColor = lineColor(ligneNom) + "80"; // ajouter 80 en hexadécimal pour dire 50% de transparence
	div.style.borderColor = lineColor(ligneNom);
	div.textContent = "— " + message + " —";
	main.appendChild(div);
}

function buildTable(ligne) {
   const table = document.createElement("table");

   // Premier emplacement :
   // Emplacement1 : une seule cellule avec colspan
	const trEmplacement1 = table.insertRow();
	trEmplacement1.className = "emplacement emplacement1";
	const td1 = trEmplacement1.insertCell();
	td1.colSpan = ligne.stations.length;

	const container1 = document.createElement("div");
	container1.className = "train-container emplacement1";
	td1.appendChild(container1);


   // Voie 1 :
   trVoie1 = table.insertRow();
   trVoie1.className = "voie voie1";

   for(let i=0; i<ligne.stations.length; i++) {
	const td = trVoie1.insertCell();
	td.textContent = "-";
   }

   // Premier spacer :
   trSpacer1 = table.insertRow();
   trSpacer1.className = "spacer spacer1";

   for(let i=0; i<ligne.stations.length; i++) {
	const td = trSpacer1.insertCell();
   }

   // Noms des stations : 
   const trAbrev = table.insertRow();
   trAbrev.className = "abrev";

   for(let i=0; i<ligne.stations.length; i++) {
	const td = trAbrev.insertCell();
	td.textContent = ligne.stations[i].abrev;
   }

   // Deuxième spacer :
   trSpacer2 = table.insertRow();
   trSpacer2.className = "spacer spacer2";

   for(let i=0; i<ligne.stations.length; i++) {
	const td = trSpacer2.insertCell();
   }

   // Voie 2 :
   trVoie2 = table.insertRow();
   trVoie2.className = "voie voie2";

   for(let i=0; i<ligne.stations.length; i++) {
	const td = trVoie2.insertCell();
	td.textContent = "-";
   }

   // Deuxième emplacement :
   // Emplacement2 : une seule cellule avec colspan
	const trEmplacement2 = table.insertRow();
	trEmplacement2.className = "emplacement emplacement2";
	const td2 = trEmplacement2.insertCell();
	td2.colSpan = ligne.stations.length;

	const container2 = document.createElement("div");
	container2.className = "train-container emplacement2";
	td2.appendChild(container2);


   const main = document.getElementsByClassName("main")[0];
   main.appendChild(table);
}

function buildMenu(ligneNom) {
	fetch('data/lignes.json')
	.then(res => res.json())
	.then(lignes => {
		const menu = document.getElementsByClassName("menu")[0]

		lignes.forEach(ligne => {
			const btn = document.createElement('button');
			if (ligne.nom == ligneNom) {
				btn.className = "active";
			}
			btn.textContent = ligne.nom;
			btn.addEventListener('click', () => {
				window.location.href = `ligne.html?ligne=${encodeURIComponent(ligne.nom)}`;
			});
			menu.appendChild(btn);
		});
	});
}

async function fetchVehiculesForLigne(ligne) {
  try {
    const response = await fetch(`/api/vehicules?ligne=${ligne}`);
    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
    const data = await response.json();
	if (!data.success) {
		afficherErreur(data.message);
	} else {
		return (data.data.Vehicules || []).map(v => {
		const coord = convertWebMercatorToWGS84(v.X, v.Y);
		let arretCorrige = v.ProchainArret;
		if (v.ProchainArret === "Perrache.") {
			arretCorrige = "Perrache";
		} else if (v.ProchainArret === "Grange  Blanche") {
			arretCorrige = "Grange Blanche";
		} else if (v.ProchainArret === "Porte des  Alpes") {
			arretCorrige = "Porte des Alpes";
		} else if ((v.ProchainArret === "Jet d'Eau -  M. France") || (v.prochainArret === "Jet d'Eau - M. France")) {
			arretCorrige = "Jet d'Eau - M. France";
		} else if ((v.ProchainArret === "Gare  Part-Dieu") || (v.prochainArret === "Gare Part  Dieu")) {
			arretCorrige = "Gare Part-Dieu";
		} else if (v.ProchainArret === "H. Region Montrochet.") {
			arretCorrige = "H. Region Montrochet";
		}
		return {
			ligne: v.Ligne,
			sens: v.Sens,
			destination: v.Destination,
			prochainArret: arretCorrige,
			carrosserie: v.NumeroCarrosserie,
			x: coord.latitude,
			y: coord.longitude,
			cap: v.Cap
		};
		});
	}

  } catch (err) {
    console.error("Erreur réseau ou parsing :", err);
    return [];
  }
}


function convertWebMercatorToWGS84(x, y) {
	const R = 6378137.0;
	const longitude = (x / R) * (180 / Math.PI);
	const latitude = (2 * Math.atan(Math.exp(y / R)) - (Math.PI / 2)) * (180 / Math.PI);
	return { latitude, longitude };
}

function placeTrains(ligne, trains) {
	const table = document.querySelector("table");
	if (!table || !ligne || !ligne.stations) return;

	// Mapping Antilope => abréviation
	const antilopeToAbrev = {};
	ligne.stations.forEach(station => {
		antilopeToAbrev[station.antilope] = station.abrev;
	});

	// Récupération des cellules de la ligne abréviée
	const abrevCells = [...table.querySelectorAll("tr.abrev td")];
	const stationAbrevs = abrevCells.map(cell => cell.textContent.trim());

	// Nettoyage des conteneurs
	const containers = table.querySelectorAll(".train-container");
	containers.forEach(c => (c.innerHTML = ""));

	// Cellule d'origine pour positionnement relatif
	const cell0 = abrevCells[0];
	if (!cell0) return;
	const originLeft = cell0.getBoundingClientRect().left;

	let infoTrains = [];
	trains.forEach(train => {
		const abrev = antilopeToAbrev[train.prochainArret];
		if (!abrev) {
			console.warn("pb abrev pour", train);
			return;
		}

		const idx = stationAbrevs.indexOf(abrev);
		if (idx === -1) {
			console.warn("pb idx -1 pour", train);
			return;
		}

		// Détermination des arrêts précédent/suivant en fonction du sens
		let arretPrecedent, arretSuivant;
		if (train.sens === "ALL" || train.sens === "1") {
			arretPrecedent = ligne.stations.find(s => s.ordre === idx);
			arretSuivant = ligne.stations.find(s => s.ordre === idx + 1);
		} else {
			arretPrecedent = ligne.stations.find(s => s.ordre === idx + 2);
			arretSuivant = ligne.stations.find(s => s.ordre === idx + 1);
		}

		if (!arretPrecedent || !arretSuivant) return;

		const idxPrecedent = stationAbrevs.indexOf(arretPrecedent.abrev);
		const idxSuivant = stationAbrevs.indexOf(arretSuivant.abrev);
		if (idxPrecedent === -1 || idxSuivant === -1) return;

		const cellA = abrevCells[idxPrecedent];
		const cellB = abrevCells[idxSuivant];
		if (!cellA || !cellB) return;

		// Récupération des positions visuelles
		let rectA = cellA.getBoundingClientRect();
		let rectB = cellB.getBoundingClientRect();

		// Calcul du ratio de progression entre les deux stations
		const ratio = getProgressRatio(
		{ lat: arretPrecedent.lat, lon: arretPrecedent.lon },
		{ lat: arretSuivant.lat, lon: arretSuivant.lon },
		{ lat: train.x, lon: train.y }
		);

		// Position horizontale relative à la première cellule
		const centerA = rectA.left + rectA.width / 2;
		const centerB = rectB.left + rectB.width / 2;
		const x = centerA + ratio * (centerB - centerA) - originLeft;


		// Sélection du bon conteneur
		const rowClass = train.sens === "ALL" || train.sens === "1" ? "emplacement1" : "emplacement2";
		const container = table.querySelector(`.train-container.${rowClass}`);
		if (!container) return;

		// Création du point
		const dot = document.createElement("span");
		dot.className = "train-dot";

		// Couleur selon ligne
		dot.style.backgroundColor = lineColor(train.ligne);

		// Direction
		dot.textContent = train.carrosserie;

		// Placement du point
		dot.style.left = `${x}px`;
		dot.style.top = "1px"; // ajustable selon ton design

		container.appendChild(dot);
		let infoTrain = {train, arretPrecedent, idxPrecedent, arretSuivant, idxSuivant};
		infoTrains.push(infoTrain);
	});
	return infoTrains;
}


function colorActiveButton() {
	const active = document.getElementsByClassName("active")[0];
	active.style.backgroundColor = lineColor(active.textContent);
}

function lineColor(line) {
	switch (line) {
		case "T1": return "#0860f0"; break;
		case "T2": return "#ee7945"; break;
		case "T3": return "#a900ff"; break;
		case "T4": return "#00b26c"; break;
		case "T5": return "#5138d3"; break;
		case "T6": return "#daec5c"; break;
		case "T7": return "#d7a0ff"; break;
		default: return "white";
	}
}

function parseCSV(csvText) {
	const lignes = csvText.trim().split("\n");
	const enTetes = lignes[0].split(",").map(t => t.trim());

	return lignes.slice(1).map(ligne => {
		const valeurs = ligne.split(",").map(val => val.trim().replace(/\r$/, ""));
		return Object.fromEntries(enTetes.map((cle, i) => [cle, valeurs[i] ?? ""]));
	});
}

function parseYYYYmmDD(str) {
  const year = parseInt(str.slice(0, 4), 10);
  const month = parseInt(str.slice(4, 6), 10) - 1; // JS: janvier = 0
  const day = parseInt(str.slice(6, 8), 10);
  return new Date(year, month, day);
}

function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function getPassages(ligne) {
	try {
		const response = await fetch("/api/passages");
		const data = await response.json();
		if (!data.success) {
			// Cas d'erreur (aucun résultat)
			afficherErreur(data.message);
		} else {
			const passagesFiltres = data.data.values.filter(p => p.ligne === ligne);
			const groupes = passagesFiltres.reduce((acc, passage) => {
				// Extraire le numéro de voiture de la course théorique
				const parts = passage.coursetheorique.split("_");
				const numseq = parts[2];
				const key = Number(numseq.substring(0, 3));

				// Si le groupe n'existe pas encore, on le crée
				if (!acc[key]) {
					acc[key] = [];
				}

				// Ajouter le passage dans le bon groupe
				acc[key].push(passage);

				return acc;
			}, {});

			const now = new Date();

			const prochainsPassages = Object.entries(groupes).reduce((acc, [key, passages]) => {
				// Convertir et filtrer les passages futurs
				const futurs = passages
					.map(p => ({
					...p,
					date: new Date(p.heurepassage.replace(" ", "T"))
					}))
					.filter(p => p.date > now);

				if (futurs.length > 0) {
					// Trier par heure croissante
					futurs.sort((a, b) => a.date - b.date);

					// Le premier est le plus proche
					acc[key] = futurs[0];
				} else {
					acc[key] = null; // ou tu peux simplement ne pas mettre la clé
				}

				return acc;
			}, {});
			// si le passage est dans plus de 15 min, on l'enlève de la liste car c'est sûrement une sortie de dépôt
			for (const [key, passage] of Object.entries(prochainsPassages)) {
				if (passage) {
					const diffMinutes = (passage.date - now) / 1000 / 60;
					if (diffMinutes > 15) {
						console.warn("Passage supprimé car dans + de 15min : ", key, passage);
						delete prochainsPassages[key];
					}
				} else {
					// si passage est null, on peut aussi le retirer
					delete prochainsPassages[key];
				}
			}
			return prochainsPassages;
		}
	} catch (err) {
		console.error("Erreur lors de la récupération des passages :", err);
	}
}

function associerAntilopeGrandLyon(ligne, trains, passages) {
	let liens = [];

	// utilitaires
	function trouverArretCorrespondant(idProchainArret, ligne) {
		for (const l of ligne.stations) {
			if (idProchainArret == l.id_all) return { arret: l, sens: "ALL" };
			if (idProchainArret == l.id_ret) return { arret: l, sens: "RET" };
		}
		return { arret: null, sens: "" };
	}

	function associerPassagesAuxTrains(passages, trains, offset = 0) {
		let passagesUtilises = new Set();
		let trainsUtilises = new Set();
		let nouveauxLiens = [];

		for (const [key, passage] of Object.entries(passages)) {
			const { arret, sens } = trouverArretCorrespondant(passage.id, ligne);
			if (!arret) continue;

			let arretRecherche = arret;
			let sensRecherche = sens;

			if (offset !== 0) {
				let nouvelOrdre =
					sens === "ALL" ? arret.ordre - offset : arret.ordre + offset;

				// cas normal
				if (nouvelOrdre >= 1 && nouvelOrdre <= ligne.stations.length) {
					arretRecherche = ligne.stations.find(l => l.ordre === nouvelOrdre);
				} else {
					// 🚦 bascule de sens si on sort des bornes
					if (nouvelOrdre < 1) {
						// On était en ALL, mais on sort avant le 1 → prendre ordre max en RET
						sensRecherche = "RET";
						arretRecherche = ligne.stations.find(l => l.ordre === ligne.stations.length);
					} else if (nouvelOrdre > ligne.stations.length) {
						// On était en RET, mais on sort après max → prendre ordre 1 en ALL
						sensRecherche = "ALL";
						arretRecherche = ligne.stations.find(l => l.ordre === 1);
					} else {
						arretRecherche = null;
						console.log("pas bon key", key);
					}
				}
			}

			if (!arretRecherche) continue;

			const idx = trains.findIndex(
				t => t.train.sens === sensRecherche && t.arretSuivant === arretRecherche
			);

			if (idx !== -1) {
				const t = trains[idx];
				console.log(
					`Correspondance trouvée (offset ${offset}, sens ${sensRecherche}) pour voiture ${key}`,
					t
				);

				nouveauxLiens.push({
					carrosserie: t.train.carrosserie,
					voiture: key,
					estDeduite: false
				});

				passagesUtilises.add(key);
				trainsUtilises.add(idx);
			}
		}

		// restants
		const passagesRestants = Object.fromEntries(
			Object.entries(passages).filter(([key]) => !passagesUtilises.has(key))
		);
		const trainsRestants = trains.filter((_, idx) => !trainsUtilises.has(idx));

		return { nouveauxLiens, passagesRestants, trainsRestants };
	}

	function getOrderedTrains() {
		const allStations = ligne.stations;
		const ordreMax = Math.max(...allStations.map(s => s.ordre));

		const trainsAll = trains
			.filter(i => i.train.sens === "ALL")
			.map(i => ({
				...i,
				ordre: allStations.find(s => s.antilope === i.train.prochainArret)?.ordre || ordreMax + 1
			}))
			.sort((a, b) => b.ordre - a.ordre); // Descendant pour ALL

		const trainsRet = trains
			.filter(i => i.train.sens === "RET")
			.map(i => ({
				...i,
				ordre: allStations.find(s => s.antilope === i.train.prochainArret)?.ordre || -1
			}))
			.sort((a, b) => a.ordre - b.ordre); // Croissant pour RET

		return[...trainsRet, ...trainsAll];
	}


	// === Première passe (offset 0) ===
	let { nouveauxLiens, passagesRestants, trainsRestants } =
		associerPassagesAuxTrains(passages, trains, 0);
	liens.push(...nouveauxLiens);

	// stop si tout est trouvé
	if (Object.keys(passagesRestants).length === 0) return liens;

	// === Deuxième passe (offset 1) ===
	({ nouveauxLiens, passagesRestants, trainsRestants } =
		associerPassagesAuxTrains(passagesRestants, trainsRestants, 1));
	liens.push(...nouveauxLiens);

	if (Object.keys(passagesRestants).length === 0) return liens;

	// === Troisième passe (offset 2) ===
	({ nouveauxLiens, passagesRestants, trainsRestants } =
		associerPassagesAuxTrains(passagesRestants, trainsRestants, 2));
	liens.push(...nouveauxLiens);

	console.log("Restants : ");
	console.log(passagesRestants);
	console.log(trainsRestants);
	// on prend un numéro de carosserie non attribué, on regarde si dans liens il y a une voiture attribuée au train précédent et au train suivant et du coup on lui met le numéro de voiture non attribué qui se trouve entre ceux des trains l'encadrant.
	// on cherche les trains dans leur ordre réel
	const trainsOrdonnes = getOrderedTrains();
	// trainsRestants.forEach(t => {
	// 	console.log("appel fonction avec train", t.train.carrosserie);
	// 	// recherche index du train dans la liste ordonnée
	// 	let trainO = trainsOrdonnes.find(tO => tO.train.carrosserie === t.train.carrosserie);
	// 	let index = trainsOrdonnes.indexOf(trainO);
	// 	console.log(index);
	// 	// recherche train avant et après
	// 	let indexTrainPrecedent;
	// 	let indexTrainSuivant;
	// 	if (index === 0) {
	// 		indexTrainPrecedent = index + 1;
	// 		indexTrainSuivant = trainsOrdonnes.length - 1;
	// 		console.log("indice 0 : ", indexTrainPrecedent, index, indexTrainSuivant);
	// 		console.log("indice 0 : ", trainsOrdonnes.indexOf(indexTrainPrecedent), t.train.carrosserie, trainsOrdonnes.indexOf(indexTrainSuivant));
	// 	} else if (index === trainsOrdonnes.length - 1) {
	// 		indexTrainPrecedent = 0;
	// 		indexTrainSuivant = index - 1;
	// 		console.log("indice max : ", indexTrainPrecedent, index, indexTrainSuivant);
	// 	}

	// })

	return liens;
}



function addVoituresToDots(liens, infoTrains) {
	if (!Array.isArray(liens)) {
		console.warn("Paramètre 'lien' invalide ou non défini");
		return;
	}

	const dots = Array.from(document.getElementsByClassName("train-dot"));
	if (!dots.length) {
		console.warn("Aucun dot trouvé");
		return;
	}

	dots.forEach(dot => {
		const lien = liens.find(l => l.carrosserie === parseInt(dot.textContent));
		const sens = infoTrains.find(i => i.train.carrosserie === parseInt(dot.textContent)).train.sens;
		if (lien && sens) {
			const voiture = lien.voiture === undefined ? "?" : parseInt(lien.voiture);
			dot.textContent = '';
			let ita = lien.estDeduit ? "ita" : "";
			if (sens === "RET") {
				// on met le tableau avec la flèche vers la gauche
				dot.innerHTML = `<table><tbody><tr><td rowspan="2">◀</td><td>${lien.carrosserie}</td></tr><tr><td class="${ita}">V${voiture}</td></tr></tbody></table>`;
			} else {
				dot.innerHTML = `<table><tbody><tr><td>${lien.carrosserie}</td><td rowspan="2">▶</td></tr><tr><td class="${ita}">V${voiture}</td></tr></tbody></table>`;
			}
		}
	});
}

function buildListeVoitures(passages) {
	const main = document.getElementsByClassName("main")[0];
	const title = document.createElement("span");
	title.textContent = "Voitures normalement présentes : ";
	const ul = document.createElement("ul");
	for (const [key, passage] of Object.entries(passages)) {
		const li = document.createElement("li");
		li.textContent = key;
		ul.appendChild(li);
	}
	main.appendChild(title);
	main.appendChild(ul);
}

async function init() {
	const lignes = await fetchLignes();
	const ligneNom = getParam('ligne');
	const ligne = lignes.find(l => l.nom === ligneNom);

	if (!ligne) {
		const main = document.getElementsByClassName("main")[0];
		main.innerHTML = `<p>Ligne "${ligneNom}" introuvable.</p>`;
		return;
	}

	buildTable(ligne);

	buildMenu(ligneNom);

	const trains = await fetchVehiculesForLigne(ligneNom);
	const saved = localStorage.getItem("snapshot_T4");
	// const trains = JSON.parse(saved);
	
	if (trains) {
		const infoTrains = placeTrains(ligne, trains);
		// récupérer les passages les plus proches de chaque voiture de la ligne choisie
		const passages = await getPassages(ligneNom);

		if (passages) {
			buildListeVoitures(passages);
			const liens = associerAntilopeGrandLyon(ligne, infoTrains, passages);
			console.log(liens);
			addVoituresToDots(liens, infoTrains);
		}
	}

	

	colorActiveButton();
}

function getProgressRatio(A, B, T) {
	const dx = B.lon - A.lon;
	const dy = B.lat - A.lat;
	const lengthSquared = dx * dx + dy * dy;

	if (lengthSquared === 0) return 0;

	const tx = T.lon - A.lon;
	const ty = T.lat - A.lat;

	const dot = tx * dx + ty * dy;
	const ratio = dot / lengthSquared;

	// Clamp entre 0 et 1
	return Math.max(0, Math.min(1, ratio));
}

init();
