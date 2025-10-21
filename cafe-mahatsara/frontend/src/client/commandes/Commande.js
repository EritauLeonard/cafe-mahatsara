import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './Commande.css';

const socket = io('http://localhost:5000');

const productConfig = {
  'paquet': { stockName: 'Paquets', name: 'Paquet de 20 sachets', price: 13500, icon: '📦' },
  'sac': { stockName: 'Sacs', name: 'Sac de 30 paquets', price: 405000, icon: '🛍️' },
};

const Commandes = () => {
  const [clientNom, setClientNom] = useState('');
  const [commandes, setCommandes] = useState([]);
  const [produits, setProduits] = useState([]);
  const [message, setMessage] = useState('');
  const [notifications, setNotifications] = useState([]);

  const fetchCommandes = () => {
    const email = localStorage.getItem('clientEmail');
    if (email) {
      axios.get(`http://localhost:5000/api/commandes/${email}`, {
        headers: { 'x-client-email': email }
      })
        .then(response => setCommandes(response.data || []))
        .catch(err => {
          console.error('Erreur historique:', err);
          setMessage('Erreur lors du chargement de l\'historique des commandes.');
        });
    }
  };

  const fetchProduits = () => {
    axios.get('http://localhost:5000/api/produits')
      .then(response => {
        const filteredProduits = response.data.filter(prod => prod.type === 'paquet' || prod.type === 'sac');
        setProduits(filteredProduits || []);
      })
      .catch(err => {
        console.error('Erreur produits:', err);
        setMessage('Erreur lors du chargement des produits.');
      });
  };

  useEffect(() => {
    const nom = localStorage.getItem('clientNom') || 'Client';
    setClientNom(nom);

    const email = localStorage.getItem('clientEmail');
    if (email) {
      fetchProduits();
      fetchCommandes();

      socket.emit('join', { email });

      socket.on('commande-validee', (data) => {
        if (data.email_client === email) {
          fetchCommandes();
          fetchProduits();
        }
      });

      socket.on('nouvelle-commande', (data) => {
        if (data.email_client === email) {
          fetchProduits();
        }
      });

      socket.on('statut-mise-a-jour', (data) => {
        if (data.id) {
          setNotifications(prev => [...prev, { id: data.id, message: data.message, timestamp: new Date().toLocaleTimeString() }]);
          setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== data.id)), 10000);
        }
      });

      socket.on('produit-ajoute', () => fetchProduits());
    } else {
      setMessage('Veuillez vous connecter pour accéder à cette page.');
    }

    return () => {
      socket.emit('leave', { email });
      socket.off('commande-validee');
      socket.off('nouvelle-commande');
      socket.off('statut-mise-a-jour');
      socket.off('produit-ajoute');
    };
  }, []);

  const handleCommander = (type) => {
    const email = localStorage.getItem('clientEmail');
    if (!email) {
      setMessage('Veuillez vous connecter pour commander.');
      return;
    }

    const quantiteInput = document.getElementById(`quantite-${type}`);
    const quantite = quantiteInput ? parseInt(quantiteInput.value) : 1;

    axios.post('http://localhost:5000/api/commandes', { email, type, quantite })
      .then(response => {
        setMessage(`Commande enregistrée (${response.data.prixTotal} Ar) - En attente de validation`);
        fetchProduits();
        fetchCommandes();
        setTimeout(() => setMessage(''), 5000);
      })
      .catch(err => {
        if (err.response) setMessage(err.response.data.message);
        else setMessage('Erreur lors de la commande.');
        setTimeout(() => setMessage(''), 5000);
      });
  };

  return (
    <div className="main-content">
      <h1 className="title">Bienvenue sur votre espace client – Café Mahatsara, {clientNom}</h1>

      <div className="top-section">
        <section className="history">
          <h2>🕘 Vos dernières commandes</h2>
          <div className="scrollable-list">
            <ul>
              {commandes.length > 0 ? (
                commandes.map((cmd, index) => (
                  <li key={index}>
                    {new Date(cmd.date_commande).toLocaleDateString('fr-FR')} – {cmd.quantite} {cmd.type_produit}{(cmd.quantite > 1 ? 's' : '')} – {cmd.prix_total} Ar ({cmd.statut})
                  </li>
                ))
              ) : (
                <li>Aucune commande validée pour le moment.</li>
              )}
            </ul>
          </div>
        </section>

        <section className="stock">
          <h2>📦 Produits disponibles</h2>
          {produits.length > 0 ? (
            produits.map((prod) => (
              <p key={prod.type}>
                {productConfig[prod.type]?.stockName || prod.type.charAt(0).toUpperCase() + prod.type.slice(1)} disponibles : <strong>{prod.quantite}</strong>
              </p>
            ))
          ) : (
            <p>Aucun produit disponible pour l'instant.</p>
          )}
        </section>
      </div>

      <section className="products">
        <h2>🛒 Commander du café</h2>
        <div className="product-row">
          {produits.map((prod) => (
            <div className="product-card" key={prod.type}>
              <div className="product-icon">{productConfig[prod.type]?.icon || '📦'}</div>
              <h3>{productConfig[prod.type]?.name || prod.type.charAt(0).toUpperCase() + prod.type.slice(1)}</h3>
              <p className="price">{productConfig[prod.type]?.price?.toLocaleString() || 'Prix non défini'} Ar</p>
              <input 
                type="number" 
                min="1" 
                max={prod.quantite}
                defaultValue="1"
                id={`quantite-${prod.type}`}
                className="quantity-input"
              />
              <button 
                onClick={() => handleCommander(prod.type)} 
                disabled={prod.quantite === 0}
                className="order-btn"
              >
                {prod.quantite > 0 ? 'Commander' : 'Rupture de stock'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {message && <p className="message alert">{message}</p>}
      {notifications.length > 0 && (
        <section className="notifications">
          <h2>📩 Notifications</h2>
          <div className="notification-list">
            {notifications.map(notif => (
              <p key={notif.id} className="notification-message" style={{ color: 'green' }}>
                {notif.message} (à {notif.timestamp})
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Commandes;