import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Profile.css';

const Profile = () => {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [photo, setPhoto] = useState('/default.jpg');
  const [newPhoto, setNewPhoto] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      const email = localStorage.getItem('clientEmail');
      if (email) {
        try {
          const response = await axios.get(`http://localhost:5000/api/clients/${email}`);
          setNom(response.data.nom || '');
          setEmail(email);
          setContact(response.data.contact || '');
          setPhoto(response.data.photo || '/default.jpg');
        } catch (err) {
          console.error('Erreur chargement profil:', err);
          setMessage('Erreur lors du chargement du profil.');
        }
      }
    };
    fetchProfile();
  }, []);

  const handleUpdate = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('nom', nom);
    formData.append('contact', contact); // Utilise 'contact' au lieu de 'telephone'
    if (newPhoto) formData.append('photo', newPhoto);

    try {
      const response = await axios.put(
        `http://localhost:5000/api/clients/${email}`, 
        formData, 
        {
          headers: { 
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      
      setMessage(response.data.message);
      if (response.data.user && response.data.user.photo) {
        setPhoto(response.data.user.photo);
      }
      setNewPhoto(null);
      setPreviewPhoto('');
      
      // Recharger les données après mise à jour
      const profileResponse = await axios.get(`http://localhost:5000/api/clients/${email}`);
      setNom(profileResponse.data.nom || '');
      setContact(profileResponse.data.contact || '');
      setPhoto(profileResponse.data.photo || '/default.jpg');
      
    } catch (err) {
      console.error('Erreur mise à jour profil:', err.response?.data || err.message);
      setMessage(err.response?.data?.message || 'Erreur lors de la mise à jour.');
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Vérifier la taille et le type du fichier
      if (file.size > 5 * 1024 * 1024) { // 5MB max
        setMessage('La photo ne doit pas dépasser 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setMessage('Veuillez sélectionner une image valide');
        return;
      }
      
      setNewPhoto(file);
      setPreviewPhoto(URL.createObjectURL(file));
      setMessage(''); // Clear any previous error messages
    } else {
      setNewPhoto(null);
      setPreviewPhoto('');
    }
  };

  const handleDeleteConfirm = () => {
    if (window.confirm('Es-tu sûr de vouloir supprimer ton compte ? Cette action est irréversible.')) {
      handleDelete();
    }
  };

  const handleDelete = async () => {
    const email = localStorage.getItem('clientEmail');
    try {
      await axios.delete(`http://localhost:5000/api/clients/${email}`);
      setMessage('Votre compte a été supprimé.');
      localStorage.removeItem('clientNom');
      localStorage.removeItem('clientEmail');
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      console.error('Erreur suppression:', err);
      setMessage('Erreur lors de la suppression.');
    }
  };

  return (
    <div className="container">
      <h1>👤 Mon Profil</h1>
      <div className="profile-card">
        <div className="profile-photo">
          <img 
            src={photo} 
            alt="Profil de l'utilisateur" 
            onError={(e) => { 
              e.target.src = '/default.jpg'; 
            }} 
          />
          {previewPhoto && (
            <div className="preview-photo">
              <h3>Prévisualisation :</h3>
              <img src={previewPhoto} alt="Prévisualisation du profil" />
            </div>
          )}
        </div>
        <div className="profile-info">
          <form onSubmit={handleUpdate}>
            <div className="form-group">
              <label><strong>Nom :</strong></label>
              <input 
                type="text" 
                value={nom} 
                onChange={(e) => setNom(e.target.value)}
                required 
              />
            </div>
            <div className="form-group">
              <label><strong>Email :</strong></label>
              <span>{email}</span>
            </div>
            <div className="form-group">
              <label><strong>Téléphone :</strong></label>
              <input 
                type="text" 
                value={contact} 
                onChange={(e) => setContact(e.target.value)}
                required 
              />
            </div>
            <div className="form-group">
              <label>Changer la photo :</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handlePhotoChange} 
              />
            </div>
            <div className="profile-actions">
              <button type="submit" className="btn-edit">✏️ Modifier mon profil</button>
              <button type="button" className="btn-delete" onClick={handleDeleteConfirm}>
                ❌ Supprimer mon compte
              </button>
            </div>
          </form>
        </div>
      </div>
      {message && (
        <p className={`message ${message.includes('succès') ? 'success' : 'error'}`}>
          {message}
        </p>
      )}
    </div>
  );
};

export default Profile;