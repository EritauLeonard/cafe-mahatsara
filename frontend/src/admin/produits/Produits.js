import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Produits.css'; // Styles pour la gestion des produits

const Produits = () => {
  const [stock, setStock] = useState({ paquet: 0, sac: 0 });
  const [type, setType] = useState('paquet');
  const [quantite, setQuantite] = useState('');

  useEffect(() => {
    const fetchStock = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/produits');
        const stockData = response.data.reduce((acc, item) => {
          acc[item.type] = item.quantite;
          return acc;
        }, { paquet: 0, sac: 0 });
        setStock(stockData);
      } catch (err) {
        console.error('Erreur chargement stock:', err);
      }
    };
    fetchStock();
  }, []);

  // Fonction pour valider que seule les chiffres sont saisis
  const handleQuantiteChange = (e) => {
    const value = e.target.value;
    // Autorise seulement les chiffres et la chaîne vide
    if (value === '' || /^[0-9]+$/.test(value)) {
      setQuantite(value);
    }
  };

  const handleAjouterProduit = async () => {
    if (quantite > 0) {
      try {
        await axios.post('http://localhost:5000/api/produits', { type, quantite: parseInt(quantite) });
        const response = await axios.get('http://localhost:5000/api/produits');
        const stockData = response.data.reduce((acc, item) => {
          acc[item.type] = item.quantite;
          return acc;
        }, { paquet: 0, sac: 0 });
        setStock(stockData);
        alert(`✅ ${quantite} ${type}(s) ajoutés avec succès !`);
        setQuantite('');
      } catch (err) {
        console.error('Erreur ajout produit:', err);
        alert('❌ Erreur lors de l\'ajout du produit.');
      }
    } else {
      alert('❌ Veuillez entrer une quantité valide.');
    }
  };

  return (
    <div className="admin-container">
      <h1>🛠️ Gestion des Produits Café Mahatsara</h1>

      {/* Formulaire d'ajout */}
      <form className="product-form">
        <h2>➕ Ajouter un produit</h2>
        <label>Type :</label>
        <select id="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="paquet">Paquet (20 sachets)</option>
          <option value="sac">Sac (30 paquets)</option>
        </select>
        <label>Quantité à ajouter :</label>
        <input
          type="text" // Changé de "number" à "text" pour mieux contrôler la saisie
          id="quantite"
          value={quantite}
          onChange={handleQuantiteChange}
          placeholder="Entrez un nombre"
          required
        />
        <button type="button" onClick={handleAjouterProduit}>
          Ajouter au stock
        </button>
      </form>

      {/* Affichage du stock */}
      <div className="stock-display">
        <h2>📦 Stock actuel</h2>
        <p>🧺 Paquets disponibles : <span id="stock-paquet">{stock.paquet}</span></p>
        <p>👜 Sacs disponibles : <span id="stock-sac">{stock.sac}</span></p>
      </div>
    </div>
  );
};

export default Produits;