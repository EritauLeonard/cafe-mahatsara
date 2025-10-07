require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage: storage });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_DATABASE || 'cafe_mahatsara',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432,
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
      console.log('Colonne statut ajoutée à la table commande');
    }

    // Vérifier et ajouter la colonne email_livreur si elle n'existe pas
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
      console.log('Colonne email_livreur ajoutée à la table commande');
    }

    // Ajouter les colonnes pour le suivi de livraison
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
      console.log('Colonnes de suivi ajoutées à la table commande');
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS produit (
        type VARCHAR(50) PRIMARY KEY,
        quantite INTEGER NOT NULL DEFAULT 0
      )`
    );
    await pool.query(`
      INSERT INTO produit (type, quantite) VALUES ('paquet', 100), ('sac', 10)
      ON CONFLICT (type) DO NOTHING`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS client (
        nom VARCHAR(100),
        email VARCHAR(255) PRIMARY KEY,
        mot_de_passe VARCHAR(255) NOT NULL,
        adresse VARCHAR(255),
        contact VARCHAR(20),
        date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        photo VARCHAR(255)
      )`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS livreur (
        nom VARCHAR(100),
        email VARCHAR(255) PRIMARY KEY,
        mot_de_passe VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        contact VARCHAR(20),
        date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );

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
      )`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        email_client VARCHAR(255) REFERENCES client(email),
        message_text TEXT NOT NULL,
        sent_by_admin BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );

    // Ajout de la table admin
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin (
        email VARCHAR(255) PRIMARY KEY,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Insérer l'admin avec email et mot de passe existants
    const adminPasswordHash = bcrypt.hashSync('admin123', 10);
    await pool.query(
      `INSERT INTO admin (email, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      ['admin@cafe.com', adminPasswordHash]
    );
    console.log('Table admin créée et admin initial inséré si non existant');

    await pool.query(`
      UPDATE commande
      SET statut = 'En attente'
      WHERE statut IS NULL
    `);
  } catch (err) {
    console.error('Erreur lors de l\'initialisation des tables :', err.stack);
    throw err;
  }
}

(async () => {
  await initDatabase();
})();

pool.connect((err, client, release) => {
  if (err) {
    console.error('Erreur de connexion à PostgreSQL :', err.stack);
    process.exit(1);
  } else {
    console.log('Connexion à PostgreSQL réussie');
    release();
  }
});

// Supprimer ADMIN_CREDENTIALS car il est maintenant dans la DB
app.post('/login', async (req, res) => {
  const { email, motDePasse } = req.body;
  try {
    if (!email || !motDePasse) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }
    // Vérification pour l'admin dans la table admin
    const adminResult = await pool.query('SELECT password_hash FROM admin WHERE email = $1', [email]);
    if (adminResult.rows.length > 0) {
      const match = await bcrypt.compare(motDePasse, adminResult.rows[0].password_hash);
      if (match) {
        return res.json({ message: 'Connexion réussie en tant qu\'admin !', userType: 'admin' });
      } else {
        return res.status(401).json({ message: 'Mot de passe incorrect' });
      }
    }
    let result = await pool.query('SELECT * FROM client WHERE email = $1', [email]);
    let user = result.rows[0];
    if (user) {
      const match = await bcrypt.compare(motDePasse, user.mot_de_passe);
      if (match) {
        return res.json({ message: 'Connexion réussie en tant que client !', userType: 'client', email: user.email });
      } else {
        return res.status(401).json({ message: 'Mot de passe incorrect' });
      }
    }
    result = await pool.query('SELECT * FROM livreur WHERE email = $1', [email]);
    user = result.rows[0];
    if (user) {
      const match = await bcrypt.compare(motDePasse, user.mot_de_passe);
      if (match) {
        return res.json({ message: 'Connexion réussie en tant que livreur !', userType: 'livreur', email: user.email, code: user.code });
      } else {
        return res.status(401).json({ message: 'Mot de passe incorrect' });
      }
    }

    return res.status(401).json({ message: 'Email non trouvé' });
  } catch (err) {
    console.error('Erreur login :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/register', upload.single('photo'), async (req, res) => {
  const { nom, email, motDePasse, adresse, contact } = req.body;
  let photo = req.file ? req.file.filename : null;

  try {
    if (!nom || !email || !motDePasse || !adresse || !contact) {
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    }

    const existingLivreur = await pool.query('SELECT 1 FROM livreur WHERE email = $1', [email]);
    const existingClient = await pool.query('SELECT 1 FROM client WHERE email = $1', [email]);
    if (existingLivreur.rows.length > 0 || existingClient.rows.length > 0) {
      return res.status(400).json({ message: 'Email déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(motDePasse, 10);
    const result = await pool.query(
      'INSERT INTO client (nom, email, mot_de_passe, adresse, contact, photo, date_inscription) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      [nom, email, hashedPassword, adresse, contact, photo]
    );
    res.status(201).json({ message: 'Inscription réussie !', user: result.rows[0] });
  } catch (err) {
    console.error('Erreur inscription :', err.stack);
    if (err.code === '23505') {
      res.status(400).json({ message: 'Email déjà utilisé' });
    } else if (err.message.includes('null value')) {
      res.status(400).json({ message: 'Une erreur est survenue avec la photo. Veuillez réessayer.' });
    } else {
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  }
});

app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT nom, email, date_inscription FROM client ORDER BY date_inscription DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur récupération clients :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.delete('/api/clients/:email', async (req, res) => {
  const { email } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Début d'une transaction

    // Supprimer les messages liés au client
    await client.query('DELETE FROM messages WHERE email_client = $1', [email]);

    // Mettre à jour les commandes pour supprimer la référence au client (optionnel : tu peux aussi les supprimer)
    await client.query('UPDATE commande SET email_client = NULL WHERE email_client = $1', [email]);

    // Supprimer le client
    const deleteResult = await client.query('DELETE FROM client WHERE email = $1 RETURNING *', [email]);

    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Client non trouvé' });
    }

    await client.query('COMMIT'); // Valider la transaction
    res.json({ message: 'Client supprimé avec succès' });
  } catch (err) {
    await client.query('ROLLBACK'); // Annuler la transaction en cas d'erreur
    console.error('Erreur suppression client :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  } finally {
    client.release(); // Libérer la connexion
  }
});

// Dans app.get('/api/clients/:email')
app.get('/api/clients/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query('SELECT nom, contact, photo FROM client WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      const client = result.rows[0];
      // Corrigez le chemin de la photo
      client.photo = client.photo ? `http://localhost:5000/uploads/${client.photo}` : '/default.jpg';
      res.json(client);
    } else {
      res.status(404).json({ message: 'Client non trouvé' });
    }
  } catch (err) {
    console.error('Erreur récupération client :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Dans app.put('/api/clients/:email')
app.put('/api/clients/:email', upload.single('photo'), async (req, res) => {
  const { email } = req.params;
  const { nom, contact, telephone } = req.body; // Ajoute telephone pour compatibilité
  const photo = req.file ? req.file.filename : req.body.photo;
  
  try {
    // Utiliser contact ou telephone selon ce qui est fourni
    const contactValue = contact || telephone;
    
    const result = await pool.query(
      'UPDATE client SET nom = $1, contact = $2, photo = COALESCE($3, photo) WHERE email = $4 RETURNING *',
      [nom, contactValue, photo, email]
    );
    
    if (result.rows.length > 0) {
      const updatedClient = result.rows[0];
      updatedClient.photo = updatedClient.photo 
        ? `http://localhost:5000/uploads/${updatedClient.photo}` 
        : '/default.jpg';
      res.json({ message: 'Profil mis à jour avec succès', user: updatedClient });
    } else {
      res.status(404).json({ message: 'Client non trouvé' });
    }
  } catch (err) {
    console.error('Erreur mise à jour client :', err.stack);
    res.status(500).json({ 
      message: 'Erreur serveur lors de la mise à jour du profil', 
      error: err.message,
      details: err.detail 
    });
  }
});

app.get('/api/produits', async (req, res) => {
  try {
    const result = await pool.query('SELECT type, quantite FROM produit');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur récupération produits :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/produits', async (req, res) => {
  const { type, quantite } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO produit (type, quantite) VALUES ($1, $2) ON CONFLICT (type) DO UPDATE SET quantite = produit.quantite + $2 RETURNING *',
      [type, quantite]
    );
    res.status(201).json({ message: 'Produit ajouté avec succès', produit: result.rows[0] });
  } catch (err) {
    console.error('Erreur ajout produit :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/commandes', async (req, res) => {
  const { email, type, quantite } = req.body;
  try {
    const clientResult = await pool.query('SELECT * FROM client WHERE email = $1', [email]);
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }

    const produitResult = await pool.query('SELECT quantite FROM produit WHERE type = $1', [type]);
    if (produitResult.rows.length === 0 || produitResult.rows[0].quantite < quantite) {
      return res.status(400).json({ message: 'Stock insuffisant' });
    }
    const prixParUnite = (type === 'paquet') ? 13500 : 405000;
    const prixTotal = prixParUnite * quantite;

    const result = await pool.query(
      'INSERT INTO commande (email_client, type_produit, quantite, prix_total, statut) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [email, type, quantite, prixTotal, 'En attente']
    );
    const countResult = await pool.query(`
      SELECT COUNT(*) as count FROM commande WHERE statut = 'En attente'
    `);
    const pendingCount = parseInt(countResult.rows[0].count);

    io.emit('nouvelle-commande', { commande: result.rows[0], pendingCount });

    res.status(201).json({ 
      message: 'Commande enregistrée avec succès, en attente de validation', 
      prixTotal, 
      commande: result.rows[0] 
    });
  } catch (err) {
    console.error('Erreur commande :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Route pour obtenir TOUTES les commandes
app.get('/api/commandes', async (req, res) => {
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
    console.error('Erreur récupération commandes :', err);
    res.status(500).json({ 
      message: 'Erreur serveur lors de la récupération des commandes', 
      error: err.message 
    });
  }
});

app.get('/api/commandes-en-attente', async (req, res) => {
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
    console.error('Erreur récupération commandes en attente :', err);
    res.status(500).json({ 
      message: 'Erreur serveur lors de la récupération des commandes en attente', 
      error: err.message,
      stack: err.stack
    });
  }
});

app.put('/api/commandes/:id/valider', async (req, res) => {
  const { id } = req.params;
  const { email_livreur } = req.body; // Ajout de l'email du livreur
  try {
    const commandeResult = await pool.query('SELECT * FROM commande WHERE id = $1', [id]);
    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    const commande = commandeResult.rows[0];

    const produitResult = await pool.query('SELECT quantite FROM produit WHERE type = $1', [commande.type_produit]);
    if (produitResult.rows[0].quantite < commande.quantite) {
      return res.status(400).json({ message: 'Stock insuffisant pour valider cette commande' });
    }

    await pool.query(
      'UPDATE commande SET statut = $1, email_livreur = $2 WHERE id = $3',
      ['Validée', email_livreur, id]
    );
    await pool.query(
      'UPDATE produit SET quantite = quantite - $1 WHERE type = $2',
      [commande.quantite, commande.type_produit]
    );

    const updatedProduits = await pool.query('SELECT type, quantite FROM produit');
    const countResult = await pool.query(`
      SELECT COUNT(*) as count FROM commande WHERE statut = 'En attente'
    `);
    const pendingCount = parseInt(countResult.rows[0].count);

    io.emit('commande-validee', { 
      email_client: commande.email_client, 
      id_commande: id, 
      statut: 'Validée', 
      pendingCount,
      updatedProduits: updatedProduits.rows,
      email_livreur
    });

    res.json({ message: 'Commande validée et assignée avec succès' });
  } catch (err) {
    console.error('Erreur validation commande :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Nouvelle route pour l'historique des commandes
app.get('/api/commandes/historique', async (req, res) => {
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
    console.error('Erreur récupération historique commandes:', err.stack);
    res.status(500).json({ 
      message: 'Erreur serveur lors de la récupération de l\'historique', 
      error: err.message 
    });
  }
});

/* dépendre en haut cette partie commande */
app.get('/api/commandes/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const clientResult = await pool.query('SELECT 1 FROM client WHERE email = $1', [email]);
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }

    const clientEmail = req.headers['x-client-email'];
    if (clientEmail !== email) {
      return res.status(403).json({ message: 'Accès non autorisé à cet historique' });
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
      message: 'Erreur serveur lors de la récupération des commandes', 
      error: err.message,
      stack: err.stack
    });
  }
});

app.get('/api/commandes/livreur/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const livreurResult = await pool.query('SELECT 1 FROM livreur WHERE email = $1', [email]);
    if (livreurResult.rows.length === 0) {
      return res.status(404).json({ message: 'Livreur non trouvé' });
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
    console.error(`Erreur récupération commandes pour livreur ${email} :`, err.stack);
    res.status(500).json({ 
      message: 'Erreur serveur lors de la récupération des commandes', 
      error: err.message
    });
  }
});

app.put('/api/commandes/:id/statut', async (req, res) => {
  const { id } = req.params;
  const { nouveauStatut, userType, email } = req.body;

  try {
    const commandeResult = await pool.query('SELECT * FROM commande WHERE id = $1', [id]);
    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    const commande = commandeResult.rows[0];
    if (userType !== 'livreur' || commande.email_livreur !== email) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const validStatuses = ['En préparation', 'En route pour livraison', 'Livré'];
    if (!validStatuses.includes(nouveauStatut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    await pool.query(
      'UPDATE commande SET statut = $1 WHERE id = $2',
      [nouveauStatut, id]
    );

    io.to(commande.email_client).emit('statut-mise-a-jour', { id, statut: nouveauStatut, message: `Votre commande #${id} est ${nouveauStatut.toLowerCase()}.` });
    io.emit('commande-mise-a-jour', { id, statut: nouveauStatut });
    res.json({ message: 'Statut mis à jour avec succès' });
  } catch (err) {
    console.error('Erreur mise à jour statut:', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.get('/api/livreurs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT nom, email, code, contact, date_inscription FROM livreur ORDER BY date_inscription DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur récupération livreurs :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

app.post('/api/livreurs', async (req, res) => {
  const { nom, email, code, contact, motDePasse } = req.body;
  try {
    if (!nom || !email || !code || !contact) {
      return res.status(400).json({ message: 'Tous les champs sont requis' });
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
      message: 'Livreur ajouté avec succès', 
      livreur: result.rows[0] 
    });
  } catch (err) {
    console.error('Erreur ajout livreur :', err.stack);
    if (err.code === '23505') {
      const detail = err.detail.includes('email') 
        ? 'Email déjà utilisé' 
        : 'Code déjà utilisé';
      res.status(400).json({ message: detail });
    } else {
      res.status(500).json({ 
        message: 'Erreur serveur', 
        error: err.message 
      });
    }
  }
});

// Nouvelle route pour récupérer les messages d'un client
app.get('/api/messages/:email', async (req, res) => {
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
    console.error('Erreur récupération messages :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Nouvelle route pour envoyer un message
app.post('/api/messages', async (req, res) => {
  const { email_client, message_text, sent_by_admin } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO messages (email_client, message_text, sent_by_admin) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [email_client, message_text, sent_by_admin === true]
    );
    const message = result.rows[0];
    io.to(email_client).emit('new-message', { 
      email_client, 
      message_text: message.message_text, 
      sent_by_admin: message.sent_by_admin, 
      timestamp: message.timestamp 
    });
    io.to('admin-room').emit('new-message', { 
      email_client, 
      message_text: message.message_text, 
      sent_by_admin: message.sent_by_admin, 
      timestamp: message.timestamp 
    });
    res.status(201).json({ message: 'Message envoyé avec succès', data: message });
  } catch (err) {
    console.error('Erreur envoi message :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

io.on('connection', (socket) => {
  console.log('Nouvelle connexion socket établie');

  socket.on('join', ({ email, userType }) => {
    socket.join(email);
    if (userType === 'admin') {
      socket.join('admin-room');
      console.log('Admin a rejoint la room admin');
    }
    console.log(`Utilisateur avec email ${email} a rejoint son canal socket`);
  });

  socket.on('leave', ({ email }) => {
    socket.leave(email);
    console.log(`Utilisateur avec email ${email} a quitté son canal socket`);
  });

  socket.on('send-message', ({ email_client, message_text, sent_by_admin }) => {
    // Sauvegarder le message en DB
    pool.query(
      `INSERT INTO messages (email_client, message_text, sent_by_admin) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [email_client, message_text, sent_by_admin === true],
      (err, result) => {
        if (err) {
          console.error('Erreur sauvegarde message :', err.stack);
          return;
        }
        const message = result.rows[0];
        // Émettre le message au client et à l'admin
        io.to(email_client).emit('new-message', { 
          email_client, 
          message_text: message.message_text, 
          sent_by_admin: message.sent_by_admin, 
          timestamp: message.timestamp 
        });
        io.to('admin-room').emit('new-message', { 
          email_client, 
          message_text: message.message_text, 
          sent_by_admin: message.sent_by_admin, 
          timestamp: message.timestamp 
        });
      }
    );
  });

  socket.on('commande-validee', (data) => {
    io.to(data.email_client).emit('commande-validee', data);
  });

  socket.on('nouvelle-commande', (data) => {
    io.to(data.email_client).emit('nouvelle-commande', data);
  });

  socket.on('connect', () => {
    const email = socket.handshake.query.email;
    if (email) {
      socket.join(email);
    }
  });
});

// Route pour mettre à jour la position du livreur
app.post('/api/livreurs/:email/position', async (req, res) => {
  const { email } = req.params;
  const { latitude, longitude, commandeId } = req.body;

  try {
    console.log('📡 Réception position livreur:', { email, latitude, longitude, commandeId });

    await pool.query(
      'UPDATE livreur SET position_actuelle = $1, en_livraison = $2 WHERE email = $3',
      [{ latitude, longitude }, !!commandeId, email]
    );

    if (commandeId) {
      await pool.query(
        'UPDATE commande SET position_livreur = $1, derniere_mise_a_jour = NOW() WHERE id = $2',
        [{ latitude, longitude }, commandeId]
      );
    }

    res.json({ message: 'Position mise à jour avec succès' });
  } catch (err) {
    console.error('Erreur mise à jour position:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Route pour obtenir le suivi d'une commande
app.get('/api/commandes/:id/suivi', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT c.id, c.statut, c.position_livreur, c.derniere_mise_a_jour,
             l.nom as livreur_nom, l.contact as livreur_contact,
             cl.nom as client_nom, cl.adresse as client_adresse
      FROM commande c
      LEFT JOIN livreur l ON c.email_livreur = l.email
      LEFT JOIN client cl ON c.email_client = cl.email
      WHERE c.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur récupération suivi:', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Route pour obtenir les livraisons en cours (commandes avec statut actif)
app.get('/api/livraisons-en-cours', async (req, res) => {
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
    console.error('Erreur récupération livraisons en cours:', err.stack);
    res.status(500).json({ 
      message: 'Erreur serveur lors de la récupération des livraisons', 
      error: err.message 
    });
  }
});

// Route pour générer une facture
app.post('/api/commandes/:id/generer-facture', async (req, res) => {
  const { id } = req.params;

  try {
    const commandeResult = await pool.query(`
      SELECT c.*, cl.nom as client_nom, cl.adresse, cl.contact,
             l.nom as livreur_nom, l.contact as livreur_contact
      FROM commande c
      LEFT JOIN client cl ON c.email_client = cl.email
      LEFT JOIN livreur l ON c.email_livreur = l.email
      WHERE c.id = $1
    `, [id]);

    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    const commande = commandeResult.rows[0];

    // Mettre à jour le statut de la commande en "En préparation"
    await pool.query(
      'UPDATE commande SET statut = $1 WHERE id = $2',
      ['En préparation', id]
    );

    // Générer les données de la facture
    const facture = {
      id_commande: commande.id,
      date_commande: commande.date_commande,
      date_facture: new Date(),
      client: {
        nom: commande.client_nom,
        adresse: commande.adresse,
        contact: commande.contact
      },
      livreur: {
        nom: commande.livreur_nom,
        contact: commande.livreur_contact
      },
      produits: [{
        type: commande.type_produit,
        quantite: commande.quantite,
        prix_unitaire: (commande.type_produit === 'paquet') ? 13500 : 405000,
        prix_total: commande.prix_total
      }],
      statut: 'En préparation'
    };

    // Émettre l'événement de notification
    io.emit('facture-generee', {
      commande_id: id,
      facture: facture,
      message: `Facture générée pour la commande #${id} - Statut: En préparation`
    });

    // Notifier le livreur
    if (commande.email_livreur) {
      io.to(commande.email_livreur).emit('notification-livreur', {
        message: `Nouvelle facture générée pour la commande #${id}. La commande est en préparation.`,
        commandeId: id
      });
    }

    res.json({
      message: 'Facture générée avec succès et statut mis à jour',
      facture: facture
    });

  } catch (err) {
    console.error('Erreur génération facture:', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Nouvelle route pour annuler une commande
app.put('/api/commandes/:id/annuler', async (req, res) => {
  const { id } = req.params;

  try {
    const commandeResult = await pool.query('SELECT * FROM commande WHERE id = $1', [id]);
    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    const commande = commandeResult.rows[0];

    // Restaurer le stock si la commande était validée
    if (commande.statut === 'Validée' || commande.statut === 'En préparation' || commande.statut === 'En route pour livraison') {
      await pool.query(
        'UPDATE produit SET quantite = quantite + $1 WHERE type = $2',
        [commande.quantite, commande.type_produit]
      );
    }

    // Mettre à jour le statut à "Annulée"
    await pool.query(
      'UPDATE commande SET statut = $1 WHERE id = $2',
      ['Annulée', id]
    );

    // Notifier le client et l'admin via Socket.IO
    io.to(commande.email_client).emit('commande-annulee', { id, message: `Votre commande #${id} a été annulée.` });
    io.to('admin-room').emit('commande-annulee', { id, message: `Commande #${id} annulée par l'admin.` });

    res.json({ message: 'Commande annulée avec succès' });
  } catch (err) {
    console.error('Erreur annulation commande:', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Route pour confirmer la facture
app.put('/api/factures/:id/confirmer', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      'UPDATE commande SET statut = $1 WHERE id = $2',
      ['Facture confirmée', id]
    );

    io.emit('facture-confirmee', {
      commande_id: id,
      message: `Facture confirmée pour la commande #${id}`
    });

    res.json({ message: 'Facture confirmée avec succès' });

  } catch (err) {
    console.error('Erreur confirmation facture:', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Route pour obtenir les données de facture
app.get('/api/factures/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const commandeResult = await pool.query(`
      SELECT c.*, cl.nom as client_nom, cl.adresse, cl.contact,
             l.nom as livreur_nom, l.contact as livreur_contact
      FROM commande c
      LEFT JOIN client cl ON c.email_client = cl.email
      LEFT JOIN livreur l ON c.email_livreur = l.email
      WHERE c.id = $1
    `, [id]);

    if (commandeResult.rows.length === 0) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    const commande = commandeResult.rows[0];

    const facture = {
      id_commande: commande.id,
      date_commande: commande.date_commande,
      date_facture: new Date(),
      client: {
        nom: commande.client_nom,
        adresse: commande.adresse,
        contact: commande.contact
      },
      livreur: {
        nom: commande.livreur_nom,
        contact: commande.livreur_contact
      },
      produits: [{
        type: commande.type_produit,
        quantite: commande.quantite,
        prix_unitaire: (commande.type_produit === 'paquet') ? 13500 : 405000,
        prix_total: commande.prix_total
      }],
      statut: commande.statut
    };

    res.json({ facture: facture });

  } catch (err) {
    console.error('Erreur récupération facture:', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Route pour obtenir les positions de tous les livreurs
app.get('/api/livreurs/positions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT email, nom, position_actuelle, en_livraison
      FROM livreur 
      WHERE position_actuelle IS NOT NULL
    `);
    
    const livreurs = result.rows.map(livreur => ({
      email: livreur.email,
      nom: livreur.nom,
      position_actuelle: livreur.position_actuelle,
      en_livraison: livreur.en_livraison
    }));
    
    res.json(livreurs);
  } catch (err) {
    console.error('Erreur récupération positions livreurs:', err.stack);
    res.status(500).json({ 
      message: 'Erreur serveur lors de la récupération des positions', 
      error: err.message 
    });
  }
});

// CETTE LIGNE DOIT ÊTRE LA DERNIÈRE
server.listen(process.env.PORT || 5000, () => {
  console.log(`Serveur démarré sur le port ${process.env.PORT || 5000}`);
});