require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const http = require("http");
const socketIo = require("socket.io");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.json());
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "Uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_DATABASE || "cafe_mahatsara",
  password: process.env.DB_PASSWORD || "eritau",
  port: parseInt(process.env.DB_PORT) || 5432,
});

// Config Nodemailer avec Gmail - Version plus robuste
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Vérification améliorée au démarrage
transporter.verify(function (error, success) {
  if (error) {
    console.error("❌ ERREUR Nodemailer:", {
      message: error.message,
      code: error.code,
      command: error.command,
    });
    
    // Aide au débogage
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("❌ VARIABLES MANQUANTES:");
      console.error(
        "EMAIL_USER:",
        process.env.EMAIL_USER ? "✓ Défini" : "✗ Manquant"
      );
      console.error(
        "EMAIL_PASS:",
        process.env.EMAIL_PASS ? "✓ Défini" : "✗ Manquant"
      );
    }
  } else {
    console.log("✅ Nodemailer prêt à envoyer des emails");
  }
});

async function initDatabase() {
  try {
    const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'commande' AND column_name = 'statut'
      `);
    if (columnCheck.rows.length === 0) {
      await pool.query(`
          ALTER TABLE commande
          ADD COLUMN statut VARCHAR(50) DEFAULT 'En attente'
        `);
      console.log("Colonne statut ajoutée à la table commande");
    }

    const emailLivreurCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'commande' AND column_name = 'email_livreur'
      `);
    if (emailLivreurCheck.rows.length === 0) {
      await pool.query(`
          ALTER TABLE commande
          ADD COLUMN email_livreur VARCHAR(255) REFERENCES livreur(email)
        `);
      console.log("Colonne email_livreur ajoutée à la table commande");
    }

    const positionCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'commande' AND column_name = 'position_livreur'
      `);
    if (positionCheck.rows.length === 0) {
      await pool.query(`
          ALTER TABLE commande
          ADD COLUMN position_livreur JSONB,
          ADD COLUMN derniere_mise_a_jour TIMESTAMP
        `);
      console.log("Colonnes de suivi ajoutées à la table commande");
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS produit (
          type VARCHAR(50) PRIMARY KEY,
          quantite INTEGER NOT NULL DEFAULT 0
        )`);
    await pool.query(`
        INSERT INTO produit (type, quantite) VALUES ('paquet', 100), ('sac', 10)
        ON CONFLICT (type) DO NOTHING`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS client (
          nom VARCHAR(100),
          email VARCHAR(255) PRIMARY KEY,
          mot_de_passe VARCHAR(255) NOT NULL,
          adresse VARCHAR(255),
          contact VARCHAR(20),
          date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          photo VARCHAR(255)
        )`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS livreur (
          nom VARCHAR(100),
          email VARCHAR(255) PRIMARY KEY,
          mot_de_passe VARCHAR(255) NOT NULL,
          code VARCHAR(50) UNIQUE NOT NULL,
          contact VARCHAR(20),
          date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS commande (
          id SERIAL PRIMARY KEY,
          email_client VARCHAR(255) REFERENCES client(email),
          type_produit VARCHAR(50) REFERENCES produit(type),
          quantite INTEGER NOT NULL,
          date_commande TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          prix_total INTEGER NOT NULL,
          statut VARCHAR(50) DEFAULT 'En attente',
          email_livreur VARCHAR(255) REFERENCES livreur(email)
        )`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          email_client VARCHAR(255) REFERENCES client(email),
          message_text TEXT NOT NULL,
          sent_by_admin BOOLEAN DEFAULT FALSE,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

    // Dans initDatabase(), ajoute cette table APRÈS la table messages
    await pool.query(`
            CREATE TABLE IF NOT EXISTS message_reads (
            user_email VARCHAR(255) NOT NULL,
            last_read TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_email)
            )
`);
    console.log("Table message_reads créée");

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin (
          email VARCHAR(255) PRIMARY KEY,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    const adminPasswordHash = bcrypt.hashSync("admin123", 10);
    await pool.query(
      `INSERT INTO admin (email, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      ["admin@cafe.com", adminPasswordHash]
    );
    console.log("Table admin créée et admin initial inséré si non existant");

    await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          email VARCHAR(255) REFERENCES client(email),
          token VARCHAR(255) NOT NULL,
          expires TIMESTAMP NOT NULL,
          PRIMARY KEY (email, token)
        )
      `);
    console.log("Tableau password_reset_tokens créé");

    await pool.query(`
        UPDATE commande
        SET statut = 'En attente'
        WHERE statut IS NULL
      `);
  } catch (err) {
    console.error("Erreur lors de l'initialisation des tables :", err.stack);
    throw err;
  }
}

(async () => {
  await initDatabase();
})();

pool.connect((err, client, release) => {
  if (err) {
    console.error("Erreur de connexion à PostgreSQL :", err.stack);
    process.exit(1);
  } else {
    console.log("Connexion à PostgreSQL réussie");
    release();
  }
});

// Endpoint pour tester l’envoi d’email
app.get("/test-email", async (req, res) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("Variables EMAIL_USER ou EMAIL_PASS manquantes dans .env");
      return res
        .status(500)
        .json({
          message: "Erreur de configuration : variables email manquantes.",
        });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Test Email - Café Mahatsara",
      text: "Ceci est un email de test pour vérifier que Nodemailer fonctionne correctement.",
    };
    await transporter.sendMail(mailOptions);
    res.json({
      message: "Email de test envoyé, vérifiez votre boîte de réception.",
    });
  } catch (err) {
    console.error("Erreur envoi email de test:", {
      message: err.message,
      stack: err.stack,
      code: err.code,
    });
    res
      .status(500)
      .json({
        message: "Erreur lors de l’envoi de l’email de test.",
        error: err.message,
      });
  }
});

// Endpoint Forgot Password - Version corrigée
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    console.log("🔐 Demande de réinitialisation pour:", email);

    // Validation de base
    if (!email) {
      return res.status(400).json({ message: "Email requis." });
    }

    // Vérification des variables d'environnement
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("❌ Variables email manquantes dans .env");
      return res.status(500).json({
        message:
          "Configuration serveur incomplète. Contactez l'administrateur.",
      });
    }

    // Vérifier si l'email existe
    const clientResult = await pool.query(
      "SELECT * FROM client WHERE email = $1",
      [email]
    );

    if (clientResult.rows.length === 0) {
      console.log("📧 Email non trouvé:", email);
      // Pour la sécurité, on ne révèle pas si l'email existe ou non
      return res.json({
        message:
          "Si cet email existe, vous recevrez un lien de réinitialisation.",
      });
    }

    // Générer le token
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 heure

    // Nettoyer les anciens tokens
    await pool.query(
      "DELETE FROM password_reset_tokens WHERE email = $1 OR expires < NOW()",
      [email]
    );

    // Insérer le nouveau token
    await pool.query(
      "INSERT INTO password_reset_tokens (email, token, expires) VALUES ($1, $2, $3)",
      [email, token, expires]
    );

    // Créer le lien de réinitialisation
    const resetLink = `http://localhost:3000/reset-password?email=${encodeURIComponent(
      email
    )}&token=${encodeURIComponent(token)}`;

    const mailOptions = {
      from: `"Café Mahatsara" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Réinitialisation de mot de passe - Café Mahatsara",
      html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B4513;">Réinitialisation de votre mot de passe</h2>
            <p>Bonjour,</p>
            <p>Vous avez demandé à réinitialiser votre mot de passe pour votre compte Café Mahatsara.</p>
            <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
            <a href="${resetLink}" 
              style="background-color: #8B4513; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px; display: inline-block;">
              Réinitialiser mon mot de passe
            </a>
            <p>Ce lien expirera dans 1 heure.</p>
            <p>Si vous n'avez pas fait cette demande, ignorez simplement cet email.</p>
            <hr style="margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
              Café Mahatsara - Votre café pur 100%
            </p>
          </div>
        `,
    };

    // Envoyer l'email
    console.log("📤 Envoi de l'email à:", email);
    await transporter.sendMail(mailOptions);
    console.log("✅ Email envoyé avec succès");

    res.json({
      message:
        "Si cet email existe, vous recevrez un lien de réinitialisation.",
    });
  } catch (err) {
    console.error("❌ Erreur forgot-password:", {
      message: err.message,
      code: err.code,
      stack: err.stack,
    });

    // Messages d'erreur plus précis
    if (err.code === "EAUTH") {
      return res.status(500).json({
        message: "Erreur d'authentification email. Vérifiez la configuration.",
      });
    } else if (err.code === "EENVELOPE") {
      return res.status(500).json({
        message: "Erreur d'envoi d'email. Adresse peut-être invalide.",
      });
    } else {
      return res.status(500).json({
        message: "Erreur temporaire. Réessayez dans quelques minutes.",
      });
    }
  }
});

app.post("/reset-password", async (req, res) => {
  const { email, token, newPassword } = req.body;
  try {
    if (!email || !token || !newPassword) {
      return res
        .status(400)
        .json({ message: "Email, token et nouveau mot de passe requis." });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({
          message: "Le mot de passe doit contenir au moins 6 caractères.",
        });
    }

    const tokenResult = await pool.query(
      "SELECT * FROM password_reset_tokens WHERE email = $1 AND token = $2 AND expires > NOW()",
      [email, token]
    );

    if (tokenResult.rows.length === 0) {
      return res
        .status(400)
        .json({ message: "Lien de réinitialisation invalide ou expiré." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE client SET mot_de_passe = $1 WHERE email = $2", [
      hashedPassword,
      email,
    ]);

    await pool.query("DELETE FROM password_reset_tokens WHERE email = $1", [
      email,
    ]);

    res.json({ message: "Mot de passe réinitialisé avec succès." });
  } catch (err) {
    console.error("Erreur lors de la réinitialisation du mot de passe :", {
      message: err.message,
      stack: err.stack,
      code: err.code,
    });
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la réinitialisation du mot de passe.",
        error: err.message,
      });
  }
});

// Endpoint login
app.post("/login", async (req, res) => {
  const { email, motDePasse } = req.body;
  try {
    if (!email || !motDePasse) {
      return res.status(400).json({ message: "Email et mot de passe requis." });
    }
    const adminResult = await pool.query(
      "SELECT password_hash FROM admin WHERE email = $1",
      [email]
    );
    if (adminResult.rows.length > 0) {
      const match = await bcrypt.compare(
        motDePasse,
        adminResult.rows[0].password_hash
      );
      if (match) {
        return res.json({
          message: "Connexion réussie en tant qu'admin !",
          userType: "admin",
        });
      } else {
        return res.status(401).json({ message: "Mot de passe incorrect." });
      }
    }
    let result = await pool.query("SELECT * FROM client WHERE email = $1", [
      email,
    ]);
    let user = result.rows[0];
    if (user) {
      const match = await bcrypt.compare(motDePasse, user.mot_de_passe);
      if (match) {
        return res.json({
          message: "Connexion réussie en tant que client !",
          userType: "client",
          email: user.email,
        });
      } else {
        return res.status(401).json({ message: "Mot de passe incorrect." });
      }
    }
    result = await pool.query("SELECT * FROM livreur WHERE email = $1", [
      email,
    ]);
    user = result.rows[0];
    if (user) {
      const match = await bcrypt.compare(motDePasse, user.mot_de_passe);
      if (match) {
        return res.json({
          message: "Connexion réussie en tant que livreur !",
          userType: "livreur",
          email: user.email,
          code: user.code,
        });
      } else {
        return res.status(401).json({ message: "Mot de passe incorrect." });
      }
    }

    return res.status(401).json({ message: "Email non trouvé." });
  } catch (err) {
    console.error("Erreur login :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la connexion.",
        error: err.message,
      });
  }
});

// Endpoint register
app.post("/register", upload.single("photo"), async (req, res) => {
  const { nom, email, motDePasse, adresse, contact } = req.body;
  let photo = req.file ? req.file.filename : null;

  try {
    if (!nom || !email || !motDePasse || !adresse || !contact) {
      return res.status(400).json({ message: "Tous les champs sont requis." });
    }

    const existingLivreur = await pool.query(
      "SELECT 1 FROM livreur WHERE email = $1",
      [email]
    );
    const existingClient = await pool.query(
      "SELECT 1 FROM client WHERE email = $1",
      [email]
    );
    if (existingLivreur.rows.length > 0 || existingClient.rows.length > 0) {
      return res.status(400).json({ message: "Email déjà utilisé." });
    }

    const hashedPassword = await bcrypt.hash(motDePasse, 10);
    const result = await pool.query(
      "INSERT INTO client (nom, email, mot_de_passe, adresse, contact, photo, date_inscription) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *",
      [nom, email, hashedPassword, adresse, contact, photo]
    );
    res
      .status(201)
      .json({ message: "Inscription réussie !", user: result.rows[0] });
  } catch (err) {
    console.error("Erreur inscription :", err.stack);
    if (err.code === "23505") {
      res.status(400).json({ message: "Email déjà utilisé." });
    } else if (err.message.includes("null value")) {
      res
        .status(400)
        .json({ message: "Erreur avec la photo, veuillez réessayer." });
    } else {
      res
        .status(500)
        .json({
          message: "Erreur serveur lors de l’inscription.",
          error: err.message,
        });
    }
  }
});

// Endpoint clients
app.get("/api/clients", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT nom, email, date_inscription FROM client ORDER BY date_inscription DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur récupération clients :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la récupération des clients.",
        error: err.message,
      });
  }
});

// Endpoint delete client
app.delete("/api/clients/:email", async (req, res) => {
  const { email } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM messages WHERE email_client = $1", [email]);

    await client.query(
      "UPDATE commande SET email_client = NULL WHERE email_client = $1",
      [email]
    );

    const deleteResult = await client.query(
      "DELETE FROM client WHERE email = $1 RETURNING *",
      [email]
    );

    if (deleteResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Client non trouvé." });
    }

    await client.query("COMMIT");
    res.json({ message: "Client supprimé avec succès." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erreur suppression client :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la suppression du client.",
        error: err.message,
      });
  } finally {
    client.release();
  }
});

// Endpoint get client
app.get("/api/clients/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query(
      "SELECT nom, contact, photo FROM client WHERE email = $1",
      [email]
    );
    if (result.rows.length > 0) {
      const client = result.rows[0];
      client.photo = client.photo
        ? `http://localhost:5000/uploads/${client.photo}`
        : "/default.jpg";
      res.json(client);
    } else {
      res.status(404).json({ message: "Client non trouvé." });
    }
  } catch (err) {
    console.error("Erreur récupération client :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la récupération du client.",
        error: err.message,
      });
  }
});

// Endpoint update client
app.put("/api/clients/:email", upload.single("photo"), async (req, res) => {
  const { email } = req.params;
  const { nom, contact, telephone } = req.body;
  const photo = req.file ? req.file.filename : req.body.photo;

  try {
    const contactValue = contact || telephone;

    const result = await pool.query(
      "UPDATE client SET nom = $1, contact = $2, photo = COALESCE($3, photo) WHERE email = $4 RETURNING *",
      [nom, contactValue, photo, email]
    );

    if (result.rows.length > 0) {
      const updatedClient = result.rows[0];
      updatedClient.photo = updatedClient.photo
        ? `http://localhost:5000/uploads/${updatedClient.photo}`
        : "/default.jpg";
      res.json({
        message: "Profil mis à jour avec succès.",
        user: updatedClient,
      });
    } else {
      res.status(404).json({ message: "Client non trouvé." });
    }
  } catch (err) {
    console.error("Erreur mise à jour client :", err.stack);
    res.status(500).json({
      message: "Erreur serveur lors de la mise à jour du profil.",
      error: err.message,
      details: err.detail,
    });
  }
});

// Endpoint produits
app.get("/api/produits", async (req, res) => {
  try {
    const result = await pool.query("SELECT type, quantite FROM produit");
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur récupération produits :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la récupération des produits.",
        error: err.message,
      });
  }
});

// Endpoint add produit
app.post("/api/produits", async (req, res) => {
  const { type, quantite } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO produit (type, quantite) VALUES ($1, $2) ON CONFLICT (type) DO UPDATE SET quantite = produit.quantite + $2 RETURNING *",
      [type, quantite]
    );
    res
      .status(201)
      .json({
        message: "Produit ajouté avec succès.",
        produit: result.rows[0],
      });
  } catch (err) {
    console.error("Erreur ajout produit :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de l’ajout du produit.",
        error: err.message,
      });
  }
});

// Endpoint commandes
app.post("/api/commandes", async (req, res) => {
  const { email, type, quantite } = req.body;
  try {
    const clientResult = await pool.query(
      "SELECT * FROM client WHERE email = $1",
      [email]
    );
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: "Client non trouvé." });
    }

    const produitResult = await pool.query(
      "SELECT quantite FROM produit WHERE type = $1",
      [type]
    );
    if (
      produitResult.rows.length === 0 ||
      produitResult.rows[0].quantite < quantite
    ) {
      return res.status(400).json({ message: "Stock insuffisant." });
    }
    const prixParUnite = type === "paquet" ? 13500 : 405000;
    const prixTotal = prixParUnite * quantite;

    const result = await pool.query(
      "INSERT INTO commande (email_client, type_produit, quantite, prix_total, statut) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [email, type, quantite, prixTotal, "En attente"]
    );
    const countResult = await pool.query(`
        SELECT COUNT(*) as count FROM commande WHERE statut = 'En attente'
      `);
    const pendingCount = parseInt(countResult.rows[0].count);

    io.emit("nouvelle-commande", { commande: result.rows[0], pendingCount });

    res.status(201).json({
      message: "Commande enregistrée avec succès, en attente de validation.",
      prixTotal,
      commande: result.rows[0],
    });
  } catch (err) {
    console.error("Erreur commande :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la création de la commande.",
        error: err.message,
      });
  }
});

// Endpoint get commandes
app.get("/api/commandes", async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT c.id, c.email_client, c.type_produit, c.quantite, 
              c.date_commande, c.prix_total, c.statut, c.email_livreur,
              c.position_livreur, c.derniere_mise_a_jour,
              cl.nom as client_nom, cl.adresse as client_adresse,
              l.nom as livreur_nom, l.contact as livreur_contact
        FROM commande c
        LEFT JOIN client cl ON c.email_client = cl.email
        LEFT JOIN livreur l ON c.email_livreur = l.email
        ORDER BY c.date_commande DESC
      `);
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur récupération commandes :", err);
    res.status(500).json({
      message: "Erreur serveur lors de la récupération des commandes.",
      error: err.message,
    });
  }
});

// Endpoint get commandes en attente
app.get("/api/commandes-en-attente", async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT c.id, c.email_client, c.type_produit, c.quantite, 
              c.date_commande, c.prix_total, cl.nom as client_nom, c.statut
        FROM commande c
        LEFT JOIN client cl ON c.email_client = cl.email
        WHERE c.statut = 'En attente'
        ORDER BY c.date_commande DESC
      `);
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur récupération commandes en attente :", err);
    res.status(500).json({
      message:
        "Erreur serveur lors de la récupération des commandes en attente.",
      error: err.message,
      stack: err.stack,
    });
  }
});

// Endpoint valider commande
app.put("/api/commandes/:id/valider", async (req, res) => {
  const { id } = req.params;
  const { email_livreur } = req.body;
  try {
    const commandeResult = await pool.query(
      "SELECT * FROM commande WHERE id = $1",
      [id]
    );
    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée." });
    }

    const commande = commandeResult.rows[0];

    const produitResult = await pool.query(
      "SELECT quantite FROM produit WHERE type = $1",
      [commande.type_produit]
    );
    if (produitResult.rows[0].quantite < commande.quantite) {
      return res
        .status(400)
        .json({ message: "Stock insuffisant pour valider cette commande." });
    }

    await pool.query(
      "UPDATE commande SET statut = $1, email_livreur = $2 WHERE id = $3",
      ["Validée", email_livreur, id]
    );
    await pool.query(
      "UPDATE produit SET quantite = quantite - $1 WHERE type = $2",
      [commande.quantite, commande.type_produit]
    );

    const updatedProduits = await pool.query(
      "SELECT type, quantite FROM produit"
    );
    const countResult = await pool.query(`
        SELECT COUNT(*) as count FROM commande WHERE statut = 'En attente'
      `);
    const pendingCount = parseInt(countResult.rows[0].count);

    io.emit("commande-validee", {
      email_client: commande.email_client,
      id_commande: id,
      statut: "Validée",
      pendingCount,
      updatedProduits: updatedProduits.rows,
      email_livreur,
    });

    res.json({ message: "Commande validée et assignée avec succès." });
  } catch (err) {
    console.error("Erreur validation commande :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la validation de la commande.",
        error: err.message,
      });
  }
});

// Endpoint historique commandes
app.get("/api/commandes/historique", async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT 
          c.id,
          cl.nom AS client_nom,
          c.quantite,
          c.date_commande,
          p.type AS type_produit,
          c.prix_total,
          c.email_livreur,
          c.statut
        FROM commande c
        LEFT JOIN client cl ON c.email_client = cl.email
        LEFT JOIN produit p ON c.type_produit = p.type
        ORDER BY c.date_commande DESC
      `);
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur récupération historique commandes:", err.stack);
    res.status(500).json({
      message:
        "Erreur serveur lors de la récupération de l’historique des commandes.",
      error: err.message,
    });
  }
});

// Endpoint commandes par client
app.get("/api/commandes/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const clientResult = await pool.query(
      "SELECT 1 FROM client WHERE email = $1",
      [email]
    );
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: "Client non trouvé." });
    }

    const clientEmail = req.headers["x-client-email"];
    if (clientEmail !== email) {
      return res
        .status(403)
        .json({ message: "Accès non autorisé à cet historique." });
    }

    const result = await pool.query(
      `SELECT id, type_produit, quantite, date_commande, prix_total, statut 
        FROM commande 
        WHERE email_client = $1 
        ORDER BY date_commande DESC`,
      [email]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(`Erreur récupération commandes pour ${email} :`, err);
    res.status(500).json({
      message: "Erreur serveur lors de la récupération des commandes.",
      error: err.message,
      stack: err.stack,
    });
  }
});

// Endpoint commandes par livreur
app.get("/api/commandes/livreur/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const livreurResult = await pool.query(
      "SELECT 1 FROM livreur WHERE email = $1",
      [email]
    );
    if (livreurResult.rows.length === 0) {
      return res.status(404).json({ message: "Livreur non trouvé." });
    }

    const result = await pool.query(
      `SELECT c.id, c.type_produit, c.quantite, c.date_commande, c.prix_total, c.statut, 
                COALESCE(cl.nom, 'Non spécifié') AS client_nom, COALESCE(cl.adresse, 'Non spécifié') AS client_adresse, COALESCE(cl.contact, 'Non spécifié') AS client_contact
        FROM commande c
        LEFT JOIN client cl ON c.email_client = cl.email
        WHERE c.email_livreur = $1 AND c.statut IN ('Validée', 'En préparation', 'En route pour livraison', 'Livré')
        ORDER BY c.date_commande DESC`,
      [email]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(
      `Erreur récupération commandes pour livreur ${email} :`,
      err.stack
    );
    res.status(500).json({
      message: "Erreur serveur lors de la récupération des commandes.",
      error: err.message,
    });
  }
});

// Endpoint update statut commande
app.put("/api/commandes/:id/statut", async (req, res) => {
  const { id } = req.params;
  const { nouveauStatut, userType, email } = req.body;

  try {
    const commandeResult = await pool.query(
      "SELECT * FROM commande WHERE id = $1",
      [id]
    );
    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée." });
    }

    const commande = commandeResult.rows[0];
    if (userType !== "livreur" || commande.email_livreur !== email) {
      return res.status(403).json({ message: "Accès non autorisé." });
    }

    const validStatuses = [
      "En préparation",
      "En route pour livraison",
      "Livré",
    ];
    if (!validStatuses.includes(nouveauStatut)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    await pool.query("UPDATE commande SET statut = $1 WHERE id = $2", [
      nouveauStatut,
      id,
    ]);

    io.to(commande.email_client).emit("statut-mise-a-jour", {
      id,
      statut: nouveauStatut,
      message: `Votre commande #${id} est ${nouveauStatut.toLowerCase()}.`,
    });
    io.emit("commande-mise-a-jour", { id, statut: nouveauStatut });
    res.json({ message: "Statut mis à jour avec succès." });
  } catch (err) {
    console.error("Erreur mise à jour statut:", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la mise à jour du statut.",
        error: err.message,
      });
  }
});

// Endpoint livreurs
app.get("/api/livreurs", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT nom, email, code, contact, date_inscription FROM livreur ORDER BY date_inscription DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur récupération livreurs :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la récupération des livreurs.",
        error: err.message,
      });
  }
});

// Endpoint add livreur
app.post("/api/livreurs", async (req, res) => {
  const { nom, email, code, contact, motDePasse } = req.body;
  try {
    if (!nom || !email || !code || !contact) {
      return res.status(400).json({ message: "Tous les champs sont requis." });
    }

    const hashedPassword = await bcrypt.hash(motDePasse || `${code}123`, 10);

    const result = await pool.query(
      `INSERT INTO livreur 
        (nom, email, mot_de_passe, code, contact, date_inscription) 
        VALUES ($1, $2, $3, $4, $5, NOW()) 
        RETURNING nom, email, code, contact, date_inscription`,
      [nom, email, hashedPassword, code, contact]
    );

    res.status(201).json({
      message: "Livreur ajouté avec succès.",
      livreur: result.rows[0],
    });
  } catch (err) {
    console.error("Erreur ajout livreur :", err.stack);
    if (err.code === "23505") {
      const detail = err.detail.includes("email")
        ? "Email déjà utilisé."
        : "Code déjà utilisé.";
      res.status(400).json({ message: detail });
    } else {
      res.status(500).json({
        message: "Erreur serveur lors de l’ajout du livreur.",
        error: err.message,
      });
    }
  }
});

// Endpoint messages
app.get("/api/messages/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query(
      `SELECT message_text, sent_by_admin, timestamp 
        FROM messages 
        WHERE email_client = $1 
        ORDER BY timestamp ASC`,
      [email]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur récupération messages :", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la récupération des messages.",
        error: err.message,
      });
  }
});

// Fonction pour obtenir le nom du client
async function getClientName(email) {
  try {
    const result = await pool.query("SELECT nom FROM client WHERE email = $1", [
      email,
    ]);
    return result.rows[0]?.nom || "Client";
  } catch (err) {
    console.error("Erreur récupération nom client:", err);
    return "Client";
  }
}

// Fonction pour obtenir le nombre de messages non lus
async function getUnreadCount(email) {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM messages 
       WHERE email_client = $1 AND sent_by_admin = false 
       AND timestamp > (SELECT COALESCE(MAX(last_read), NOW() - INTERVAL '7 days') FROM message_reads WHERE user_email = $2)`,
      [email, email]
    );
    return parseInt(result.rows[0].count);
  } catch (err) {
    console.error("Erreur récupération compteur non lus:", err);
    return 0;
  }
}

// Socket.io connection - Version corrigée et simplifiée
io.on("connection", (socket) => {
  console.log("✅ Nouvelle connexion socket établie:", socket.id);

  socket.on("join", ({ email, userType }) => {
    socket.join(email);
    if (userType === "admin") {
      socket.join("admin-room");
      console.log(`👑 Admin ${email} a rejoint la room admin`);
    }
    console.log(`📧 Utilisateur ${email} (${userType}) a rejoint son canal socket`);
  });

  // AJOUTER CET ÉVÉNEMENT POUR ADMIN
  socket.on('join-admin', () => {
    socket.join('admin-room');
    console.log('👑 Admin a rejoint la room admin');
  });

  socket.on("leave", ({ email }) => {
    socket.leave(email);
    console.log(`🚪 Utilisateur ${email} a quitté son canal socket`);
  });

  // Événement pour envoyer des messages
  socket.on(
    "send-message",
    async ({ email_client, message_text, sent_by_admin }) => {
      try {
        console.log("💬 Nouveau message reçu:", {
          email_client,
          message_text,
          sent_by_admin,
        });

        // Sauvegarder le message en base
        const result = await pool.query(
          `INSERT INTO messages (email_client, message_text, sent_by_admin) 
      VALUES ($1, $2, $3) 
      RETURNING *`,
          [email_client, message_text, sent_by_admin]
        );

        const message = result.rows[0];
        console.log("💾 Message sauvegardé en base:", message.id);

        // Préparer les données du message
        const messageData = {
          id: message.id,
          email_client: message.email_client,
          message_text: message.message_text,
          sent_by_admin: message.sent_by_admin,
          timestamp: message.timestamp,
        };

        // Émettre le message au client
        io.to(email_client).emit("new-message", messageData);

        // Émettre le message à l'admin
        io.to("admin-room").emit("new-message-admin", {
          ...messageData,
          client_name: await getClientName(email_client),
        });

        console.log("📤 Messages émis avec succès");
      } catch (err) {
        console.error("❌ Erreur sauvegarde message :", err.stack);
        socket.emit("message-error", {
          error: "Erreur lors de l'envoi du message",
        });
      }
    }
  );

  // Dans server.js - Ajouter après les autres socket.on
socket.on('livreur-accepte', (data) => {
  console.log('📦 Livreur a accepté la commande:', data);
  
  // Émettre à tous les admins que le livreur a accepté
  io.to('admin-room').emit('livreur-accepte-commande', {
    commandeId: data.commandeId,
    livreurEmail: data.livreurEmail,
    message: data.message,
    timestamp: new Date()
  });
  
  // Émettre aussi une mise à jour générale de commande
  io.emit('commande-mise-a-jour', { 
    id: data.commandeId, 
    statut: 'En préparation' 
  });
});

  socket.on("disconnect", () => {
    console.log("❌ Connexion socket fermée:", socket.id);
  });
});

// Endpoint update position livreur
app.post("/api/livreurs/:email/position", async (req, res) => {
  const { email } = req.params;
  const { latitude, longitude, commandeId } = req.body;

  try {
    console.log("📡 Réception position livreur:", {
      email,
      latitude,
      longitude,
      commandeId,
    });

    await pool.query(
      "UPDATE livreur SET position_actuelle = $1, en_livraison = $2 WHERE email = $3",
      [{ latitude, longitude }, !!commandeId, email]
    );

    if (commandeId) {
      await pool.query(
        "UPDATE commande SET position_livreur = $1, derniere_mise_a_jour = NOW() WHERE id = $2",
        [{ latitude, longitude }, commandeId]
      );
    }

    res.json({ message: "Position mise à jour avec succès." });
  } catch (err) {
    console.error("Erreur mise à jour position:", err);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la mise à jour de la position.",
        error: err.message,
      });
  }
});

// Endpoint suivi commande
app.get("/api/commandes/:id/suivi", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
        SELECT c.id, c.statut, c.position_livreur, c.derniere_mise_a_jour,
              l.nom as livreur_nom, l.contact as livreur_contact,
              cl.nom as client_nom, cl.adresse as client_adresse
        FROM commande c
        LEFT JOIN livreur l ON c.email_livreur = l.email
        LEFT JOIN client cl ON c.email_client = cl.email
        WHERE c.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erreur récupération suivi:", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la récupération du suivi.",
        error: err.message,
      });
  }
});

// Endpoint livraisons en cours
app.get("/api/livraisons-en-cours", async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT 
          c.id,
          c.email_client,
          cl.nom AS client_nom,
          cl.adresse AS client_adresse,
          cl.contact AS client_contact,
          c.type_produit,
          c.quantite,
          c.prix_total,
          c.statut,
          c.date_commande,
          c.email_livreur,
          l.nom AS livreur_nom,
          l.contact AS livreur_contact,
          c.position_livreur,
          c.derniere_mise_a_jour
        FROM commande c
        LEFT JOIN client cl ON c.email_client = cl.email
        LEFT JOIN livreur l ON c.email_livreur = l.email
        WHERE c.statut IN ('Validée', 'En préparation', 'En route pour livraison')
        ORDER BY 
          CASE c.statut 
            WHEN 'En route pour livraison' THEN 1
            WHEN 'En préparation' THEN 2
            WHEN 'Validée' THEN 3
            ELSE 4
          END,
          c.date_commande DESC
      `);
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur récupération livraisons en cours:", err.stack);
    res.status(500).json({
      message: "Erreur serveur lors de la récupération des livraisons.",
      error: err.message,
    });
  }
});

// Dans server.js - Endpoint générer facture
app.post("/api/commandes/:id/generer-facture", async (req, res) => {
  const { id } = req.params;

  try {
    const commandeResult = await pool.query(
      `
        SELECT c.*, cl.nom as client_nom, cl.adresse, cl.contact,
              l.nom as livreur_nom, l.contact as livreur_contact
        FROM commande c
        LEFT JOIN client cl ON c.email_client = cl.email
        LEFT JOIN livreur l ON c.email_livreur = l.email
        WHERE c.id = $1
      `,
      [id]
    );

    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée." });
    }

    const commande = commandeResult.rows[0];

    await pool.query("UPDATE commande SET statut = $1 WHERE id = $2", [
      "En préparation",
      id,
    ]);

    // CORRECTION: Utiliser "sac" au lieu de "sec"
    const typeProduitCorrige = commande.type_produit === 'sec' ? 'sac' : commande.type_produit;

    const facture = {
      id_commande: commande.id,
      date_commande: commande.date_commande,
      date_facture: new Date(),
      client: {
        nom: commande.client_nom,
        adresse: commande.adresse,
        contact: commande.contact,
      },
      livreur: {
        nom: commande.livreur_nom,
        contact: commande.livreur_contact,
      },
      produits: [
        {
          type: typeProduitCorrige, // UTILISER LA VERSION CORRIGÉE
          quantite: commande.quantite,
          prix_unitaire: commande.type_produit === "paquet" ? 13500 : 405000,
          prix_total: commande.prix_total,
        },
      ],
      statut: "En préparation",
    };

    io.emit("facture-generee", {
      commande_id: id,
      facture: facture,
      message: `Facture générée pour la commande #${id} - Statut: En préparation`,
    });

    if (commande.email_livreur) {
      io.to(commande.email_livreur).emit("notification-livreur", {
        message: `Nouvelle facture générée pour la commande #${id}. La commande est en préparation.`,
        commandeId: id,
      });
    }

    res.json({
      message: "Facture générée avec succès et statut mis à jour.",
      facture: facture,
    });
  } catch (err) {
    console.error("Erreur génération facture:", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la génération de la facture.",
        error: err.message,
      });
  }
});

// Endpoint annuler commande
app.put("/api/commandes/:id/annuler", async (req, res) => {
  const { id } = req.params;

  try {
    const commandeResult = await pool.query(
      "SELECT * FROM commande WHERE id = $1",
      [id]
    );
    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée." });
    }

    const commande = commandeResult.rows[0];

    if (
      commande.statut === "Validée" ||
      commande.statut === "En préparation" ||
      commande.statut === "En route pour livraison"
    ) {
      await pool.query(
        "UPDATE produit SET quantite = quantite + $1 WHERE type = $2",
        [commande.quantite, commande.type_produit]
      );
    }

    await pool.query("UPDATE commande SET statut = $1 WHERE id = $2", [
      "Annulée",
      id,
    ]);

    io.to(commande.email_client).emit("commande-annulee", {
      id,
      message: `Votre commande #${id} a été annulée.`,
    });
    io.to("admin-room").emit("commande-annulee", {
      id,
      message: `Commande #${id} annulée par l'admin.`,
    });

    res.json({ message: "Commande annulée avec succès." });
  } catch (err) {
    console.error("Erreur annulation commande:", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de l’annulation de la commande.",
        error: err.message,
      });
  }
});

// Endpoint confirmer facture
app.put("/api/factures/:id/confirmer", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query("UPDATE commande SET statut = $1 WHERE id = $2", [
      "Facture confirmée",
      id,
    ]);

    io.emit("facture-confirmee", {
      commande_id: id,
      message: `Facture confirmée pour la commande #${id}`,
    });

    res.json({ message: "Facture confirmée avec succès." });
  } catch (err) {
    console.error("Erreur confirmation facture:", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la confirmation de la facture.",
        error: err.message,
      });
  }
});

// Endpoint get facture
app.get("/api/factures/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const commandeResult = await pool.query(
      `
        SELECT c.*, cl.nom as client_nom, cl.adresse, cl.contact,
              l.nom as livreur_nom, l.contact as livreur_contact
        FROM commande c
        LEFT JOIN client cl ON c.email_client = cl.email
        LEFT JOIN livreur l ON c.email_livreur = l.email
        WHERE c.id = $1
      `,
      [id]
    );

    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée." });
    }

    const commande = commandeResult.rows[0];

    const facture = {
      id_commande: commande.id,
      date_commande: commande.date_commande,
      date_facture: new Date(),
      client: {
        nom: commande.client_nom,
        adresse: commande.adresse,
        contact: commande.contact,
      },
      livreur: {
        nom: commande.livreur_nom,
        contact: commande.livreur_contact,
      },
      produits: [
        {
          type: commande.type_produit,
          quantite: commande.quantite,
          prix_unitaire: commande.type_produit === "paquet" ? 13500 : 405000,
          prix_total: commande.prix_total,
        },
      ],
      statut: commande.statut,
    };

    res.json({ facture: facture });
  } catch (err) {
    console.error("Erreur récupération facture:", err.stack);
    res
      .status(500)
      .json({
        message: "Erreur serveur lors de la récupération de la facture.",
        error: err.message,
      });
  }
});

// Endpoint update livreur
app.put("/api/livreurs/:email", async (req, res) => {
  const { email } = req.params;
  const { nom, code, contact } = req.body;

  try {
    if (!nom || !code || !contact) {
      return res.status(400).json({ message: "Tous les champs sont requis." });
    }

    const result = await pool.query(
      `UPDATE livreur 
       SET nom = $1, code = $2, contact = $3 
       WHERE email = $4 
       RETURNING nom, email, code, contact, date_inscription`,
      [nom, code, contact, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Livreur non trouvé." });
    }

    res.json({
      message: "Livreur modifié avec succès.",
      livreur: result.rows[0],
    });
  } catch (err) {
    console.error("Erreur modification livreur :", err.stack);
    if (err.code === "23505") {
      res.status(400).json({ message: "Code déjà utilisé." });
    } else {
      res.status(500).json({
        message: "Erreur serveur lors de la modification du livreur.",
        error: err.message,
      });
    }
  }
});

// Endpoint delete livreur
app.delete("/api/livreurs/:email", async (req, res) => {
  const { email } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Vérifier si le livreur a des commandes en cours
    const commandesResult = await client.query(
      "SELECT COUNT(*) FROM commande WHERE email_livreur = $1 AND statut IN ($2, $3, $4)",
      [email, "Validée", "En préparation", "En route pour livraison"]
    );

    const commandesEnCours = parseInt(commandesResult.rows[0].count);
    if (commandesEnCours > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message:
          "Impossible de supprimer ce livreur car il a des commandes en cours.",
      });
    }

    // Mettre à jour les commandes pour retirer l'association avec le livreur
    await client.query(
      "UPDATE commande SET email_livreur = NULL WHERE email_livreur = $1",
      [email]
    );

    // Supprimer le livreur
    const deleteResult = await client.query(
      "DELETE FROM livreur WHERE email = $1 RETURNING *",
      [email]
    );

    if (deleteResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Livreur non trouvé." });
    }

    await client.query("COMMIT");
    res.json({ message: "Livreur supprimé avec succès." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erreur suppression livreur :", err.stack);
    res.status(500).json({
      message: "Erreur serveur lors de la suppression du livreur.",
      error: err.message,
    });
  } finally {
    client.release();
  }
});

// ENDPOINT POUR RECEVOIR LES POSITIONS DES LIVREURS - VERSION AMÉLIORÉE
app.post('/api/livreurs/:email/position', async (req, res) => {
  const { email } = req.params;
  const { latitude, longitude, commandeId, accuracy } = req.body;

  try {
    console.log('📍 Réception position livreur:', { 
      email, 
      latitude, 
      longitude, 
      commandeId,
      timestamp: new Date().toISOString() 
    });

    // Vérification livreur
    const livreurCheck = await pool.query(
      'SELECT nom, contact FROM livreur WHERE email = $1', 
      [email]
    );
    
    if (livreurCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Livreur non trouvé.' });
    }

    const nomLivreur = livreurCheck.rows[0].nom;
    const contactLivreur = livreurCheck.rows[0].contact;

    // Mise à jour position avec timestamp
    await pool.query(
      `UPDATE livreur SET 
        position_actuelle = $1, 
        en_livraison = $2, 
        derniere_mise_a_jour_position = NOW() 
       WHERE email = $3`,
      [{ latitude, longitude, accuracy }, !!commandeId, email]
    );

    // Mise à jour commande si applicable
    if (commandeId) {
      await pool.query(
        `UPDATE commande SET 
          position_livreur = $1, 
          derniere_mise_a_jour = NOW() 
         WHERE id = $2`,
        [{ latitude, longitude, accuracy }, commandeId]
      );
    }

    // Préparation données pour l'admin
    const positionData = {
      email,
      nom: nomLivreur,
      contact: contactLivreur,
      latitude,
      longitude,
      accuracy: accuracy || 10,
      commandeId,
      timestamp: new Date(),
      en_livraison: !!commandeId,
      // Ajout des coordonnées DMS pour affichage
      position_dms: "21°27'48.5\"S 47°06'36.5\"E"
    };

    console.log('📤 Émission position à l\'admin:', positionData);
    
    // Émission à TOUS les admins connectés
    io.to('admin-room').emit('position-livreur-global', positionData);
    
    // Broadcast général pour le suivi en temps réel
    io.emit('position-livreur-global', positionData);

    res.json({ 
      message: 'Position mise à jour avec succès.',
      data: positionData 
    });
  } catch (err) {
    console.error('❌ Erreur mise à jour position:', err);
    res.status(500).json({ 
      message: 'Erreur serveur lors de la mise à jour de la position.', 
      error: err.message 
    });
  }
});

// Endpoint positions livreurs
app.get("/api/livreurs/positions", async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT email, nom, position_actuelle, en_livraison
        FROM livreur 
        WHERE position_actuelle IS NOT NULL
      `);

    const livreurs = result.rows.map((livreur) => ({
      email: livreur.email,
      nom: livreur.nom,
      position_actuelle: livreur.position_actuelle,
      en_livraison: livreur.en_livraison,
    }));

    res.json(livreurs);
  } catch (err) {
    console.error("Erreur récupération positions livreurs:", err.stack);
    res.status(500).json({
      message:
        "Erreur serveur lors de la récupération des positions des livreurs.",
      error: err.message,
    });
  }
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`Serveur démarré sur le port ${process.env.PORT || 5000}`);
});
