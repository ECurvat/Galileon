import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import Database from "better-sqlite3";

dotenv.config();

const app = express();
app.use(express.json());
const PORT = 3000;

const API_URL_PASSAGES = process.env.API_URL_PASSAGES;
const SIRI_URL_VEHICLE_MONITORING = process.env.SIRI_URL_VEHICLE_MONITORING;
const SIRI_URL_ESTIMATED_TIMETABLES = process.env.SIRI_URL_ESTIMATED_TIMETABLES;
const LOGIN = process.env.API_LOGIN;
const PASSWORD = process.env.API_PASSWORD;

const API_URL_VEHICULES = process.env.API_URL_VEHICULES;
const API_KEY_VEHICULES = process.env.API_KEY_VEHICULES;

// route backend
app.get("/api/passages", async (req, res) => {
  try {
	// encodage Basic Auth
	const base64Credentials = Buffer.from(`${LOGIN}:${PASSWORD}`).toString("base64");

	// appel vers l’API sécurisée
	const response = await fetch(API_URL_PASSAGES, {
	  headers: {
		"Authorization": `Basic ${base64Credentials}`
	  }
	});

	if (!response.ok) {
	  return res.status(response.status).send(`Erreur API externe: ${response.statusText}`);
	}

	// on récupère le JSON et on le renvoie au navigateur
	const data = await response.json();
	if (data.nb_results === 0) {
	  res.json({
		success: false,
		message: "Aucun horaire de passage retourné par l'API du GrandLyon",
		data: []
	  });
	} else {
	  res.json({
		success: true,
		data: data
	  });
	}
  } catch (err) {
	console.error(err);
	res.status(500).send("Erreur serveur interne");
  }
});

app.get("/siri/vehicle-monitoring", async (req, res) => {
	try {
		const base64Credentials = Buffer.from(`${LOGIN}:${PASSWORD}`).toString("base64");

		const response = await fetch(SIRI_URL_VEHICLE_MONITORING, {
			headers: {
				"Authorization": `Basic ${base64Credentials}`
			}
		});

		if (!response.ok) {
			return res.status(response.status).json({
				success: false,
				message: "API SIRI Grand Lyon indisponible (VM)",
				data: []
			});
		}

		const data = await response.json();
		// console.log(data.Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity);

		if (!data) {
			res.json({
				success: false,
				message: "Aucun véhicule retourné par l'API SIRI",
				data: []
			});
		} else {
			res.json({
				success: true,
				data: data
			});
		}
	} catch (err) {
		console.error(err);
		res.status(500).send("Erreur serveur interne");
	}
});

app.get("/siri/estimated-timetables", async (req, res) => {
	try {
		const base64Credentials = Buffer.from(`${LOGIN}:${PASSWORD}`).toString("base64");

		const response = await fetch(SIRI_URL_ESTIMATED_TIMETABLES, {
			headers: {
				"Authorization": `Basic ${base64Credentials}`
			}
		});

		if (!response.ok) {
			return res.status(response.status).json({
				success: false,
				message: "API SIRI Grand Lyon indisponible (ET)",
				data: []
			});
		}

		const data = await response.json();

		if (!data) {
			res.json({
				success: false,
				message: "Aucun horaire retourné par l'API SIRI",
				data: []
			});
		} else {
			res.json({
				success: true,
				data: data
			});
		}
	} catch (err) {
		console.error(err);
		res.status(500).send("Erreur serveur interne");
	}
});

app.get("/api/vehicules", async (req, res) => {
  const ligne = req.query.ligne;
  console.log("recherche avec ligne ", ligne);
  if (!ligne) return res.status(400).send("Paramètre 'ligne' manquant");
  try {
	const groupes = [
	  { Ligne: ligne, Sens: "ALL" },
	  { Ligne: ligne, Sens: "RET" }
	];
	const requestBody = { Lignes: groupes };

	const response = await fetch(process.env.API_URL_VEHICULES, {
	  method: "POST",
	  headers: { "Content-Type": "application/json" },
	  body: JSON.stringify(requestBody)
	});

	if (!response.ok) return res.status(response.status).send(`Erreur API externe: ${response.statusText}`);

	const { iv, cipherText } = await response.json();

	const decrypted = decryptAES128CBC_Node(iv, cipherText);
	const data = JSON.parse(decrypted);
	if (data.Total === 0) {
		res.json({
			success: false,
			message: "Aucun véhicule retourné par l'API Antilope",
			data: []
		})
	} else {
	  	res.json({
			success: true,
			data: data
		});
	}

  } catch (err) {
	console.error(err);
	res.status(500).send("Erreur serveur");
  }
});

app.post("/db/send", (req, res) => {
	const listeVehicules = req.body.listeVehicules;
	const visite = req.body.visite;
	const dateNow = new Date().toISOString();
	// console.log(listeVehicules);
	// console.log(visite);
	if (listeVehicules && visite) {
		try {
			const db = new Database("base.db");
			db.pragma("journal_mode = WAL");
			db.pragma("synchronous = NORMAL");
			db.pragma("busy_timeout = 3000");

			// Partie 1 : envoyer les véhicules
			const insertInfo = db.prepare("INSERT INTO data VALUES(?,?,?,?,?,?,?,?,?,?,?)");
			listeVehicules.forEach(v => {
				let ligne = v.FramedVehicleJourneyRef.DatedVehicleJourneyRef.split(":")[3].slice(4).substring(0,2);
				let carrosserie = v.VehicleRef.value.split(":")[3];
				let voiture = parseInt(v.FramedVehicleJourneyRef.DatedVehicleJourneyRef.split(":")[3].slice(-8).substring(0,3));
				let prochainArret = v.MonitoredCall.StopPointRef.value.split(":")[3];
				let distanceArret = v.MonitoredCall.DistanceFromStop;
				let terminus = v.DestinationRef.value.split(":")[3];
				let latitude = v.VehicleLocation.Latitude;
				let longitude = v.VehicleLocation.Longitude;
				let avanceRetard = parseTiming(v.Delay);
				let sens = v.DirectionRef.value === "Forward" ? "Aller" : "Retour";
				console.log(dateNow, ligne, carrosserie, voiture, prochainArret, distanceArret, terminus, latitude, longitude, avanceRetard, sens);
				insertInfo.run([dateNow, ligne, carrosserie, voiture, prochainArret, distanceArret, terminus, latitude, longitude, avanceRetard, sens]);
			});

			// Partie 2 : envoyer la visite
			db.prepare(`
				INSERT INTO visites (
				visited_at,
				referrer,
				session_id,
				language,
				timezone,
				user_agent,
				platform,
				screen_width,
				screen_height,
				device_pixel_ratio,
				is_touch,
				connection_type
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				dateNow,
				visite.referrer,
				visite.session_id,
				visite.language,
				visite.timezone,
				visite.user_agent,
				visite.platform,
				visite.screen_width,
				visite.screen_height,
				visite.device_pixel_ratio,
				visite.is_touch,
				visite.connection_type
			);

			res.json({
				success: true,
				data: []
			})
		} catch (err) {
			console.error(err);
			res.status(500).send("Erreur serveur");
		}	
	} else {
		console.log("Aucun véhicule à mettre en BD");
	}


});

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

app.post("/db/lookup", (req, res) => {
	const aTraiter = req.body.aTraiter;
	const dateActuelle = new Date(req.body.dateActuelle);
	const aRetourner = [];
	try {
		const db = new Database("base.db");

		const paramDateActuelle = formatDate(dateActuelle);

		aTraiter.forEach(v => {
			const carrosserie = parseInt(v.carrosserie);
			const ligne = v.ligne;
			const terminus = v.terminus;
			let sens = v.sens;
			let cap = v.cap;
			let row;
			// si on est entre 00:00 et 3:00 on cherche sur le jour J avant 3:00 et sur J-1
			if (dateActuelle.getHours() < 3) {
				const veille = new Date(dateActuelle);
				veille.setDate(dateActuelle.getDate() - 1);
				const paramDateVeille = formatDate(veille);
				// 1er param = date actuelle
				// 2e param = date veille
				// 3e param = ligne
				// 4e param = carrosserie
				const lookupQuery = db.prepare("SELECT * FROM fait l WHERE ((date(l.date) = ? AND time(l.date) < '03:00:00') OR(date(l.date) = ? AND time(l.date) > '03:00:00')) AND ligne = ? AND carrosserie = ? ORDER BY date DESC LIMIT 1;");
				row = lookupQuery.all([paramDateActuelle, paramDateVeille, ligne, carrosserie]);
			} else {
				// 1er param = date actuelle
				// 2e param = ligne
				// 3e param = carrosserie
				const lookupQuery = db.prepare("SELECT * FROM fait l WHERE (date(l.date) = ? AND time(l.date) > '03:00:00') AND ligne = ? AND carrosserie = ? ORDER BY date DESC LIMIT 1;");
				row = lookupQuery.all([paramDateActuelle, ligne, carrosserie]);
			}
			if (row.length === 0) {
				aRetourner.push({
					carrosserie: carrosserie,
					ligne: ligne,
					voiture: null,
					prochainArret:null,
					sens:sens,
					terminus:terminus,
					timing:null,
					position: {latitude:v.x, longitude:v.y},
					cap: cap
				});
			} else {
				aRetourner.push({
					carrosserie: carrosserie,
					ligne: ligne,
					voiture: row[0].voiture,
					prochainArret:null,
					sens:sens,
					terminus:terminus,
					timing:null,
					position: {latitude:v.x, longitude:v.y},
					cap: cap
				});
			}
		});
		res.json({
			success: true,
			data: aRetourner
		})
	} catch (err) {
		console.error(err);
		res.status(500).send("Erreur serveur");
	}
})

function decryptAES128CBC_Node(ivBase64, cipherTextBase64) {
  const key = Buffer.from(process.env.API_KEY_VEHICULES, "base64");
  const iv = Buffer.from(ivBase64, "base64");
  const cipherText = Buffer.from(cipherTextBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  let decrypted = decipher.update(cipherText, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function formatDate(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0"); // mois 0-11
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

app.listen(PORT, () => {
  console.log(`Serveur Node actif sur http://localhost:${PORT}`);
});
