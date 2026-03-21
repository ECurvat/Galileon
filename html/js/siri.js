const lignesFiltrees = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "RX"];
const arretsReleve = [/* T1 */ 46160,
					/* T2 */ 33222, 32582, 32583,
					/* T3 */ 35676,
					/* T4 */ 45883,	45884,
					/* T5 */ 45271,
					/* T6 */ 47313,	47314,
					/* T7 */ 47685
];
let isPageVisible = true;

function setupVisibilityHandling() {
	document.addEventListener("visibilitychange", () => {
		isPageVisible = !document.hidden;

		if (!isPageVisible) {
			console.log("⏸️ Onglet inactif → pause refresh");
		} else {
			console.log("▶️ Onglet actif → reprise refresh");
		}
	});
}

const visite = {
	referrer: document.referrer || null,

	session_id: null,

	language: navigator.language,
	timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

	user_agent: navigator.userAgent,
	platform: navigator.platform,

	screen_width: screen.width,
	screen_height: screen.height,
	device_pixel_ratio: window.devicePixelRatio,

	is_touch: 'ontouchstart' in window ? 1 : 0,

	connection_type: navigator.connection?.effectiveType ?? null
};

function sendVisite() {
	fetch('/db/send-visite', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(visite)
	});
}

function sendVehicules(listeVehicules) {
	fetch('/db/send-vehicules', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(listeVehicules)
	});
}


/* ===============================================================================================

											GESTION SIRI

	============================================================================================== */

/* 
	- Récupérer les données depuis le back-end
	Utilisé dans l'initialisation
	=> Renvoie une liste de véhicules dont la ligne est dans lignesFiltrees
*/
async function fetchSiri() {
	try {
		const response = await fetch("/siri/vehicle-monitoring");

		if (!response.ok) {
			console.error(`Erreur API SIRI: ${response.status} ${response.statusText}`);
			addNote("Erreur Grand Lyon : API SIRI (VM) indisponible", "error", 0);
			return [];
		}

		const data = await response.json();

		if (!data.success) {
			addNote(data.message || "Erreur API Grand Lyon : API SIRI (VM) indisponible", "error", 0);
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
			addNote("Erreur API Grand Lyon : pas de véhicule trouvé pour le filtre", "error", 0);
			return [];
		}

		// Tout est bon
		return filtreVehicules;

	} catch (error) {
		console.error("Erreur lors de la récupération SIRI :", error);
		addNote("Erreur API Grand Lyon : problème avec l'API SIRI", "error", 0);
		return [];
	}
}

/* 
	- Récupérer les données horaires depuis le back-end
	Utilisé dans l'initialisation
	=> Renvoie une liste de véhicules avec ses horaires de passage aux prochains arrêts (jusqu'au prochain terminus)
*/
async function fetchSiriET() {
	try {
		const response = await fetch("/siri/estimated-timetables");

		if (!response.ok) {
			console.error(`Erreur API SIRI: ${response.status} ${response.statusText}`);
			addNote("Erreur Grand Lyon : API SIRI (ET) indisponible", "error", 0);
			return [];
		}

		const data = await response.json();

		if (!data.success) {
			addNote(data.message || "Erreur API Grand Lyon : API SIRI (ET) indisponible", "error", 0);
			return [];
		}

		let listeHoraires = data.data.Siri.ServiceDelivery.EstimatedTimetableDelivery[0].EstimatedJourneyVersionFrame[0].EstimatedVehicleJourney;
		let filtreHoraires = listeHoraires
			.filter(h => lignesFiltrees.includes(h.LineRef.value.split(":")[3]));

		if (filtreHoraires.length === 0) {
			console.warn("Aucun horaire correspondant au filtre retourné par SIRI");
			addNote("Erreur API Grand Lyon : pas d'horaire trouvé pour le filtre", "error", 0);
			return [];
		}

		// Tout est bon
		return filtreHoraires;

	} catch (error) {
		console.error("Erreur lors de la récupération SIRI (ET) :", error);
		addNote("Erreur API Grand Lyon : problème avec l'API SIRI (ET)", "error", 0);
		return [];
	}
}

/* 
	- Récupérer les incidents d'exploitation depuis le back-end
	Utilisé dans l'initialisation
	=> Renvoie la liste des incidents en cours côté tramway
*/
async function fetchSiriSE() {
	try {
		const response = await fetch("/siri/situation-exchange");

		if (!response.ok) {
			console.error(`Erreur API SIRI: ${response.status} ${response.statusText}`);
			// addNote("Erreur Grand Lyon : API SIRI (SE) indisponible", "error", 0);
			return [];
		}

		const data = await response.json();

		if (!data.success) {
			addNote(data.message || "Erreur API Grand Lyon : API SIRI (SE) indisponible", "error", 0);
			return [];
		}

		let listeIncidents = data.data.Siri.ServiceDelivery.SituationExchangeDelivery[0].Situations.PtSituationElement;
		let filtreIncidents = listeIncidents
			.filter(i => lignesFiltrees.includes(i.Consequences.Consequence[0].Affects.Networks.AffectedNetwork[0].AffectedLine[0].LineRef.value.split(":")[3]));
		console.log(filtreIncidents);
		// if (filtreIncidents.length === 0) {
		// 	return [];
		// }

		// Tout est bon
		return [];

	} catch (error) {
		console.error("Erreur lors de la récupération SIRI (SE) :", error);
		addNote("Erreur API Grand Lyon : problème avec l'API SIRI (SE)", "error", 0);
		return [];
	}
}

/* 
	- Traiter les véhicules récupérés par le back-end
	Utilisé dans l'initialisation
	Dépend de parseTiming
	=> Renvoie une liste d'objets (véhicules) avec les infos intéressantes
*/
function traiterSiri(listeVehicules, listeHoraires) {
	let objetsVehicules = [];
	if (listeVehicules) {
		listeVehicules.forEach(v => {
			let horaire = listeHoraires.find(h => h.FramedVehicleJourneyRef.DatedVehicleJourneyRef == v.FramedVehicleJourneyRef.DatedVehicleJourneyRef);
			let passages = [];
			if (horaire) {
				horaire.EstimatedCalls.EstimatedCall.forEach(h => {
					let ordre = h.Order;
					let arret = arrets.find(a => a.id == h.StopPointRef.value.split(":")[3]);
					let heure;
					if (h.ExpectedArrivalTime) {
						heure = h.ExpectedArrivalTime;
					} else {
						heure = h.AimedArrivalTime;
					}
					passages.push({
						ordre: ordre,
						arret: arret,
						heure: heure
					})
				})
			}
			let ligne = v.FramedVehicleJourneyRef.DatedVehicleJourneyRef.split(":")[3].slice(4).substring(0,2);
			let carrosserie = v.VehicleRef.value.split(":")[3];
			let voiture = parseInt(v.FramedVehicleJourneyRef.DatedVehicleJourneyRef.split(":")[3].slice(-8).substring(0,3));
			let position = {latitude: v.VehicleLocation.Latitude, longitude: v.VehicleLocation.Longitude};
			let terminus = arrets.find(a => a.id == v.DestinationRef.value.split(":")[3]);
			let bearing = v.Bearing;
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
				cap: bearing,
				terminus: terminus,
				sens: sens,
				timing: timing,
				passages: passages,
				position: {
					latitude: position.latitude,
					longitude: position.longitude
				}
			})
		});
	}
	return objetsVehicules;
}

/*
	- Classer les horaires de passage par arrêt
	Appelé lors de l'initialisation et au rafraîchissement
	=> Renvoie une Map d'id d'arrêts et des prochains passages à cet arrêt
*/
function traiterHoraires(listeHoraires) {
	let horairesArrets = new Map();

	listeHoraires.forEach(h => {
		let terminus = arrets.find(a => a.id == h.DestinationRef.value.split(":")[3]);
		let ligne = h.LineRef.value.split(":")[3];
		let voiture = parseInt(h.FramedVehicleJourneyRef.DatedVehicleJourneyRef.split(":")[3].slice(-8).substring(0,3));
		h.EstimatedCalls.EstimatedCall.forEach(p => {
			let arret = arrets.find(a => a.id == p.StopPointRef.value.split(":")[3]);
			let ordre = p.Order;
			let heure;
			if (h.ExpectedArrivalTime) {
				heure = p.ExpectedArrivalTime;
			} else {
				heure = p.AimedArrivalTime;
			}
			if (horairesArrets.has(arret.id)) {
				horairesArrets.get(arret.id).push({
					ligne: ligne,
					voiture: voiture,
					terminus: terminus,
					heure
				})
			} else {
				horairesArrets.set(arret.id, [{
					ligne: ligne,
					voiture: voiture,
					terminus: terminus,
					heure
				}])
			}
		})
	})

	for (const [id, passages] of horairesArrets.entries()) {
		// supprimer doublons
		const uniques = Array.from(
			new Map(
				passages.map(p => [
					`${p.ligne}-${p.voiture}-${p.heure}`,
					p
				])
			).values()
		);

		// trier par heure
		uniques.sort((a, b) => new Date(a.heure) - new Date(b.heure));

		// remettre dans la map
		horairesArrets.set(id, uniques);
	}
	return horairesArrets;
}

/* ===============================================================================================

											GESTION CARTE

	============================================================================================== */

let traces = [];
let layersParLigne = {};
let eyesParLigne = {};
let marqueursParLigne = {}; // stocke tous les marqueurs par ligne et par voiture
let markersArrets = new Map();
let mapInstance = null;

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

const refreshSVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="mi-outline mi-refresh-bold" viewBox="0 0 24 24">
  <path d="M20.57 4.03c-.57-.24-1.2-.11-1.63.33l-.59.59a9.52 9.52 0 0 0-7.19-2.41c-4.47.39-8.08 3.9-8.58 8.36-.31 2.75.52 5.4 2.35 7.44a9.52 9.52 0 0 0 7.08 3.17c3.69 0 6.97-2.08 8.56-5.42.24-.51.21-1.1-.09-1.58-.3-.47-.81-.75-1.37-.75-.63 0-1.19.35-1.44.89a6.26 6.26 0 0 1-5.65 3.61c-3.33 0-6.2-2.81-6.25-6.15-.03-1.69.61-3.28 1.8-4.48a6.2 6.2 0 0 1 4.45-1.87c1.48 0 2.9.53 4.03 1.51L14.5 8.82c-.44.44-.56 1.06-.33 1.63.24.57.77.93 1.39.93h4.46c.83 0 1.5-.67 1.5-1.5V5.42c0-.62-.35-1.15-.93-1.39Z"/>
</svg>
`;

const RefreshControl = L.Control.extend({
	options: {
		position: 'topleft'
	},

	onAdd: function (map) {
		const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
		container.style.width = '30px';
		container.style.height = '30px';

		const button = L.DomUtil.create('a', '', container);
		button.href = '#';
		button.id = 'refresh-button';
		button.title = 'Rafraîchir les données';
		button.style.display = 'flex';
		button.style.alignItems = 'center';
		button.style.justifyContent = 'center';
		button.style.pointerEvents = 'none';
		button.style.cursor = 'default';   
		button.innerHTML = nextRefreshIn;

		// Empêche la carte de bouger
		L.DomEvent.disableClickPropagation(container);
		L.DomEvent.disableScrollPropagation(container);

		return container;
	}
});


/*
	- Définir une couleur dominante pour chaque ligne
	Utilisé dans le placement des tracés (setupMap) et dans la création des markers (createVehicleMarker)
	=> Renvoie un code couleur RGB
*/
function lineColor(line) {
	switch (line) {
		case "T1": return "rgb(1, 89, 170)"; break;
		case "T2": return "rgb(105, 167, 68)"; break;
		case "T3": return "rgb(0, 176, 174)"; break;
		case "T4": return "rgb(101, 45, 144)"; break;
		case "T5": return "rgb(243, 111, 36)"; break;
		case "T6": return "rgb(240, 146, 164)"; break;
		case "T7": return "rgb(151, 42, 99)"; break;
		case "RX": return "rgb(255, 0, 0)"; break;
		default: return "black";
	}
}

/*
	- Récupérer les tracés des lignes
	Tracés en dur dans un fichier à mettre à jour quand changement majeur
	Utilisé dans l'initialisation
	=> Renvoie les GEOJSON des lignes
*/
async function fetchTraces() {
	const res = await fetch("data/sytral_tcl_sytral.tcllignetram_2_0_0-2.json");
	const data = await res.json();
	return data;
}


/*
	- Créer un marker pour chaque véhicule
	Chaque marker a 3 options : n° de voiture, n° de carrosserie et avance/retard déjà formatté pour affichage
	Utilisé dans setupMap
	=> Renvoie un marker, le stocke dans marqueursParLigne
*/
function createVehiculeMarker(v, map) {
	const couleur = lineColor(v.ligne);
	const voiture = v.voiture ?? "?";
	const carrosserie = v.carrosserie ?? "???";
	const cap = v.cap;
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

	const passagesHTML = v.passages
	.sort((a, b) => a.ordre - b.ordre)
	.map(p => {
		const datePassage = new Date(p.heure);

		const heure = datePassage.toLocaleTimeString("fr-FR", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit"
		});
		if (arretsReleve.includes(p.arret.id)) {
			return `<b>${p.arret.nom} : ${heure}</b>`;
		} else {
			return `${p.arret.nom} : ${heure}`;
		}
	})
	.join("<br>");

	const spoilerId = `vehicule-${carrosserie}-${voiture}`;

	const popupContent = `
		<div style="min-width:250px;">
			<b>→ ${terminus}</b> ${(timingBeau ?? "")}
			<br>

			<div id="header-${spoilerId}" style="cursor:pointer; margin-top:5px;">
				Voir les passages ⬇
			</div>

			<div id="content-${spoilerId}" style="display:none; margin-top:5px;">
				${passagesHTML}
			</div>
		</div>
	`;

	const marker = L.marker([v.position.latitude, v.position.longitude], { icon })
		.bindPopup(popupContent);

	marker.on('popupopen', () => {
		const header = document.getElementById(`header-${spoilerId}`);
		const content = document.getElementById(`content-${spoilerId}`);

		if (!header || !content) return;

		header.onclick = (event) => {
			event.stopPropagation();

			const isOpen = content.style.display === "block";
			content.style.display = isOpen ? "none" : "block";

			header.innerHTML = isOpen
				? "Voir les passages ⬇"
				: "Cacher les passages ⬆";
		};
	});

	marker.options.voitureData = { voiture: v.voiture, carrosserie: v.carrosserie, timing: timingBeau ?? "" };

	marqueursParLigne[v.ligne][carrosserie] = marker;

	return marker;
}

/*
	- Mise en forme textuelle des popup d'arrêts
	Appelé à chaque rafraîchissement des données
	=> Renvoie une chaîne de caractères avec le nom de l'arrêts et les prochains passages
*/
function buildStopPopupContent(arret, passages) {
	const id = `content-${arret.id}`;

	return `
		<div style="min-width:250px; text-align: center">
			<strong>${arret.nom}</strong>
			<div id="header-${arret.id}" style="cursor:pointer;">Voir les horaires ⬇</div>

			<div id="${id}" style="display:none; margin-top:5px; font-size:0.9em">
				${passages.length === 0 
					? "<i>Aucun passage</i>" 
					: passages.map(p => `
						<div>
							${p.ligne} V${p.voiture} → ${p.terminus.nom} : ${new Date(p.heure).toLocaleTimeString("fr-FR")}
						</div>
					`).join("")
				}
			</div>
		</div>
	`;
}

/*
	- Affiche ou cache le tracé et les véhicule d'une ligne
	Déclenché par appui sur un eye svg général ou spécifique à une ligne
	=> Ne renvoie rien
*/
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

/*
	- Mettre en place la légende textuelle des véhicules en ligne
	Boutons pour tout cacher/afficher
	Liste des lignes et de leurs véhicules classés par n° de voiture croissant
	Utilisé dans setupMap
	=> Ne renvoie rien
*/
function updateLegende(map) {
	const legende = document.getElementById('legende');
	legende.innerHTML = "<h3>Véhicules</h3>";
	eyesParLigne = {};

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

/*
	- Mettre à jour les popup d'arrêts
	Appelé lors du rafraîchissement des données
	=> Ne renvoie rien
*/
function updateHoraires(horairesArrets) {
	arrets.forEach(arret => {
		const marker = markersArrets.get(arret.id);
		if (!marker) return;

		const passages = (horairesArrets.get(arret.id) || []);

		const content = buildStopPopupContent(arret, passages);

		marker.setPopupContent(content);
		marker.on('popupopen', (e) => {
			const header = document.getElementById(`header-${arret.id}`);
			const content = document.getElementById(`content-${arret.id}`);

			if (!header || !content) return;

			header.onclick = (event) => {
				event.stopPropagation();

				const isOpen = content.style.display === "block";
				content.style.display = isOpen ? "none" : "block";
				header.innerHTML = isOpen 
					? `Voir les horaires ⬇` 
					: `Cacher les horaires ⬆`;
			};
		});
	});
}

/*
	- Initialiser la carte en arrière plan
	Affichage des tracés de lignes
	Affichage des arrêts
	Ajout des boutons de localisation et rafraîchissement
	=> Renvoie la carte créée
*/
function initMap() {
	if (mapInstance) return mapInstance;

	const saved = localStorage.getItem('itlMapView');

	let defaultView = [45.75, 4.93];
	let defaultZoom = 12;

	if (saved) {
		try {
			const { lat, lon, zoom } = JSON.parse(saved);
			defaultView = [lat, lon];
			defaultZoom = zoom;
		} catch (e) {
			console.warn("Erreur lecture mapView");
		}
	}

	const map = L.map('map').setView(defaultView, defaultZoom);

	// Pane pour l'arrière plan
	map.createPane('paneTraces');
	map.getPane('paneTraces').style.zIndex = 400;

	// Pane pour le premier plan
	map.createPane('paneArrets');
	map.getPane('paneArrets').style.zIndex = 500;

	L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM contributors</a>'
	}).addTo(map);

	map.on('moveend zoomend', () => {
		const center = map.getCenter();
		const zoom = map.getZoom();

		localStorage.setItem('itlMapView', JSON.stringify({
			lat: center.lat,
			lon: center.lng,
			zoom: zoom
		}));
	});

	// Tracés par ligne (créés UNE FOIS)
	traces.features.forEach(feature => {
		const ligne = feature.properties.ligne;

		if (!layersParLigne[ligne]) {
			layersParLigne[ligne] = {
				markers: L.layerGroup().addTo(map),
				trace: L.layerGroup().addTo(map)
			};
		}

		L.geoJSON(feature, {
		pane: 'paneTraces',
		style: {
			color: lineColor(ligne),
			weight: 2,
			opacity: 0.9
		}
	}).addTo(layersParLigne[ligne].trace);
	});

	arrets.forEach(arret => {
		const marker = L.circleMarker([arret.lat, arret.lon], {
			pane: 'paneArrets',
			radius: 3,
			fillColor: "#ffffff",
			color: "#000000",
			weight: 1,
			opacity: 1,
			fillOpacity: 1
		})
		.bindPopup("") // vide au départ
		.addTo(map);

		markersArrets.set(arret.id, marker);
	});

	L.control.locate({
		position: "topleft",
		flyTo: true,
		strings: { title: "Me localiser" }
	}).addTo(map);

	new RefreshControl().addTo(map);

	mapInstance = map;
	return map;
}

/*
	- Mettre à jour les markers de véhicules
	Supprimer les anciens markers puis les créer avec les infos à jour
	=> Ne renvoie rien
*/
function updateVehicules(listeVehicules) {
	const map = mapInstance;

	// Nettoyage des anciens markers
	Object.values(layersParLigne).forEach(l => l.markers.clearLayers());
	marqueursParLigne = {};
	lignesFiltrees.forEach(l => {
		marqueursParLigne[l] = {};
	})

	// Recréation des markers
	listeVehicules.forEach(v => {
		const marker = createVehiculeMarker(v, map);
		const ligne = v.ligne;

		if (layersParLigne[ligne]) {
			layersParLigne[ligne].markers.addLayer(marker);
		}
	});
}


/* ===============================================================================================

											GESTION PROGRAMME

	============================================================================================== */

let nextRefreshIn = 0; // secondes
const REFRESH_INTERVAL = 35; // secondes
let countdownInterval = null;

/*
	- Initialise la carte et effectue la première récupération des données et mise en place de la carte

	=> Ne renvoie rien
	$ Pourrait renvoyer la carte ?
*/
async function init() {
	const listeHoraires = await fetchSiriET();
	const listeVehicules = await fetchSiri();
	arrets = await chargerArrets();
	traces = await fetchTraces();

	let objetsVehicules = traiterSiri(listeVehicules, listeHoraires);
	let horairesArrets = traiterHoraires(listeHoraires);
	sendVisite();
	sendVehicules(listeVehicules);

	const map = initMap();
	refreshData(objetsVehicules, horairesArrets);

	const listeIncidents = await fetchSiriSE();

	autoRefreshLoop();
}

async function autoRefreshLoop() {
	while (true) {
		try {
			if (!isPageVisible) {
				await waitUntilVisible();
			}

			nextRefreshIn = REFRESH_INTERVAL;
			startCountdown();

			await reloadVehicules();

			await wait(REFRESH_INTERVAL * 1000);

		} catch (err) {
			console.error("Erreur boucle auto-refresh", err);
		}
	}
}

function waitUntilVisible() {
	return new Promise(resolve => {
		const check = () => {
			if (!document.hidden) {
				document.removeEventListener("visibilitychange", check);
				resolve();
			}
		};
		document.addEventListener("visibilitychange", check);
	});
}

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function startCountdown() {
	if (countdownInterval) clearInterval(countdownInterval);

	countdownInterval = setInterval(() => {
		if (nextRefreshIn > 0) {
			nextRefreshIn--;
			const btnRefresh = document.getElementById("refresh-button");
			btnRefresh.innerHTML = nextRefreshIn;
		}
	}, 1000);
}

/*
	- Lancer le rafraichissement de toutes les données API
	Appelé par reloadVehicules()
	=> Ne renvoie rien
*/
function refreshData(listeVehicules, horairesArrets) {
	updateVehicules(listeVehicules);
	updateLegende(mapInstance);
	updateHoraires(horairesArrets);
}

/*
	- Récupérer les véhicules de Siri, les transformer en objets et lancer le rafraîchissement de l'interface
	Dépend de refreshData()
	=> Ne renvoie rien
*/
async function reloadVehicules() {
	try {
		const listeHoraires = await fetchSiriET();
		const listeVehicules = await fetchSiri();
		sendVehicules(listeVehicules);
		const horairesArrets = traiterHoraires(listeHoraires);
		const objetsVehicules = traiterSiri(listeVehicules, listeHoraires);

		refreshData(objetsVehicules, horairesArrets);
	} catch (err) {
		console.error("Erreur lors du rechargement des véhicules", err);
	}
}



/*
	- Récupère les arrêts de tram du réseau TCL
	Fichier en dur dans le serveur à mettre à jour régulièrement
	Dépend de parseDesserte
	=> Renvoie une liste d'objets
*/
async function chargerArrets() {
	try {
		// Récupération du JSON
		const response = await fetch("./data/points-arret-reseau-transports-commun-lyonnais.json");
		if (!response.ok) {
			throw new Error("Erreur de chargement du fichier JSON");
		}

		const json = await response.json();

		// Extraction des données utiles
		const arrets = json.values
		.map(item => ({
			id: item.id,
			nom: item.nom,
			desserte: parseDesserte(item.desserte),
			lat: item.lat,
			lon: item.lon,
			adresse: item.adresse,
			commune: item.commune,
			insee: item.insee
		}))
		.filter(arret =>
			arret.desserte.some(d =>
			lignesFiltrees.includes(d.ligne)
			)
		);

		return arrets;
	} catch (err) {
		console.error("Impossible de charger les arrêts :", err);
		addNote("Erreur API Elliot : impossible de charger les arrêts", "error", 0);
	}
}

/*
	- Formatter correctement les lignes et le sens dans lequel chaque arrêt est desservi
	Utilisé par chargerArrets
	=> Renvoie une liste de couples ligne/sens
*/
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

/*
	- Analyse l'avance/retard d'un véhicule
	Utilisé dans le traitement des véhicules
	=> Renvoie en secondes l'avance/retard d'un véhicule (nombre positif si retard, négatif si avance)
*/
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

/*
	- Afficher des messages à durée variable sur l'écran

	=> Ne renvoie rien
*/
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

init();