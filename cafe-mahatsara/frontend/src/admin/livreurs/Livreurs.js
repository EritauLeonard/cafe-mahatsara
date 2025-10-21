import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Livreurs.css';

const Livreurs = () => {
  const [livreurs, setLivreurs] = useState([]);
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingLivreur, setEditingLivreur] = useState(null);

  useEffect(() => {
    fetchLivreurs();
  }, []);

  const fetchLivreurs = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/livreurs');
      setLivreurs(response.data);
    } catch (err) {
      console.error('Erreur lors de la récupération des livreurs:', err);
      setMessage('Erreur lors du chargement des livreurs.');
    }
  };

  // Validation pour n'accepter que des lettres et espaces dans le nom
  const handleNomChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^[a-zA-ZÀ-ÿ\s]+$/.test(value)) {
      setNom(value);
    }
  };

  // Validation pour n'accepter que des chiffres dans le contact
  const handleContactChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^[0-9+]+$/.test(value)) {
      setContact(value);
    }
  };

  const handleAjouterLivreur = async (e) => {
    e.preventDefault();
    if (!nom || !email || !code || !contact) {
      setMessage('Tous les champs sont requis.');
      return;
    }

    if (nom.length < 2) {
      setMessage('Le nom doit contenir au moins 2 caractères.');
      return;
    }

    if (contact.length < 10) {
      setMessage('Le contact doit contenir au moins 10 chiffres.');
      return;
    }

    try {
      const response = await axios.post('http://localhost:5000/api/livreurs', { 
        nom, 
        email, 
        code, 
        contact 
      });
      
      setMessage('Livreur ajouté avec succès !');
      setLivreurs([...livreurs, response.data.livreur]);
      setNom('');
      setEmail('');
      setCode('');
      setContact('');
    } catch (err) {
      console.error('Erreur ajout livreur:', err);
      setMessage(err.response?.data.message || 'Erreur lors de l\'ajout.');
    }
  };

  const handleModifierLivreur = async (e) => {
    e.preventDefault();
    if (!nom || !email || !code || !contact) {
      setMessage('Tous les champs sont requis.');
      return;
    }

    try {
      await axios.put(`http://localhost:5000/api/livreurs/${editingLivreur.email}`, {
        nom,
        email,
        code,
        contact
      });
      
      setMessage('Livreur modifié avec succès !');
      fetchLivreurs();
      setEditingLivreur(null);
      setNom('');
      setEmail('');
      setCode('');
      setContact('');
    } catch (err) {
      console.error('Erreur modification livreur:', err);
      setMessage(err.response?.data.message || 'Erreur lors de la modification.');
    }
  };

  const handleSupprimerLivreur = async (email) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce livreur ?')) {
      try {
        await axios.delete(`http://localhost:5000/api/livreurs/${email}`);
        setMessage('Livreur supprimé avec succès !');
        fetchLivreurs();
      } catch (err) {
        console.error('Erreur suppression livreur:', err);
        setMessage(err.response?.data.message || 'Erreur lors de la suppression.');
      }
    }
  };

  const handleEdit = (livreur) => {
    setEditingLivreur(livreur);
    setNom(livreur.nom);
    setEmail(livreur.email);
    setCode(livreur.code);
    setContact(livreur.contact);
  };

  const handleCancelEdit = () => {
    setEditingLivreur(null);
    setNom('');
    setEmail('');
    setCode('');
    setContact('');
  };

  // Filtrer les livreurs selon la recherche
  const filteredLivreurs = livreurs.filter(livreur =>
    livreur.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    livreur.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    livreur.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="livreur-section">
      <h3>Gérer les Livreurs</h3>
      
      {message && (
        <div className={`message ${message.includes('succès') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}
      
      {/* Formulaire d'ajout/modification */}
      <form onSubmit={editingLivreur ? handleModifierLivreur : handleAjouterLivreur}>
        <div className="input-box">
          <input
            type="text"
            value={nom}
            onChange={handleNomChange}
            placeholder=" "
            required
            maxLength="50"
          />
          <label>Nom complet :</label>
        </div>
        
        <div className="input-box">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder=" "
            required
            disabled={!!editingLivreur}
          />
          <label>Email :</label>
        </div>
        
        <div className="input-box">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder=" "
            required
            maxLength="20"
          />
          <label>Code unique :</label>
        </div>
        
        <div className="input-box">
          <input
            type="text"
            value={contact}
            onChange={handleContactChange}
            placeholder=" "
            required
            maxLength="15"
          />
          <label>Contact :</label>
        </div>
        
        <div className="form-buttons">
          <button type="submit" className="btn primary">
            {editingLivreur ? 'Modifier livreur' : 'Ajouter livreur'}
          </button>
          {editingLivreur && (
            <button type="button" className="btn secondary" onClick={handleCancelEdit}>
              Annuler
            </button>
          )}
        </div>
      </form>

      {/* Barre de recherche */}
      <div className="search-bar">
        <input
          type="text"
          placeholder="Rechercher un livreur..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Liste des livreurs avec tableau */}
      <h4>Liste des livreurs ({filteredLivreurs.length})</h4>
      
      <div className="livreurs-list">
        {filteredLivreurs.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Code</th>
                <th>Contact</th>
                <th>Date d'inscription</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLivreurs.map((livreur) => (
                <tr key={livreur.email}>
                  <td>{livreur.nom}</td>
                  <td>{livreur.email}</td>
                  <td>{livreur.code}</td>
                  <td>{livreur.contact}</td>
                  <td>{new Date(livreur.date_inscription).toLocaleDateString()}</td>
                  <td>
                    <button 
                      className="action-btn edit-btn"
                      onClick={() => handleEdit(livreur)}
                    >
                      Modifier
                    </button>
                    <button 
                      className="action-btn delete-btn"
                      onClick={() => handleSupprimerLivreur(livreur.email)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="no-data">
            {searchTerm ? 'Aucun livreur trouvé pour votre recherche.' : 'Aucun livreur enregistré pour le moment.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default Livreurs;