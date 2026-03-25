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

async function fetchLignes() {
	const response = await fetch('data/lignes.json');
	return await response.json();
}

function getParam(name) {
	const url = new URL(window.location.href);
	return url.searchParams.get(name);
}

function buildTable(ligne) {
	const main = document.getElementsByClassName("main")[0];
 	const table = document.createElement("table");
	const ordreMin = 1;
	const ordreMax = Math.max(...ligne.stations.map(s => s.ordre));

	// construction voie retour
	trVoieRetour = table.insertRow();
   	trVoieRetour.className = "voie aller";
	ligne.stations.forEach(s => {
		if (s.ordre == ordreMin) { // premiere station aller
			const tdArret = trVoieRetour.insertCell();
			tdArret.className = `${s.id_ret} arret`;
		} else {
			const tdInter = trVoieRetour.insertCell();
			tdInter.className = "inter";
			tdInter.dataset.stop = s.id_ret;
			const tdArret = trVoieRetour.insertCell();
			tdArret.className = `${s.id_ret} arret`;
		}
	})

	// construction abrev
	trAbrev = table.insertRow();
	trAbrev.className = "abrev";
	ligne.stations.forEach(s => {
		if (s.ordre == ordreMin) {
			const tdArret = trAbrev.insertCell();
			tdArret.className = `${s.id_all} arret`;
			tdArret.innerHTML = s.abrev;
		} else {
			const tdInter = trAbrev.insertCell();
			tdInter.className = `inter`;
			const tdArret = trAbrev.insertCell();
			tdArret.className = `${s.abrev} arret`;
			tdArret.innerHTML = s.abrev;
		}
	})

	// construction voie aller
	trVoieAller = table.insertRow();
   	trVoieAller.className = "voie retour";
	ligne.stations.forEach(s => {
		if (s.ordre == ordreMax) {
			const tdArret = trVoieAller.insertCell();
			tdArret.className = `${s.id_all} arret`;
		} else {
			const tdArret = trVoieAller.insertCell();
			tdArret.className = `${s.id_all} arret`;
			const tdInter = trVoieAller.insertCell();
			tdInter.className = "inter";
			tdInter.dataset.stop = s.id_all;
		}
	})

	main.appendChild(table);
	const decompte = document.createElement('span');
	decompte.innerHTML = "Rafraîchissement des données dans 0s";
	main.appendChild(decompte);
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

async function fetchSiri(ligneNom) {
	try {
		const response = await fetch("/siri/vehicle-monitoring");

		if (!response.ok) {
			console.error(`Erreur API SIRI: ${response.status} ${response.statusText}`);
			return [];
		}

		const data = await response.json();

		if (!data.success) {
			return [];
		}

		// Traitement normal
		let listeVehicules = data.data.Siri.ServiceDelivery.VehicleMonitoringDelivery[0].VehicleActivity;

		if (listeVehicules && listeVehicules.length === 0) {
			console.warn("Aucun véhicule retourné par SIRI (liste vide)");
			return [];
		}

		// tronc commun
		let filtre = [ligneNom];
		switch (ligneNom) {
			case "T1":
				filtre.push("T2", "T4");
				break;
			case "T2":
				filtre.push("T1", "T5");
				break;
			case "T3":
				filtre.push("T7");
				break;
			case "T4":
				filtre.push("T1");
				break;
			case "T5":
				filtre.push("T2");
				break;
			case "T6":
				break;
			case "T7":
				filtre.push("T3");
				break;
			default: return;
		}

		let filtreVehicules = listeVehicules
			.filter(v => filtre.includes(v.MonitoredVehicleJourney.LineRef.value.split(":")[3]))
			.map(v => v.MonitoredVehicleJourney);

		if (filtreVehicules.length === 0) {
			console.warn("Aucun véhicule correspondant au filtre retourné par SIRI");
			return [];
		}

		// Tout est bon
		return filtreVehicules;

	} catch (error) {
		console.error("Erreur lors de la récupération SIRI :", error);
		return [];
	}
}

function traiterSiri(listeVehicules) {
	let objetsVehicules = [];
	if (listeVehicules) {
		listeVehicules.forEach(v => {
			let ligne = v.FramedVehicleJourneyRef.DatedVehicleJourneyRef.split(":")[3].slice(4).substring(0,2);
			let carrosserie = v.VehicleRef.value.split(":")[3];
			let voiture = parseInt(v.FramedVehicleJourneyRef.DatedVehicleJourneyRef.split(":")[3].slice(-8).substring(0,3));
			let position = {latitude: v.VehicleLocation.Latitude, longitude: v.VehicleLocation.Longitude};
			let sens = v.DirectionRef.value === "outbound" ? "Aller" : "Retour";
			let timing = parseTiming(v.Delay);
			let prochainArret = v.MonitoredCall.StopPointRef.value.split(":")[3];
			let terminus = v.DestinationRef.value.split(":")[3];
			objetsVehicules.push({
				ligne: ligne,
				carrosserie: carrosserie,
				voiture: voiture,
				terminus: terminus,
				sens: sens,
				timing: timing,
				prochainArret: prochainArret,
				position: {
					lat: position.latitude,
					lon: position.longitude
				}
			})
		});
	}
	return objetsVehicules;
}

function parseTiming(dureeStr) {
	if (!dureeStr) return 0;
	const isNegative = dureeStr.startsWith("-");
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

// Afficher le bon ordre des rames quand plusieurs dans la même interstation
function distance(a, b) {
	const dx = a.lat - b.lat;
	const dy = a.lon - b.lon;
	return Math.sqrt(dx * dx + dy * dy);
}

function calculeProportionInterstation(train, ligne, sensOverride = null) {
    const stations = ligne.stations;
    const sens = sensOverride ?? train.sens;

    const stationsTried = [...stations].sort((a, b) =>
        sens === "Aller" ? a.ordre - b.ordre : b.ordre - a.ordre
    );

    const idKey = sens === "Aller" ? "id_all" : "id_ret";
    const indexProchain = stationsTried.findIndex(
        s => String(s[idKey]) === String(train.prochainArret)
    );

    const prochain = stationsTried[indexProchain];
    const precedent = indexProchain > 0 ? stationsTried[indexProchain - 1] : null;

    const distTotale = precedent ? distance(
        { lat: precedent.lat, lon: precedent.lon },
        { lat: prochain.lat, lon: prochain.lon }
    ) : null;

    const distRestante = distance(
        { lat: train.position.lat, lon: train.position.lon },
        { lat: prochain.lat, lon: prochain.lon }
    );

    const distDepuisPrecedent = precedent ? distance(
        { lat: train.position.lat, lon: train.position.lon },
        { lat: precedent.lat, lon: precedent.lon }
    ) : null;

    const proportion = distTotale > 0 ? 1 - (distRestante / distTotale) : 0.5;

    return {
        precedent,
        prochain,
        proportion: Math.max(0, Math.min(1, proportion))
    };
}

function afficherTrains(trains, ligne) {
    const overlay = document.querySelector(".overlay");
    if (!overlay) return;

    const groupes = {};
    trains.forEach(train => {
        const key = train.prochainArret;
        if (!groupes[key]) groupes[key] = [];
        groupes[key].push(train);
    });

    Object.entries(groupes).forEach(([stop, groupe]) => {
        const celluleProchain = document.querySelector(`.inter[data-stop="${stop}"]`);
        if (!celluleProchain) return;

        const parentRect = overlay.getBoundingClientRect();

        groupe.forEach((train, index) => {
			const estTroncCommun = 
				(ligne.nom === "T1" && train.ligne === "T4") || 
				(ligne.nom === "T4" && train.ligne === "T1");

			const sensCalcul = estTroncCommun
				? (train.sens === "Aller" ? "Retour" : "Aller")
				: null;

			const { precedent, prochain, proportion } = calculeProportionInterstation(train, ligne, sensCalcul);

			// Coordonnées pixel du prochain arrêt (cellule inter)
			const rectProchain = celluleProchain.getBoundingClientRect();
			const xProchain = rectProchain.left - parentRect.left + rectProchain.width / 2;
			const yProchain = rectProchain.top  - parentRect.top  + rectProchain.height / 2;

			let xFinal = xProchain;
			let yFinal = yProchain;

			if (prochain && precedent) {  // garde-fou : introuvable = placement par défaut
				const idKey = sensCalcul
					? (sensCalcul === "Aller" ? "id_all" : "id_ret")
					: (train.sens === "Aller" ? "id_all" : "id_ret");
				const cellulePrecedent = document.querySelector(`.inter[data-stop="${precedent[idKey]}"]`);

				if (cellulePrecedent) {
					const rectPrecedent = cellulePrecedent.getBoundingClientRect();
					const xPrecedent = rectPrecedent.left - parentRect.left + rectPrecedent.width / 2;
					const yPrecedent = rectPrecedent.top  - parentRect.top  + rectPrecedent.height / 2;

					xFinal = xPrecedent + (xProchain - xPrecedent) * proportion;
					yFinal = yPrecedent + (yProchain - yPrecedent) * proportion;
				}
			}

            // Offset pour groupes de trains dans la même interstation
            const gap = 18;
            const totalWidth = (groupe.length - 1) * gap;
            const offset = index * gap - totalWidth / 2;

            // Création pastille
            const pastille = document.createElement("div");
            pastille.className = "train";
			
			// inverser sens T1 sur visu T4 et T4 sur visu T1 (tronc commun) pour le triangle
			if ((ligne.nom == "T1" && train.ligne == "T4") || (ligne.nom == "T4" && train.ligne == "T1")) {
				pastille.classList.add(train.sens === "Aller" ? "retour" : "aller");
			} else {
				pastille.classList.add(train.sens === "Aller" ? "aller" : "retour");
			}

            pastille.style.backgroundColor = lineColor(train.ligne);

			// Tooltip destination/avance retard
			const tooltip = document.getElementById("tooltip");

			pastille.style.pointerEvents = "auto";
			pastille.addEventListener("click", (e) => {
				e.stopPropagation();

				// recherche nom propre arrêt
				let arret = "Inconnu";
				lignes.forEach(l => {
					l.stations.forEach(a => {
						if (a.id_all == train.terminus || a.id_ret == train.terminus) {
							arret = a.nom;
						}
					});
				});
				
				let timingBeau;
				if (train.timing != null) {
					const min = Math.floor(Math.abs(train.timing) / 60);
					const sec = Math.abs(train.timing) % 60;
					const signe = train.timing < 0 ? "-" : "+";
					timingBeau = min > 0
					? `${signe}${min}m${('0' + sec).slice(-2)}s`
					: `${signe}${sec}s`;
				}

				tooltip.innerHTML = `
					<strong>${train.ligne} → ${arret}</strong> ${timingBeau}
				`;

				tooltip.style.left = `${xFinal}px`;
				tooltip.style.top  = `${yFinal}px`;
				tooltip.classList.remove("hidden");
			});

			// Fermer en cliquant ailleurs
			document.addEventListener("click", () => {
				tooltip.classList.add("hidden");
			}, { once: false });

            const cercle = document.createElement("div");
            cercle.className = "cercle";
            const carrosserie = document.createElement("div");
            carrosserie.className = "carrosserie";
            carrosserie.textContent = train.carrosserie;
            const voiture = document.createElement("div");
            voiture.className = "voiture";
            voiture.textContent = train.voiture;
            cercle.appendChild(carrosserie);
            cercle.appendChild(voiture);
            pastille.appendChild(cercle);

            const triangle = document.createElement("div");
            triangle.className = "triangle";
            let triangleColor = "gray";
            if (train.timing < -60) triangleColor = "red";
            else if (train.timing > 120) triangleColor = "green";
            triangle.style.setProperty("--triangle-color", triangleColor);
            pastille.appendChild(triangle);

            pastille.style.position = "absolute";
            pastille.style.left = `${xFinal}px`;
            pastille.style.top  = `${yFinal}px`;
            pastille.style.setProperty("--offset-x", `${offset}px`);

            overlay.appendChild(pastille);
        });
    });
}

async function refreshData() {
	const ligneNom = getParam('ligne');
	const ligne = lignes.find(l => l.nom === ligneNom);

	// clear all previous data from frontend
    const overlay = document.querySelector(".overlay");

	// hide tooltip
	const tooltip = document.getElementById("tooltip");
	tooltip.classList.add("hidden");

	overlay.innerHTML = "";
	const listeVehicules = await fetchSiri(ligneNom);
	sendVehicules(listeVehicules);
	const trains = traiterSiri(listeVehicules);
	afficherTrains(trains, ligne);
}

let nextRefreshIn = 0; // secondes
const REFRESH_INTERVAL = 35; // secondes
let countdownInterval = null;

async function autoRefreshLoop() {
	while (true) {
		try {
			if (!isPageVisible) {
				await waitUntilVisible();
			}

			nextRefreshIn = REFRESH_INTERVAL;
			startCountdown();

			await refreshData();

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
			const decompte = document.getElementsByTagName('span')[0];
			decompte.innerHTML = `Rafraîchissement des données dans ${nextRefreshIn}s`;
		}
	}, 1000);
}

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

async function init() {
	lignes = await fetchLignes();
	const ligneNom = getParam('ligne');
	const ligne = lignes.find(l => l.nom === ligneNom);

	if (!ligne) {
		const main = document.getElementsByClassName("main")[0];
		main.innerHTML = `<p>Ligne "${ligneNom}" introuvable.</p>`;
		return;
	}

	sendVisite();

	buildTable(ligne);

	buildMenu(ligneNom);

	await refreshData(ligne, ligneNom);

	const active = document.getElementsByClassName("active")[0];
	active.style.backgroundColor = lineColor(ligneNom);

	autoRefreshLoop();
}

let lignes;
init();
