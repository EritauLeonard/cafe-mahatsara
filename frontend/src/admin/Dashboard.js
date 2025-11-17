import React, { useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import './Dashboard.css';

const socket = io('http://localhost:5000');

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    axios.get('http://localhost:5000/api/commandes-en-attente')
      .then(response => setPendingCount(response.data.length))
      .catch(err => console.error('Erreur initiale commandes:', err));

    socket.on('nouvelle-commande', (data) => {
      setPendingCount(data.pendingCount);
    });

    socket.on('commande-validee', (data) => {
      setPendingCount(data.pendingCount);
    });

    return () => {
      socket.off('nouvelle-commande');
      socket.off('commande-validee');
    };
  }, []);

  const handleNavigation = (path) => {
    navigate(path);
  };

  // Vérifie si on est sur la page principale pour afficher les cartes
  const isDashboard = location.pathname === '/admin';

  return (
    <div className="dashboard-container">
      <section id="menu">
        <div className="logo">
          <img src="/image/ERTL10.jpg" alt="Logo Café Mahatsara" />
          <h2>Admin</h2>
        </div>
        <div className="items">
          <li onClick={() => handleNavigation('/admin')} className={location.pathname === '/admin' ? 'active' : ''}>
            <i className="fa-solid fa-house"></i>
            <span>Dashboard</span>
          </li>
          <li onClick={() => handleNavigation('/admin/clients')} className={location.pathname === '/admin/clients' ? 'active' : ''}>
            <i className="fa-solid fa-user"></i>
            <span>Clients</span>
          </li>
          <li onClick={() => handleNavigation('/admin/commandes')} className={location.pathname === '/admin/commandes' ? 'active' : ''}>
            <i className="fa-solid fa-cart-shopping"></i>
            <span>Commandes</span>
            {pendingCount > 0 && (
              <span className="notification-badge">{pendingCount}</span>
            )}
          </li>
          <li onClick={() => handleNavigation('/admin/produits')} className={location.pathname === '/admin/produits' ? 'active' : ''}>
            <i className="fa-solid fa-mug-saucer"></i>
            <span>Produits</span>
          </li>
          <li onClick={() => handleNavigation('/admin/livreurs')} className={location.pathname === '/admin/livreurs' ? 'active' : ''}>
            <i className="fa-solid fa-truck"></i>
            <span>Livreurs</span>
          </li>
          <li onClick={() => handleNavigation('/admin/suivie')} className={location.pathname === '/admin/suivie' ? 'active' : ''}>
            <i className="fa-solid fa-location-dot"></i>
            <span>Suivie</span>
          </li>
          <li onClick={() => handleNavigation('/admin/statistique')} className={location.pathname === '/admin/statistique' ? 'active' : ''}>
            <i className="fa-solid fa-chart-pie"></i>
            <span>Statistique</span>
          </li>
          <li onClick={() => handleNavigation('/admin/chat')} className={location.pathname === '/admin/chat' ? 'active' : ''}>
            <i className="fa-solid fa-comments"></i>
            <span>Chat Clients</span>
          </li>
        </div>
        <button className="btn logout-btn" onClick={() => navigate('/')}>
          Déconnexion
        </button>
      </section>

      <section id="interface">
        <div className="navigation">
          <div className="n1">
            <div className="search">
              <h1 className="titre">Bienvenu sur Café Mahatsara Mr L'Administrateur</h1>
            </div>
          </div>
          <div className="profile">
            <img src="/image/logo.jpg" alt="Profil Admin" />
          </div>
        </div>

        {isDashboard && (
          <div className="values">
            <div className="val-box" onClick={() => handleNavigation('/admin/clients')}>
              <i className="fa-solid fa-users"></i>
              <div>
                <h3>Clients</h3>
                <span>Ajouter et supprimer</span>
              </div>
            </div>
            <div className="val-box" onClick={() => handleNavigation('/admin/commandes')}>
              <i className="fa-solid fa-cart-shopping"></i>
              <div>
                <h3>Commandes</h3>
                <span>Gérer, assigner à livreur</span>
              </div>
            </div>
            <div className="val-box" onClick={() => handleNavigation('/admin/produits')}>
              <i className="fa-solid fa-mug-saucer"></i>
              <div>
                <h3>Produits</h3>
                <span>Gérer le stock</span>
              </div>
            </div>
            <div className="val-box" onClick={() => handleNavigation('/admin/livreurs')}>
              <i className="fa-solid fa-truck"></i>
              <div>
                <h3>Livreurs</h3>
                <span>Ajouter, modifier, supprimer</span>
              </div>
            </div>
            <div className="val-box" onClick={() => handleNavigation('/admin/statistique')}>
              <i className="fa-solid fa-chart-line"></i>
              <div>
                <h3>Statistiques</h3>
                <span>Statistique de commande</span>
              </div>
            </div>
            <div className="val-box" onClick={() => handleNavigation('/admin/chat')}>
              <i className="fa-solid fa-comments"></i>
              <div>
                <h3>Chat</h3>
                <span>Discuter avec clients</span>
              </div>
            </div>
          </div>
        )}

        <div className="content-area">
          <Outlet />
        </div>
      </section>
    </div>
  );
};

export default Dashboard;