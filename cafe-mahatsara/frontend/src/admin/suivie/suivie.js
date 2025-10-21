import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './suivie.css';

// Configuration des icônes Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const socket = io('http://localhost:5000');

const Suivi = () => {
  const [commandes, setCommandes] = useState([]);
  const [selectedCommande, setSelectedCommande] = useState(null);
  const [positionsLivreurs, setPositionsLivreurs] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [map, setMap] = useState(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  // FONCTION DE CHARGEMENT DES COMMANDES - AJOUT ICI
  const loadCommandes = async () => {
    try {
      const commandesResponse = await axios.get('http://localhost:5000/api/commandes');
      const allCommandes = commandesResponse.data;
      const enLivraison = allCommandes.filter(c => 
        ['En préparation', 'En route pour livraison', 'Livré'].includes(c.statut)
      );
      setCommandes(enLivraison);
    } catch (error) {
      console.error('Erreur chargement commandes:', error);
    }
  };

  // Initialisation de la carte
  useEffect(() => {
    if (mapRef.current && !map) {
      const newMap = L.map(mapRef.current).setView([-21.463472, 47.110139], 13); // Position par défaut du livreur
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(newMap);
      setMap(newMap);
    }

    return () => {
      if (map) map.remove();
    };
  }, [map]);

  // Mise à jour des marqueurs de la carte - UNIQUEMENT LIVREUR
  const updateMapMarkers = useCallback(() => {
    if (!map || !selectedCommande) return;

    Object.values(markersRef.current).forEach(marker => marker?.remove());
    markersRef.current = {};

    const livreurIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    // Position par défaut centrée sur la position fixe du livreur
    const defaultPosition = [-21.463472, 47.110139];

    if (selectedCommande.position_livreur) {
      const { latitude, longitude } = selectedCommande.position_livreur;
      const livreurPosition = [latitude, longitude];
      const livreurMarker = L.marker(livreurPosition, { icon: livreurIcon })
        .addTo(map)
        .bindPopup(`<b>Livreur:</b> ${selectedCommande.livreur_nom || 'Non spécifié'}<br><b>Statut:</b> ${selectedCommande.statut}<br><b>Position:</b> 21°27'48.5"S 47°06'36.5"E`)
        .openPopup();
      markersRef.current.livreur = livreurMarker;
      
      // Centrer sur le livreur uniquement
      map.setView(livreurPosition, 15);
      console.log('📍 Marqueur livreur positionné:', { latitude, longitude });
    } else {
      // Si pas de position, centrer sur la position par défaut
      map.setView(defaultPosition, 13);
      console.log('📍 Carte centrée sur position par défaut');
    }
  }, [map, selectedCommande]);

  useEffect(() => {
    updateMapMarkers();
  }, [updateMapMarkers]);

  // EFFET POUR LA RÉCEPTION EN TEMPS RÉEL - VERSION CORRIGÉE - REMPLACER L'ANCIEN EFFET
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        await loadCommandes(); // Utilise la nouvelle fonction

        try {
          const positionsResponse = await axios.get('http://localhost:5000/api/livreurs/positions');
          console.log('📍 Positions livreurs reçues:', positionsResponse.data);
          setPositionsLivreurs(positionsResponse.data.map(p => ({
            ...p,
            position_actuelle: p.position_actuelle || null
          })));
        } catch (positionsError) {
          console.warn('Avertissement positions:', positionsError);
          setPositionsLivreurs([]);
        }
      } catch (error) {
        console.error('Erreur chargement données:', error);
        setError('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    // Rejoindre la room admin
    socket.emit('join-admin');

    const handlePositionUpdate = (data) => {
      console.log('📍 Mise à jour position livreur reçue par admin:', data);
      
      // Mise à jour des positions des livreurs
      setPositionsLivreurs(prev => {
        const filtered = prev.filter(p => p.email !== data.email);
        return [...filtered, {
          email: data.email,
          nom: data.nom || 'Livreur',
          position_actuelle: {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy
          },
          en_livraison: data.en_livraison || false,
          commandeId: data.commandeId,
          timestamp: data.timestamp
        }];
      });

      // Mise à jour automatique de la commande sélectionnée
      if (selectedCommande && selectedCommande.email_livreur === data.email) {
        console.log('🔄 Mise à jour automatique commande sélectionnée');
        setSelectedCommande(prev => ({
          ...prev,
          position_livreur: { 
            latitude: data.latitude, 
            longitude: data.longitude,
            accuracy: data.accuracy
          },
          derniere_mise_a_jour: new Date(),
          // Mise à jour du statut si en livraison
          ...(data.en_livraison && { statut: 'En route pour livraison' })
        }));
        
        // Recentrage automatique de la carte
        if (map) {
          map.setView([data.latitude, data.longitude], 15);
        }
      }
    };

    // Écoute des événements de position
    socket.on('position-livreur-global', handlePositionUpdate);
    
    // Écoute des mises à jour de commandes
    socket.on('commande-mise-a-jour', () => {
      loadCommandes();
    });

    return () => {
      socket.off('position-livreur-global', handlePositionUpdate);
      socket.off('commande-mise-a-jour');
    };
  }, [selectedCommande, map]); // Ajout des dépendances

  const handleSelectCommande = async (commandeId) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/commandes/${commandeId}/suivi`);
      console.log('📦 Détails commande chargés:', response.data);
      setSelectedCommande(response.data);
    } catch (error) {
      console.error('Erreur chargement suivi:', error);
      setError('Erreur lors du chargement des détails de la commande');
    }
  };

  if (loading) {
    return (
      <div className="admin-section">
        <h3>Suivi des Livraisons en Temps Réel</h3>
        <div className="loading">Chargement en cours...</div>
      </div>
    );
  }

  return (
    <div className="admin-section">
      <h3>Suivi des Livreurs en Temps Réel 🗺️</h3>
      {error && <div className="error-message">{error}</div>}
      <div className="suivi-container">
        <div className="commandes-list">
          <h4>🚚 Commandes en cours de livraison</h4>
          {commandes.length === 0 ? (
            <p>Aucune commande en cours de livraison</p>
          ) : (
            <ul>
              {commandes.map(commande => (
                <li 
                  key={commande.id} 
                  className={selectedCommande && selectedCommande.id === commande.id ? 'selected' : ''}
                  onClick={() => handleSelectCommande(commande.id)}
                >
                  <div><strong>Commande #{commande.id}</strong></div>
                  <div>Client: {commande.client_nom || 'Non spécifié'}</div>
                  <div>Statut: {commande.statut}</div>
                  <div>Livreur: {commande.livreur_nom || commande.email_livreur || 'Non assigné'}</div>
                  {commande.position_livreur && (
                    <div className="position-indicator">📍 Position active</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="carte-suivi">
          <h4>📍 Carte de suivi - Livreur</h4>
          {selectedCommande ? (
            <div className="carte-container">
              <div className="info-commande">
                <h5>Détails de la commande #{selectedCommande.id}</h5>
                <p><strong>Client:</strong> {selectedCommande.client_nom || 'Non spécifié'}</p>
                <p><strong>Adresse:</strong> {selectedCommande.client_adresse || 'Non spécifiée'}</p>
                <p><strong>Statut:</strong> 
                  <span className={`statut-badge statut-${selectedCommande.statut.toLowerCase().replace(/\s+/g, '-')}`}>
                    {selectedCommande.statut}
                  </span>
                </p>
                <p><strong>Livreur:</strong> {selectedCommande.livreur_nom || 'Non assigné'}</p>
                <p><strong>Contact livreur:</strong> {selectedCommande.livreur_contact || 'Non spécifié'}</p>
              </div>
              {selectedCommande.position_livreur ? (
                <div className="position-container">
                  <h5>📍 Position actuelle du livreur</h5>
                  <div className="position-details">
                    <p><strong>Coordonnées:</strong> 21°27'48.5"S 47°06'36.5"E</p>
                    <p><strong>Latitude:</strong> {selectedCommande.position_livreur.latitude.toFixed(6)}</p>
                    <p><strong>Longitude:</strong> {selectedCommande.position_livreur.longitude.toFixed(6)}</p>
                    <p><strong>Dernière mise à jour:</strong> {new Date(selectedCommande.derniere_mise_a_jour).toLocaleString()}</p>
                  </div>
                  <a 
                    href={`https://www.openstreetmap.org/?mlat=${selectedCommande.position_livreur.latitude}&mlon=${selectedCommande.position_livreur.longitude}#map=16/${selectedCommande.position_livreur.latitude}/${selectedCommande.position_livreur.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-map"
                  >
                    📍 Ouvrir dans OpenStreetMap
                  </a>
                </div>
              ) : (
                <div className="no-position">
                  <p>🚫 Le livreur n'a pas encore partagé sa position</p>
                  <p className="small-text">La position s'affichera automatiquement quand le livreur commencera la livraison</p>
                  <div ref={mapRef} className="leaflet-map-container"></div>
                </div>
              )}
            </div>
          ) : (
            <div className="no-selection">
              <p>👆 Sélectionnez une commande pour voir la position du livreur</p>
              <div className="map-placeholder">
                <div className="placeholder-content">
                  <span className="map-icon">🗺️</span>
                  <p>Carte de suivi des livreurs</p>
                  <small>Powered by OpenStreetMap</small>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="livreurs-map">
          <h4>📱 Livreurs en activité</h4>
          <div className="carte-livreurs">
            {positionsLivreurs.length === 0 ? (
              <p>Aucun livreur en activité</p>
            ) : (
              positionsLivreurs.map(livreur => (
                <div key={livreur.email} className="point-livreur-carte">
                  <span className="nom-livreur">{livreur.nom}</span>
                  {livreur.position_actuelle && (
                    <div className="coordonnees">
                      <span>📍 Position: </span>
                      <a 
                        href={`https://www.openstreetmap.org/?mlat=${livreur.position_actuelle.latitude}&mlon=${livreur.position_actuelle.longitude}#map=16/${livreur.position_actuelle.latitude}/${livreur.position_actuelle.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="map-link"
                      >
                        Voir sur map
                      </a>
                    </div>
                  )}
                  <div className="statut-livreur">
                    {livreur.en_livraison ? '🚴 En livraison' : '✅ Disponible'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Suivi;