let arrets = [];
let lignes = [];
let traces = [];
let layersParLigne = {};
const lignesFiltrees = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "RX"];
const dateActuelle = new Date();
const eyeOpenSVG = `
<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none"
	xmlns="http://www.w3.org/2000/svg">
	<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"
		stroke="currentColor" stroke-width="2"/>
	<circle cx="12" cy="12" r="3"
		stroke="currentColor" stroke-width="2"/>
</svg>
`;

const eyeClosedSVG = `
<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none"
	xmlns="http://www.w3.org/2000/svg">
	<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"
		stroke="currentColor" stroke-width="2"/>
	<circle cx="12" cy="12" r="3"
		stroke="currentColor" stroke-width="2"/>
	<line x1="3" y1="21" x2="21" y2="3"
		stroke="currentColor" stroke-width="2"/>
</svg>
`;

let eyesParLigne = {}; // { T1: { eye, setVisible } }



function addNote(message, type = "info", duration = 5000) {
	// 🔹 Créer la note
	const note = document.createElement("div");
	note.classList.add("note", type);
	note.textContent = message;

	// 🔹 Trouver où l’insérer : juste avant la légende
	const legende = document.getElementById("legende");
	if (!legende || !legende.parentNode) {
		console.warn("Impossible d'afficher la note : conteneur non trouvé");
		return;
	}
	legende.parentNode.insertBefore(note, legende);

	// 🔹 Positionner les notes empilées sans se chevaucher
	const allNotes = document.querySelectorAll(".note");
	allNotes.forEach((n, i) => {
		n.style.top = `${10 + i * 30}px`; // espace vertical entre les notes
	});

	// 🔹 Disparition automatique
	if (duration > 0) {
		setTimeout(() => {
			note.style.transition = "opacity 0.3s ease, transform 0.3s ease";
			note.style.opacity = "0";
			note.style.transform = "translateY(-5px)";
			setTimeout(() => note.remove(), 300);
		}, duration);
	}
}

async function chargerArrets() {
	try {
		// Récupération du JSON
		const response = await fetch("./data/points-arret-reseau-transports-commun-lyonnais.json");
		if (!response.ok) {
			throw new Error("Erreur de chargement du fichier JSON");
		}

		const json = await response.json();

		// Extraction des données utiles
		const arrets = json.values.map(item => ({
			id: item.id,
			nom: item.nom,
			desserte: parseDesserte(item.desserte),
			lat: item.lat,
			lon: item.lon,
			adresse: item.adresse,
			commune: item.commune,
			insee: item.insee
		}));

		return arrets;
	} catch (err) {
		console.error("Impossible de charger les arrêts :", err);
		addNote("Erreur API Elliot : impossible de charger les arrêts", "error", 0);
	}
}

async function chargerLignes() {
  const response = await fetch('data/lignes.json');
  return await response.json();
}

function parseDesserte(desserteStr) {
	if (!desserteStr) return [];
	return desserteStr.split(",").map(part => {
		const [ligne, codeSens] = part.split(":");
		return {
			ligne,
			sens: codeSens === "A" ? "Aller" : "Retour"
		};
	});
}

async function fetchSiri() {
	try {
		const response = await fetch("/siri/vehicle-monitoring");

		// Si l'API renvoie une erreur (ex : 500)
		if (!response.ok) {
			console.error(`Erreur API SIRI: ${response.status} ${response.statusText}`);
			addNote("Erreur Grand Lyon : API SIRI indisponible", "error", 0);
			return [];
		}

		const data = await response.json();

		// Si ton propre backend renvoie déjà success: false
		if (!data.success) {
			addNote(data.message || "Erreur API Grand Lyon : API SIRI indisponible", "error", 0);
			return [];
		}

		// Traitement normal
		let listeVehicules = data.data.Siri.ServiceDelivery.VehicleMonitoringDelivery[0].VehicleActivity;

		if (listeVehicules && listeVehicules.length === 0) {
			console.warn("Aucun véhicule retourné par SIRI (liste vide)");
			return [];
		}

		let filtreVehicules = listeVehicules
			.filter(v => lignesFiltrees.includes(v.MonitoredVehicleJourney.LineRef.value.split(":")[3]))
			.map(v => v.MonitoredVehicleJourney);

		if (filtreVehicules.length === 0) {
			console.warn("Aucun véhicule correspondant au filtre retourné par SIRI");
			addNote("Erreur API Grand Lyon : pas de véhicule trouvé", "error", 0);
			return [];
		}

		// Tout est bon
		return filtreVehicules;

	} catch (error) {
		// Cas d'erreur réseau ou autre exception JS
		console.error("Erreur lors de la récupération SIRI :", error);
		addNote("Erreur API Grand Lyon : problème avec l'API SIRI", "error", 0);
		return [];
	}
}

function traiterSiri(listeVehicules) {
	let objetsVehicules = [];
	if (listeVehicules) {
		listeVehicules.forEach(v => {
			let ligne = v.LineRef.value.split(":")[3];
			let carrosserie = v.VehicleRef.value.split(":")[3];
			let voiture = parseInt(v.FramedVehicleJourneyRef.DatedVehicleJourneyRef.split(":")[3].slice(-8).substring(0,3));
			let position = {latitude: v.VehicleLocation.Latitude, longitude: v.VehicleLocation.Longitude};
			let terminus = arrets.find(a => a.id == v.DestinationRef.value.split(":")[3]);
			if (!terminus) {
				console.warn("Terminus " + v.DestinationRef.value.split(":")[3] + " non trouvée dans la liste des arrêts");
				addNote("Terminus " + v.DestinationRef.value.split(":")[3] + " non trouvée dans la liste des arrêts", "info", 10000);
			}
			let sens = v.DirectionRef.value === "Forward" ? "Aller" : "Retour";
			let timing = parseTiming(v.Delay);
			let prochainArret = arrets.find(a => a.id == v.MonitoredCall.StopPointRef.value.split(":")[3]);
			if (!prochainArret) {
				console.warn("Prochain arrêt " + v.MonitoredCall.StopPointRef.value.split(":")[3] + " non trouvée dans la liste des arrêts");
			}
			objetsVehicules.push({
				ligne: ligne,
				carrosserie: carrosserie,
				voiture: voiture,
				prochainArret: prochainArret,
				terminus: terminus,
				sens: sens,
				timing: timing,
				position: position
			})
		});
	}
	return objetsVehicules;
}

function parseTiming(dureeStr) {
	if (!dureeStr) return 0;

	// Vérifie si la durée est négative (avance)
	const isNegative = dureeStr.startsWith("-");
	// Enlève le signe pour faciliter le parsing
	const cleanStr = dureeStr.replace("-", "");

	// Regex pour capter les minutes et secondes
	const regex = /PT(?:(\d+)M)?(?:(\d+)S)?/;
	const match = cleanStr.match(regex);

	if (!match) return 0;

	const minutes = match[1] ? parseInt(match[1], 10) : 0;
	const secondes = match[2] ? parseInt(match[2], 10) : 0;

	let total = minutes * 60 + secondes;

	return isNegative ? -total : total;
}

function formatDateSQL(date) {
	const pad = n => String(n).padStart(2, "0");
	return (
		date.getFullYear() +
		"-" + pad(date.getMonth() + 1) +
		"-" + pad(date.getDate()) +
		" " + pad(date.getHours()) +
		":" + pad(date.getMinutes()) +
		":" + pad(date.getSeconds())
	);
}

function convertWebMercatorToWGS84(x, y) {
	const R = 6378137.0;
	const longitude = (x / R) * (180 / Math.PI);
	const latitude = (2 * Math.atan(Math.exp(y / R)) - (Math.PI / 2)) * (180 / Math.PI);
	return { latitude, longitude };
}

async function envoyerListe(listeVehicules) {
	const dateSQL = formatDateSQL(dateActuelle);
	const response = await fetch("/db/send", {
		method: "POST",
		headers: {
		"Content-Type": "application/json"
		},
		body: JSON.stringify({
			listeVehicules: listeVehicules,
			dateSQL: dateSQL
		})
	});

	const data = await response.json();
}

function simplifierChaine(chaine) {
  return chaine
    .toLowerCase()                           // Met en minuscules
    .normalize('NFD')                        // Sépare les lettres des accents
    .replace(/[\u0300-\u036f]/g, '')         // Supprime les accents
    .replace(/[^a-z]/g, '');                 // Supprime tout sauf les lettres a-z
}

async function fetchEtTraiterTousVehicules() {
	const MAX_RETRY = 1;
	const RETRY_DELAY = 500; // ms (0.5 seconde entre chaque tentative)

	async function fetchAvecRetry(ligne, tentative = 1) {
		try {
			const response = await fetch(`/api/vehicules?ligne=${ligne}`);

			if (!response.ok) {
				console.warn(`Erreur HTTP ${response.status} pour la ligne ${ligne} (tentative ${tentative})`);
				throw new Error(`HTTP ${response.status}`);
			}

			const data = await response.json();

			if (!data.success) {
				console.warn(`Erreur API pour la ligne ${ligne} : ${data.message} (tentative ${tentative})`);
				throw new Error("Aucune donnée");
			}

			// ✅ OK, on traite les véhicules reçus
			return (data.data.Vehicules || []).map(v => {
				const coord = convertWebMercatorToWGS84(v.X, v.Y);
				const arretsLigne = lignes.find(l => l.nom === v.Ligne);
				const arretLigne = arretsLigne?.stations.find(a => simplifierChaine(a.antilope) === simplifierChaine(v.Destination));
				let terminus;
				if (arretLigne) {
				terminus = (v.Sens === "ALL")
					? arrets.find(a => a.id === arretLigne.id_all)
					: arrets.find(a => a.id === arretLigne.id_ret);
				} else {
					console.warn("Pas d'arrêt trouvé dans le fichier JSON pour la destination", v.Destination);
					addNote(`Pas d'arrêt trouvé dans le fichier JSON pour ${v.Destination}`);
				}

				return {
				ligne: v.Ligne,
				carrosserie: v.NumeroCarrosserie,
				voiture: undefined,
				x: coord.latitude,
				y: coord.longitude,
				terminus: terminus,
				sens: v.Sens === "ALL" ? "Aller" : "Retour",
				cap: v.Cap
				};
			});

		} catch (err) {
			// 🔁 Nouvelle tentative tant qu'on n’a pas atteint MAX_RETRY
			if (tentative < MAX_RETRY) {
				console.warn(`Nouvelle tentative ${tentative + 1}/${MAX_RETRY} pour la ligne ${ligne}...`);
				await new Promise(r => setTimeout(r, RETRY_DELAY));
				return fetchAvecRetry(ligne, tentative + 1);
			} else {
				console.error(`Échec après ${MAX_RETRY} tentatives pour la ligne ${ligne}`);
				// à remettre après retour d'Antilope ===============================================
				// addNote(`Erreur API Antilope : aucun véhicule pour la ligne ${ligne}`, "warning", 5000);
				return []; // On renvoie un tableau vide pour ne pas bloquer
			}
		}
	}

	// 🧩 Exécute toutes les lignes sans bloquer les autres
	const promesses = lignesFiltrees.map(ligne => fetchAvecRetry(ligne));

	// Promise.allSettled pour continuer même si certaines échouent
	const resultats = await Promise.allSettled(promesses);

	// On récupère uniquement les valeurs réussies
	const tousVehicules = resultats
		.filter(r => r.status === "fulfilled")
		.flatMap(r => r.value);
	console.log("tous véhicules : ", tousVehicules);
	return tousVehicules;
}


function fusionListes(antilope, objetsVehicules) {
	console.log("antilope et objets : ", antilope, objetsVehicules);
	let aTraiter = [];
	antilope.forEach(a => {
		let trouve = false;
		objetsVehicules.forEach(v => {
			if (a.carrosserie === parseInt(v.carrosserie)) {
				trouve = true;
			}
		})
		if (!trouve) {
			aTraiter.push(a);
		}
	})
	console.log(aTraiter);
	return aTraiter;
}

async function rechercheBD(aTraiter) {
	const response = await fetch("/db/lookup", {
		method: "POST",
		headers: {
		"Content-Type": "application/json"
		},
		body: JSON.stringify({
			aTraiter: aTraiter,
			dateActuelle: dateActuelle
		})
	});

	const data = await response.json();
	return data;
}

function lineColor(line) {
	switch (line) {
		case "T1": return "rgb(230, 57, 80)"; break;
		case "T2": return "rgb(245, 140, 31)"; break;
		case "T3": return "rgb(38, 201, 90)"; break;
		case "T4": return "rgb(136, 63, 152)"; break;
		case "T5": return "rgb(29, 144, 160)"; break;
		case "T6": return "rgb(0, 192, 209)"; break;
		case "T7": return "rgb(38, 131, 225)"; break;
		case "RX": return "rgb(255, 0, 0)"; break;
		default: return "black";
	}
}

let marqueursParLigne = {}; // stocke tous les marqueurs par ligne et par voiture
lignesFiltrees.forEach(l => {
	marqueursParLigne[l] = {};
})

function bearing(lat1, lon1, lat2, lon2) {
	const toRad = deg => deg * Math.PI / 180;
	const toDeg = rad => rad * 180 / Math.PI;

	const phi1 = toRad(lat1);
	const phi2 = toRad(lat2);
	const deltagamma = toRad(lon2 - lon1);

	const y = Math.sin(deltagamma) * Math.cos(phi2);
	const x = Math.cos(phi1) * Math.sin(phi2) -
				Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltagamma);

	let theta = Math.atan2(y, x);
	let cap = (toDeg(theta) + 360) % 360;

	return cap; // en degrés
}

function createVehiculeMarker(v, map) {
	const couleur = lineColor(v.ligne);
	const voiture = v.voiture ?? "?";
	const carrosserie = v.carrosserie ?? "???";
	const cap = bearing(v.position.latitude, v.position.longitude, v.terminus.lat, v.terminus.lon);
	let terminus = v.terminus?.nom ?? "Terminus inconnu";

	const html = `
	<div style="
		position: relative;
		width: 30px;
		height: 30px;
		display: flex;
		justify-content: center;
		align-items: center;
	">
		<!-- SVG tournant -->
		<div style="
		position:absolute;
		width:30px;
		height:30px;
		transform: rotate(${cap}deg);
		">
		<svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="3" y="3" width="24" height="24" rx="12" fill="white"/>
			<path d="M15 0L21.9282 5.25H8.0718L15 0Z" fill="${couleur}"/>
		</svg>  
		</div>
		
		<!-- Texte centré -->
		<div style="
		position:absolute;
		color:${couleur};
		font-size:9px;
		font-weight:bold;
		line-height:1.1;
		text-align:center;
		">
		<div>${v.carrosserie ?? ""}</div>
		<div>${voiture}</div>
		</div>
	</div>
	`;

	const icon = L.divIcon({
		html: html,
		className: "",
		iconSize: [30, 30],
		iconAnchor: [15, 15],
		popupAnchor: [0, -15]
	});

	let timingBeau;
	if (v.timing != null) {
		const min = Math.floor(Math.abs(v.timing) / 60);
		const sec = Math.abs(v.timing) % 60;
		const signe = v.timing < 0 ? "-" : "+";
		timingBeau = min > 0
		? `${signe}${min}m${('0' + sec).slice(-2)}s`
		: `${signe}${sec}s`;
	}

	const marker = L.marker([v.position.latitude, v.position.longitude], { icon })
		.bindPopup(`${terminus} ${(timingBeau ?? "")}`);

	marker.options.voitureData = { voiture: v.voiture, carrosserie: v.carrosserie, timing: timingBeau ?? "" };


	// Stockage par ligne et par voiture
	marqueursParLigne[v.ligne][carrosserie] = marker;

	return marker;
}

function setLigneVisibility(map, ligne, visible) {
	const layer = layersParLigne[ligne];
	if (!layer) return;

	if (visible) {
		layer.markers.addTo(map);
		layer.trace.addTo(map);
	} else {
		layer.markers.removeFrom(map);
		layer.trace.removeFrom(map);
	}
}


function setupLegende(map) {
	const legende = document.getElementById('legende');
	legende.innerHTML = "<h3>Véhicules</h3>";

	// Boutons globaux
	const globalControls = document.createElement('div');
	globalControls.style.display = "flex";
	globalControls.style.gap = "10px";
	globalControls.style.marginBottom = "10px";
	globalControls.style.justifyContent = "center";

	// Bouton tout afficher
	const btnShowAll = document.createElement('button');
	btnShowAll.innerHTML = `${eyeOpenSVG} Tout afficher`;
	btnShowAll.style.display = "flex";
	btnShowAll.style.alignItems = "center";
	btnShowAll.style.gap = "4px";

	// Bouton tout cacher
	const btnHideAll = document.createElement('button');
	btnHideAll.innerHTML = `${eyeClosedSVG} Tout cacher`;
	btnHideAll.style.display = "flex";
	btnHideAll.style.alignItems = "center";
	btnHideAll.style.gap = "4px";

	btnShowAll.addEventListener('click', () => {
		Object.values(eyesParLigne).forEach(({ setVisible }) => setVisible(true));
	});

	btnHideAll.addEventListener('click', () => {
		Object.values(eyesParLigne).forEach(({ setVisible }) => setVisible(false));
	});


	globalControls.appendChild(btnShowAll);
	globalControls.appendChild(btnHideAll);
	legende.appendChild(globalControls);

	

	// Parcours des lignes
	Object.keys(marqueursParLigne).sort().forEach(ligne => {
		const divLigne = document.createElement('div');
		divLigne.style.marginBottom = "10px";

		const header = document.createElement('div');
		header.style.display = "flex";
		header.style.alignItems = "center";
		header.style.justifyContent = "center";
		header.style.gap = "6px";

		// Texte "Ligne T1"
		const titre = document.createElement('b');
		titre.textContent = `Ligne ${ligne}`;

		// Icône œil
		const eye = document.createElement('span');
		eye.innerHTML = eyeOpenSVG;
		eye.style.cursor = "pointer";
		eye.style.display = "inline-flex";
		eye.style.alignItems = "center";

		let visible = true;

		function setVisible(state) {
			visible = state;
			eye.innerHTML = visible ? eyeOpenSVG : eyeClosedSVG;
			eye.style.opacity = visible ? "1" : "0.4";
			setLigneVisibility(map, ligne, visible);
		}


		eye.addEventListener('click', () => {
			setVisible(!visible);
			console.log(`Ligne ${ligne} visible =`, visible);
		});

		eyesParLigne[ligne] = { setVisible };


		header.appendChild(titre);
		header.appendChild(eye);
		divLigne.appendChild(header);


		const ul = document.createElement('ul');
		ul.style.listStyle = "none";
		ul.style.paddingLeft = "5px";

		// Parcours des voitures triées
		Object.keys(marqueursParLigne[ligne])
		.sort((a, b) => {
			const dataA = marqueursParLigne[ligne][a].options.voitureData;
			const dataB = marqueursParLigne[ligne][b].options.voitureData;

			const voitureA = dataA.voiture === null ? 100 : parseInt(dataA.voiture);
			const voitureB = dataB.voiture === null ? 100 : parseInt(dataB.voiture);

			return voitureA - voitureB;
		})
		.forEach(carrosserie => {
			const marker = marqueursParLigne[ligne][carrosserie];
			const timing = marker.options.voitureData?.timing ?? "";
			const voiture = marker.options.voitureData.voiture ?? "?";

			const li = document.createElement('li');
			li.style.cursor = "pointer";
			
			li.textContent = `V${voiture} - ${carrosserie} (${timing})`;
			if (timing === "") {
				li.textContent = `V${voiture} - ${carrosserie}`;
			}
			

			li.addEventListener('click', () => {
				map.flyTo(marker.getLatLng(), 16);
				marker.openPopup();
			});

			ul.appendChild(li);
		});


		divLigne.appendChild(ul);
		legende.appendChild(divLigne);
	});
}

function setupMap(listeVehicules) {
	const map = L.map('map').setView([45.75, 4.85], 12);

	L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM contributors</a>'
	}).addTo(map);

	// Création des layers par ligne
	traces.features.forEach(feature => {
		const ligne = feature.properties.ligne;

		if (!layersParLigne[ligne]) {
			layersParLigne[ligne] = {
				markers: L.layerGroup().addTo(map),
				trace: L.layerGroup().addTo(map)
			};
		}

		L.geoJSON(feature, {
			style: {
				color: lineColor(ligne),
				weight: 2,
				opacity: 0.9
			}
		}).addTo(layersParLigne[ligne].trace);
	});

	L.control.locate({
		position: "topleft",
		flyTo: true,
		strings: { title: "Me localiser" }
	}).addTo(map);

	// Ajout des marqueurs
	listeVehicules.forEach(v => {
		const marker = createVehiculeMarker(v, map);
		const ligne = v.ligne;

		if (layersParLigne[ligne]) {
			marker.removeFrom(map); // on enlève du map direct
			layersParLigne[ligne].markers.addLayer(marker);
		}
	});

	// Ajout effectif des markers par ligne
	Object.values(layersParLigne).forEach(l => l.markers.addTo(map));

	setupLegende(map);
	return map;
}

async function fetchTraces() {
	const res = await fetch("data/sytral_tcl_sytral.tcllignetram_2_0_0-2.json");
	const data = await res.json();
	return data;
}

function jointure(siri, antilope, trouvees) {
	console.log("siri : ", siri);
	console.log("antilope : ", antilope);
	console.log("trouvees : ", trouvees);
	let retour = [];
	if (antilope.length > 0) {
		antilope.forEach(a => {
			// console.log(a);
			// Chercher dans Siri si on a le véhicule avec même ligne et carrosserie existant
			const s = siri.find(s => s.ligne === a.ligne && parseInt(s.carrosserie) === a.carrosserie);
			const t = trouvees.find(t => t.ligne === a.ligne && t.carrosserie === a.carrosserie);
			let voiture;
			let timing;
			if (s) {
				// console.log("Trouvée dans siri : ", s);
				voiture = s.voiture;
				timing = s.timing;
			} else if (t) {
				// console.log("Trouvée dans trouvees : ", t);
				voiture = t.voiture;
			} else {
				console.warn("Pas trouvée dans siri ni trouvees : ", a);
			}
			retour.push({
				ligne: a.ligne,
				carrosserie: a.carrosserie,
				voiture: voiture,
				cap: a.cap,
				sens: a.sens,
				timing: timing,
				terminus: a.terminus,
				position: {
					latitude: a.x,
					longitude: a.y
				}
			})
		});
	} else if (siri.length > 0) {
		console.log("aucune donnée retournée par antilope");
		// addNote("API Antilope indisponible : position des véhicules imprécise (décalage possible)", type = "info", 0);
		siri.forEach(s => {
			retour.push({
				ligne: s.ligne,
				carrosserie: s.carrosserie,
				voiture: s.voiture,
				cap: 0,
				sens: s.sens,
				timing: s.timing,
				terminus: s.terminus,
				position: {
					latitude: s.position.latitude,
					longitude: s.position.longitude
				}
			})
		})
	}
	return retour;
}


async function init() {
	const listeVehicules = await fetchSiri();
	arrets = await chargerArrets();
	lignes = await chargerLignes();

	let objetsVehicules = traiterSiri(listeVehicules); // safe car [] si erreur
	envoyerListe(listeVehicules);

	const antilope = await fetchEtTraiterTousVehicules();
	const aTraiter = fusionListes(antilope, objetsVehicules);
	const voituresTrouvees = await rechercheBD(aTraiter);
	traces = await fetchTraces();

	const listeFinale = jointure(objetsVehicules, antilope, voituresTrouvees.data);
	const carte = setupMap(listeFinale);

	addNote("Erreur API Grand Lyon : aucune donnée pour les lignes de Saint-Priest", "error", 60000);
}


init();