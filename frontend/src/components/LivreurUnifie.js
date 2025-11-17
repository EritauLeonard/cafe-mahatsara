import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import './Livreur.css';

const socket = io('http://localhost:5000', {
  transports: ['websocket', 'polling'],
  reconnection: true
});

// Position fixe pour le livreur en format DMS
const FIXED_POSITION_DMS = "21°27'48.5\"S 47°06'36.5\"E";

const LivreurUnifie = () => {
  const storedEmail = localStorage.getItem('livreurEmail') || '';
  const [email, setEmail] = useState(storedEmail);
  const [motDePasse, setMotDePasse] = useState('');
  const [isConnected, setIsConnected] = useState(!!storedEmail);
  const [livreur, setLivreur] = useState(isConnected ? { email: storedEmail } : null);
  const [commandes, setCommandes] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCommandeId, setActiveCommandeId] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const navigate = useNavigate();

  // Vérification serveur
  useEffect(() => {
    const checkServer = async () => {
      try {
        await axios.get('http://localhost:5000/api/produits');
        setError('');
      } catch (err) {
        setError('Serveur inaccessible. Vérifiez que le serveur est démarré sur http://localhost:5000.');
      }
    };
    if (isConnected) checkServer();
  }, [isConnected]);

  // FONCTION POUR ENVOYER LA POSITION FIXE AU SERVEUR
  const envoyerPosition = useCallback(async () => {
    if (!livreur || !livreur.email) {
      console.error('Erreur : Email du livreur non défini.');
      return;
    }

    try {
      console.log('📤 Envoi position fixe:', { 
        email: livreur.email, 
        position: FIXED_POSITION_DMS,
        activeCommandeId 
      });

      // Convertir DMS en décimales pour l'envoi au serveur
      const latitude = -21.463472; // 21°27'48.5"S
      const longitude = 47.110139; // 47°06'36.5"E
      
      const response = await axios.post(
        `http://localhost:5000/api/livreurs/${encodeURIComponent(livreur.email)}/position`,
        { 
          latitude: latitude, 
          longitude: longitude, 
          commandeId: activeCommandeId,
          accuracy: 10
        },
        { timeout: 10000 }
      );
      
      if (response.status === 200) {
        console.log('✅ Position fixe envoyée avec succès');
        
        // Émettre aussi via socket
        socket.emit('position-livreur', {
          email: livreur.email,
          nom: livreur.nom || email.split('@')[0],
          latitude: latitude,
          longitude: longitude,
          accuracy: 10,
          commandeId: activeCommandeId,
          timestamp: new Date()
        });
        
        if (error && error.includes('position')) setError('');
        setError(`✅ Position fixe envoyée (${FIXED_POSITION_DMS})`);
      }
    } catch (err) {
      console.error('❌ Erreur envoi position fixe:', err);
      setError('Erreur d\'envoi de position. Vérifiez votre connexion.');
    }
  }, [livreur, activeCommandeId, error, email]);

  // ENVOI AUTOMATIQUE DE LA POSITION FIXE - VERSION CORRIGÉE
useEffect(() => {
  if (isConnected && livreur) {
    console.log('📍 Démarrage envoi position fixe pour:', livreur.email);
    
    // Fonction d'envoi optimisée
    const envoyerPositionAutomatique = async () => {
      try {
        if (!livreur.email) return;
        
        const latitude = -21.463472;
        const longitude = 47.110139;
        
        // Envoi HTTP au serveur
        await axios.post(
          `http://localhost:5000/api/livreurs/${encodeURIComponent(livreur.email)}/position`,
          { 
            latitude, 
            longitude, 
            commandeId: activeCommandeId,
            accuracy: 10,
            timestamp: new Date().toISOString()
          }
        );
        
        // Émission Socket.IO pour l'admin
        socket.emit('position-livreur-global', {
          email: livreur.email,
          nom: livreur.nom || email.split('@')[0],
          latitude: latitude,
          longitude: longitude,
          accuracy: 10,
          commandeId: activeCommandeId,
          timestamp: new Date(),
          en_livraison: !!activeCommandeId
        });
        
        console.log('✅ Position envoyée automatiquement à l\'admin');
      } catch (err) {
        console.error('❌ Erreur envoi position automatique:', err);
      }
    };
    
    // Envoyer immédiatement à la connexion
    envoyerPositionAutomatique();
    
    // Envoyer toutes les 15 secondes (plus fréquent)
    const interval = setInterval(envoyerPositionAutomatique, 15000);
    
    return () => {
      clearInterval(interval);
      console.log('🛑 Arrêt envoi automatique position');
    };
  }
}, [isConnected, livreur, activeCommandeId, email]);

  // Connexion Socket.IO
  useEffect(() => {
    if (isConnected && livreur) {
      socket.on('connect', () => {
        console.log('✅ Socket connecté:', socket.id);
        setSocketConnected(true);
        socket.emit('join', { email: livreur.email, userType: 'livreur' });
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket déconnecté');
        setSocketConnected(false);
      });

      socket.on('notification-livreur', (data) => {
        setNotifications((prev) => [
          ...prev,
          {
            id: Date.now(),
            message: data.message,
            commandeId: data.commandeId,
            timestamp: new Date(),
          },
        ]);
        loadCommandes(email);
      });

      return () => {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('notification-livreur');
      };
    }
  }, [isConnected, livreur, email]);

  // Chargement des commandes
  useEffect(() => {
    if (isConnected && email) {
      loadCommandes(email);
    }
  }, [isConnected, email]);

  // Connexion du livreur
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await axios.post('http://localhost:5000/login', {
        email,
        motDePasse,
      });
      
      if (response.data.userType === 'livreur') {
        setIsConnected(true);
        setLivreur({
          email: response.data.email,
          code: response.data.code,
        });
        localStorage.setItem('livreurEmail', response.data.email);
        setError('');
        await loadCommandes(response.data.email);
      } else {
        setError('Vous n\'êtes pas un livreur');
      }
    } catch (err) {
      setError('Erreur de connexion: ' + (err.response?.data.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Chargement des commandes
  const loadCommandes = async (livreurEmail) => {
    try {
      setLoading(true);
      const response = await axios.get(`http://localhost:5000/api/commandes/livreur/${livreurEmail}`);
      const filteredCommandes = response.data.filter((cmd) =>
        ['Validée', 'En préparation', 'En route pour livraison', 'Livré'].includes(cmd.statut)
      );
      setCommandes(filteredCommandes);

      // Trouver la commande active
      const active = filteredCommandes.find(cmd => cmd.statut === 'En route pour livraison');
      setActiveCommandeId(active ? active.id : null);
    } catch (err) {
      console.error('Erreur chargement commandes:', err);
      setError('Erreur lors du chargement des commandes');
    } finally {
      setLoading(false);
    }
  };

  // Dans LivreurUnifie.js - Remplacer la fonction handleStatusUpdate
const handleStatusUpdate = async (commandeId, nouveauStatut) => {
  try {
    await axios.put(`http://localhost:5000/api/commandes/${commandeId}/statut`, {
      nouveauStatut,
      userType: 'livreur',
      email: email,
    });

    // Émettre l'événement socket CORRIGÉ
    socket.emit('livreur-accepte', {
      commandeId: commandeId,
      livreurEmail: email,
      message: `Livreur ${email} a mis la commande #${commandeId} en statut: ${nouveauStatut}`,
      nouveauStatut: nouveauStatut
    });

    // Émettre aussi la mise à jour générale
    socket.emit('commande-mise-a-jour', {
      id: commandeId,
      statut: nouveauStatut
    });

    // Recharger les commandes
    await loadCommandes(email);

    // Gérer la commande active
    if (nouveauStatut === 'En route pour livraison') {
      setActiveCommandeId(commandeId);
      setError(`🚚 Livraison en cours - Votre position fixe (${FIXED_POSITION_DMS}) est maintenant suivie en temps réel`);
      envoyerPosition();
    } else if (nouveauStatut === 'Livré') {
      setActiveCommandeId(null);
      setError('✅ Livraison terminée avec succès !');
    } else if (nouveauStatut === 'En préparation') {
      setError(`✅ Commande #${commandeId} acceptée et en préparation`);
    }
  } catch (err) {
    setError('Erreur mise à jour statut: ' + (err.response?.data.message || err.message));
  }
};

  // Déconnexion
  const handleLogout = () => {
    setIsConnected(false);
    setLivreur(null);
    setCommandes([]);
    setNotifications([]);
    localStorage.removeItem('livreurEmail');
    navigate('/');
  };

  // Affichage du formulaire de connexion
  if (!isConnected) {
    return (
      <div className="livreur-container">
        <div className="login-form">
          <h2>🍵 Connexion Livreur</h2>
          <form onSubmit={handleLogin}>
            <div className="input-box">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                required
              />
              <label>Email :</label>
            </div>
            <div className="input-box">
              <input
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                placeholder=" "
                required
              />
              <label>Mot de passe :</label>
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="livreur-container">
      <div className="livreur-header">
        <h1>🚚 Application Livreur</h1>
        <div className="livreur-info">
          <span>Connecté en tant que: {email}</span>
          <span className={`status-indicator ${socketConnected ? 'online' : 'offline'}`}>
            {socketConnected ? '🟢 En ligne' : '🔴 Hors ligne'}
          </span>
          <button onClick={handleLogout} className="btn logout-btn">
            Déconnexion
          </button>
        </div>
      </div>

      {/* Position fixe */}
      <div className="position-container">
        <h3>📍 Position fixe du livreur</h3>
        <div className="position-details">
          <p><strong>Coordonnées:</strong> {FIXED_POSITION_DMS}</p>
          <p><strong>Format:</strong> Degrés, Minutes, Secondes (DMS)</p>
          <p><strong>Statut:</strong> Position fixe activée</p>
        </div>
        <p className="position-info">
          {activeCommandeId 
            ? `✅ Position ${FIXED_POSITION_DMS} envoyée automatiquement - Livraison en cours` 
            : `📍 Position ${FIXED_POSITION_DMS} suivie - En attente de commande`
          }
        </p>
        <button onClick={envoyerPosition} className="btn refresh-position">
          🔄 Envoyer position maintenant
        </button>
        <a 
          href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(FIXED_POSITION_DMS)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-map"
        >
          📍 Voir sur OpenStreetMap
        </a>
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="notifications-container">
          <h3>📢 Notifications</h3>
          {notifications.map((notif) => (
            <div key={notif.id} className="notification">
              <p>{notif.message}</p>
              <small>{new Date(notif.timestamp).toLocaleString('fr-FR')}</small>
            </div>
          ))}
        </div>
      )}

      {/* Commandes */}
      <div className="commandes-section">
        <div className="commandes-header">
          <h2>📦 Commandes Assignées</h2>
          <button onClick={() => loadCommandes(email)} className="btn refresh-btn" disabled={loading}>
            {loading ? 'Actualisation...' : '🔄 Actualiser'}
          </button>
        </div>

        {commandes.length === 0 ? (
          <div className="no-orders">
            <p>Aucune commande assignée pour le moment.</p>
          </div>
        ) : (
          <table className="commandes-table">
            <thead>
              <tr>
                <th>ID Commande</th>
                <th>Client</th>
                <th>Adresse</th>
                <th>Produit</th>
                <th>Quantité</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {commandes.map((commande) => (
                <tr
                  key={commande.id}
                  className={`commande-row statut-${commande.statut.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <td>#{commande.id}</td>
                  <td>{commande.client_nom || 'Non spécifié'}</td>
                  <td>{commande.client_adresse || 'Non spécifiée'}</td>
                  <td>{commande.type_produit}</td>
                  <td>{commande.quantite}</td>
                  <td className="statut">
                    <span className={`statut-badge statut-${commande.statut.toLowerCase().replace(/\s+/g, '-')}`}>
                      {commande.statut}
                    </span>
                  </td>
                  <td className="actions">
                    {commande.statut === 'Validée' && (
                      <button
                        className="btn recup"
                        onClick={() => handleStatusUpdate(commande.id, 'En préparation')}
                      >
                        🛒 Accepter Commande
                      </button>
                    )}
                    {commande.statut === 'En préparation' && (
                      <button
                        className="btn route"
                        onClick={() => handleStatusUpdate(commande.id, 'En route pour livraison')}
                      >
                        🚚 Commencer Livraison
                      </button>
                    )}
                    {commande.statut === 'En route pour livraison' && (
                      <button
                        className="btn livre"
                        onClick={() => handleStatusUpdate(commande.id, 'Livré')}
                      >
                        ✅ Livraison Terminée
                      </button>
                    )}
                    {commande.statut === 'Livré' && (
                      <span className="statut-termine">✅ Livré</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && (
        <div className={`error-container ${error.includes('✅') ? 'success' : ''}`}>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};

export default LivreurUnifie;