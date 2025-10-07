require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Configuration de la connexion à PostgreSQL avec .env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test de la connexion à la base de données
pool.connect((err) => {
  if (err) {
    console.error('Erreur de connexion à PostgreSQL:', err.stack);
  } else {
    console.log('Connecté à PostgreSQL avec succès !');
  }
});

// API pour le login
app.post('/login', async (req, res) => {
  const { email, motDePasse, role } = req.body;
  try {
    let result;
    if (role === 'client') {
      result = await pool.query('SELECT * FROM client WHERE email = $1', [email]);
    } else if (role === 'admin') {
      result = await pool.query('SELECT * FROM admin WHERE email = $1', [email]);
    }
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const match = await bcrypt.compare(motDePasse, user.mot_de_passe);
      if (match) {
        res.json({ message: `Connexion réussie en tant que ${role}!`, role });
      } else {
        res.status(401).json({ message: 'Mot de passe incorrect' });
      }
    } else {
      res.status(401).json({ message: 'Email incorrect' });
    }
  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// API pour l'inscription (client uniquement)
app.post('/register', async (req, res) => {
  const { nom, email, motDePasse, adresse, contact } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(motDePasse, 10);
    const result = await pool.query(
      'INSERT INTO client (nom, email, mot_de_passe, adresse, contact) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nom, email, hashedPassword, adresse, contact]
    );
    res.status(201).json({ message: 'Inscription réussie !', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ message: 'Email déjà utilisé' });
    } else {
      console.error('Erreur inscription:', err);
      res.status(500).json({ message: 'Erreur serveur', error: err.message });
    }
  }
});

// API pour ajouter ou mettre à jour un produit
app.post('/api/produits', async (req, res) => {
  const { type, quantite } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO produit (type, quantite) VALUES ($1, $2) ON CONFLICT (type) DO UPDATE SET quantite = produit.quantite + $2 RETURNING *',
      [type, quantite]
    );

    // Émettre un événement socket pour notifier les clients/admins
    io.emit('produit-ajoute', { produit: result.rows[0] });

    res.status(201).json({ message: 'Produit ajouté avec succès', produit: result.rows[0] });
  } catch (err) {
    console.error('Erreur ajout produit :', err.stack);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
});

// Démarre le serveur
app.listen(process.env.PORT, () => {
  console.log(`Serveur démarré sur le port ${process.env.PORT}`);
});