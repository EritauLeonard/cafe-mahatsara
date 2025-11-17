import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './Contact.css';

const socket = io('http://localhost:5000');

const Contact = () => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const email = localStorage.getItem('clientEmail');
  const messagesRef = useRef(null);

  // Charger les messages
  const loadMessages = useCallback(async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/messages/${email}`);
      setMessages(response.data || []);
    } catch (err) {
      console.error('Erreur chargement messages:', err);
    }
  }, [email]);

  // Gestionnaire de nouveaux messages
  const handleNewMessage = useCallback((data) => {
    console.log('📨 Nouveau message reçu dans client:', data);
    
    if (data.email_client === email) {
      setMessages(prev => {
        const messageExists = prev.some(msg => 
          msg.id === data.id || 
          (msg.message_text === data.message_text && new Date(msg.timestamp).getTime() === new Date(data.timestamp).getTime())
        );
        
        if (messageExists) {
          console.log('🚫 Message déjà existant, ignoré');
          return prev;
        }
        
        return [...prev, data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      });
    }
  }, [email]);

  useEffect(() => {
    if (email) {
      console.log('🔗 Connexion socket pour:', email);
      
      // Rejoindre la room
      socket.emit('join', { email, userType: 'client' });

      // Charger les messages existants
      loadMessages();

      // Écouter les nouveaux messages
      socket.on('new-message', handleNewMessage);
      
      // Écouter les erreurs
      socket.on('message-error', (data) => {
        console.error('❌ Erreur message:', data.error);
        alert('Erreur lors de l\'envoi du message: ' + data.error);
      });

      return () => {
        socket.off('new-message', handleNewMessage);
        socket.off('message-error');
        socket.emit('leave', { email });
      };
    }
  }, [email, handleNewMessage, loadMessages]); // Ajout de loadMessages dans les dépendances

  // Scroll vers le bas
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = () => {
    if (newMessage.trim() && email) {
      console.log('📤 Envoi message client:', { email, newMessage });
      
      socket.emit('send-message', { 
        email_client: email, 
        message_text: newMessage.trim(), 
        sent_by_admin: false 
      });
      
      setNewMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="main">
      <h1>📩 Contact Admin</h1>
      <div className="contact-container">
        <div className="messages" ref={messagesRef}>
          {messages.length > 0 ? (
            messages.map((msg, index) => (
              <div key={msg.id || index} className={`message ${msg.sent_by_admin ? 'admin' : 'client'}`}>
                <p style={{ 
                  wordBreak: 'break-word', 
                  overflowWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                  margin: '0 0 0.3rem 0',
                  fontSize: '0.95rem',
                  lineHeight: '1.3'
                }}>
                  {msg.message_text}
                </p>
                <span>{new Date(msg.timestamp).toLocaleString('fr-FR')}</span>
              </div>
            ))
          ) : (
            <p className="no-messages">Aucun message pour l'instant. Envoyez un message à l'admin !</p>
          )}
        </div>
        <div className="input-area">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Tapez votre message..."
            maxLength="500"
          />
          <button 
            onClick={sendMessage} 
            disabled={!newMessage.trim()}
            className="send-button"
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
};

export default Contact;