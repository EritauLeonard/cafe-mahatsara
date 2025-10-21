import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Client.css';
import Commandes from './commandes/Commande';
import Contact from './contact/Contact';
import Profile from './profile/Profile';

const Client = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [clientNom, setClientNom] = useState('');
  const [activeMenu, setActiveMenu] = useState('dashboard');

  useEffect(() => {
    const email = localStorage.getItem('clientEmail');
    const nom = localStorage.getItem('clientNom');
    if (email && nom) {
      setClientNom(nom);
      if (location.pathname === '/client') {
        navigate('/client/dashboard');
      }
      
      // Définir le menu actif basé sur l'URL
      const path = location.pathname;
      if (path.includes('dashboard')) setActiveMenu('dashboard');
      else if (path.includes('commandes')) setActiveMenu('commandes');
      else if (path.includes('contact')) setActiveMenu('contact');
      else if (path.includes('profile')) setActiveMenu('profile');
    } else {
      navigate('/');
    }
  }, [navigate, location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('clientEmail');
    localStorage.removeItem('clientNom');
    navigate('/');
  };

  const handleNavigation = (path, menu) => {
    setActiveMenu(menu);
    navigate(path);
  };

  const renderContent = () => {
    switch (location.pathname) {
      case '/client/dashboard':
        return (
          <div className="client-main-content">
            <div className="client-dashboard-image">
              <div className="client-animated-text">
                Bienvenue sur Café Mahatsara où vous pouvez commander et profiter !
              </div>
            </div>
          </div>
        );
      case '/client/commandes':
        return <Commandes />;
      case '/client/contact':
        return <Contact />;
      case '/client/profile':
        return <Profile />;
      default:
        return <div className="client-page-not-found">Page non trouvée</div>;
    }
  };

  return (
    <div className="client-container">
      <div className="client-navbar">
        <h1 className="client-welcome-title">
          Bienvenue, <span className="client-name">{clientNom || 'Client'}</span>
        </h1>
        <div className="client-nav-items">
          <span 
            className="client-nav-item" 
            onClick={() => handleNavigation('/client/profile', 'profile')}
          >
            👤 Mon Profil
          </span>
          <span className="client-nav-item" onClick={handleLogout}>
            🔓 Déconnexion
          </span>
        </div>
      </div>

      <div className="client-layout">
        <div className="client-sidebar">
          <ul className="client-sidebar-menu">
            <li 
              className={`client-menu-item ${activeMenu === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNavigation('/client/dashboard', 'dashboard')}
            >
              🏠 Tableau de bord
            </li>
            <li 
              className={`client-menu-item ${activeMenu === 'commandes' ? 'active' : ''}`}
              onClick={() => handleNavigation('/client/commandes', 'commandes')}
            >
              🛍️ Mes commandes
            </li>
            <li 
              className={`client-menu-item ${activeMenu === 'contact' ? 'active' : ''}`}
              onClick={() => handleNavigation('/client/contact', 'contact')}
            >
              📩 Contact Admin
            </li>
          </ul>
        </div>

        <div className="client-content-area">
          <div className="client-content-wrapper">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Client;