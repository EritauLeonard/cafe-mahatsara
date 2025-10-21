import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Statistique.css';

const Statistiques = () => {
  const [stats, setStats] = useState({
    totalCommandes: 0,
    commandesLivrees: 0,
    chiffreAffaires: 0,
    clientsActifs: 0
  });
  const [ventesMois, setVentesMois] = useState([]);
  const [produitsVendus, setProduitsVendus] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      
      // Récupérer toutes les commandes
      const commandesResponse = await axios.get('http://localhost:5000/api/commandes');
      const allCommandes = commandesResponse.data;

      // Récupérer tous les clients
      const clientsResponse = await axios.get('http://localhost:5000/api/clients');
      const allClients = clientsResponse.data;

      // Calculer les statistiques
      const totalCommandes = allCommandes.length;
      const commandesLivrees = allCommandes.filter(c => c.statut === 'Livré').length;
      
      const chiffreAffaires = allCommandes.reduce((total, commande) => {
        return total + (commande.prix_total || 0);
      }, 0);

      const clientsActifs = allClients.length;

      // Statistiques par produit (pour tous les types)
      const produitsStats = allCommandes.reduce((acc, commande) => {
        const produit = commande.type_produit;
        if (!acc[produit]) {
          acc[produit] = { quantite: 0, revenue: 0 };
        }
        acc[produit].quantite += commande.quantite;
        acc[produit].revenue += commande.prix_total;
        return acc;
      }, {});

      // Convertir en tableau pour le graphique
      const produitsVendus = Object.entries(produitsStats).map(([produit, data]) => ({
        produit,
        quantite: data.quantite,
        revenue: data.revenue
      }));

      // Statistiques par mois (dynamique)
      const ventesParMois = calculateMonthlySales(allCommandes);

      setStats({
        totalCommandes,
        commandesLivrees,
        chiffreAffaires,
        clientsActifs
      });
      setVentesMois(ventesParMois);
      setProduitsVendus(produitsVendus);
      
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Fonction pour calculer ventes par mois (derniers 6 mois, basé sur date_commande)
  const calculateMonthlySales = (commandes) => {
    const moisMap = {
      0: 'Jan', 1: 'Fév', 2: 'Mar', 3: 'Avr', 4: 'Mai', 5: 'Juin',
      6: 'Juil', 7: 'Août', 8: 'Sep', 9: 'Oct', 10: 'Nov', 11: 'Déc'
    };
    const now = new Date();
    const ventes = Array(6).fill(0).map((_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const moisIndex = date.getMonth();
      return { mois: moisMap[moisIndex], ventes: 0, year: date.getFullYear() };
    }).reverse(); // Du plus ancien au plus récent

    commandes.forEach(cmd => {
      const dateCmd = new Date(cmd.date_commande);
      const moisIndex = dateCmd.getMonth();
      const year = dateCmd.getFullYear();
      const moisVente = ventes.find(v => v.mois === moisMap[moisIndex] && v.year === year);
      if (moisVente) {
        moisVente.ventes += cmd.prix_total || 0;
      }
    });

    return ventes;
  };

  // Fonction pour calculer max ventes pour scale (évite overflow si trop haut)
  const getMaxVentes = (ventes) => Math.max(1, ...ventes.map(v => v.ventes));

  const getMaxQuantite = (produits) => Math.max(1, ...produits.map(p => p.quantite));

  if (loading) {
    return (
      <div className="admin-section">
        <h3>📊 Statistiques</h3>
        <div className="loading">Chargement des données...</div>
      </div>
    );
  }

  return (
    <div className="stats-section">
      <h3 className='titre'>📊 Tableau de Bord - Statistiques</h3>
      
      {/* Cartes de statistiques */}
      <div className="dashboard-cards">
        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-info">
            <h2>{stats.totalCommandes}</h2>
            <p>Commandes totales</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-info">
            <h2>{stats.commandesLivrees}</h2>
            <p>Commandes livrées</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-info">
            <h2>{(stats.chiffreAffaires / 1000).toFixed(0)}K Ar</h2>
            <p>Chiffre d'affaires</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <h2>{stats.clientsActifs}</h2>
            <p>Clients actifs</p>
          </div>
        </div>
      </div>

      {/* Graphiques */}
      <div className="charts-container">
        <div className="chart-card">
          <h4>📈 Ventes par mois</h4>
          <div className="chart-bars">
            {ventesMois.map((item, index) => (
              <div key={index} className="bar-container">
                <div className="bar-label">{item.mois}</div>
                <div className="bar">
                  <div 
                    className="bar-fill" 
                    style={{ height: `${(item.ventes / getMaxVentes(ventesMois)) * 100}%` }}
                    title={`${(item.ventes / 1000).toFixed(0)}K Ar`}
                  ></div>
                </div>
                <div className="bar-value">{(item.ventes / 1000).toFixed(0)}K</div>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <h4>🏆 Produits les plus vendus</h4>
          <div className="products-stats">
            {produitsVendus.map((item, index) => (
              <div key={index} className="product-item">
                <span className="product-name">{item.produit.charAt(0).toUpperCase() + item.produit.slice(1)}</span>
                <div className="product-bar">
                  <div 
                    className="product-fill"
                    style={{ width: `${(item.quantite / getMaxQuantite(produitsVendus)) * 100}%` }}
                  ></div>
                </div>
                <span className="product-quantity">{item.quantite} unités</span>
                <span className="product-revenue">{((item.revenue || 0) / 1000).toFixed(0)}K Ar</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Détails supplémentaires */}
      <div className="stats-details">
        <div className="detail-card">
          <h4>📋 Détails par produit</h4>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Quantité vendue</th>
                <th>Chiffre d'affaires</th>
                <th>Prix moyen</th>
              </tr>
            </thead>
            <tbody>
              {produitsVendus.map((item, index) => (
                <tr key={index}>
                  <td>{item.produit.charAt(0).toUpperCase() + item.produit.slice(1)}</td>
                  <td>{item.quantite} unités</td>
                  <td>{((item.revenue || 0) / 1000).toFixed(0)}K Ar</td>
                  <td>{item.quantite > 0 ? ((item.revenue || 0) / item.quantite).toFixed(0) : 0} Ar/u</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button onClick={fetchStats} className="refresh-btn">
        🔄 Actualiser les statistiques
      </button>
    </div>
  );
};

export default Statistiques;