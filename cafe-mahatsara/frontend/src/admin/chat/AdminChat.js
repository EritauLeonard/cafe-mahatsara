import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './AdminChat.css';

const socket = io('http://localhost:5000');

const AdminChat = () => {
  const [clients, setClients] = useState({});
  const [messages, setMessages] = useState({});
  const [newMessage, setNewMessage] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const messagesEndRef = useRef(null);

  // Gestionnaire de nouveaux messages
  const handleNewMessage = useCallback((data) => {
    console.log('📨 Nouveau message reçu dans admin:', data);
    
    setMessages(prev => {
      const existingMessages = prev[data.email_client] || [];
      
      // Vérifier si le message existe déjà
      const messageExists = existingMessages.some(msg => 
        msg.id === data.id || 
        (msg.message_text === data.message_text && new Date(msg.timestamp).getTime() === new Date(data.timestamp).getTime())
      );
      
      if (messageExists) {
        console.log('🚫 Message déjà existant, ignoré');
        return prev;
      }
      
      return {
        ...prev,
        [data.email_client]: [
          ...existingMessages,
          { 
            id: data.id,
            message_text: data.message_text, 
            sent_by_admin: data.sent_by_admin, 
            timestamp: data.timestamp 
          }
        ]
      };
    });

    // Mettre à jour le compteur de messages non lus
    if (!data.sent_by_admin && selectedClient !== data.email_client) {
      setClients(prev => ({
        ...prev,
        [data.email_client]: {
          ...prev[data.email_client],
          unread: (prev[data.email_client]?.unread || 0) + 1
        }
      }));
    }
  }, [selectedClient]);

  useEffect(() => {
    // Récupérer la liste des clients
    fetchClients();
    
    // Rejoindre la room admin
    socket.emit('join', { email: 'admin@cafe.com', userType: 'admin' });

    // Écouter les nouveaux messages
    socket.on('new-message-admin', handleNewMessage);
    
    // Écouter les erreurs
    socket.on('message-error', (data) => {
      console.error('❌ Erreur message:', data.error);
      alert('Erreur lors de l\'envoi du message: ' + data.error);
    });

    return () => {
      socket.off('new-message-admin', handleNewMessage);
      socket.off('message-error');
      socket.emit('leave', { email: 'admin@cafe.com' });
    };
  }, [handleNewMessage]);

  // Scroll vers le bas
  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedClient]);

  const fetchClients = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/clients');
      const clientsData = response.data.reduce((acc, client) => {
        acc[client.email] = {
          nom: client.nom,
          unread: 0
        };
        return acc;
      }, {});
      setClients(clientsData);
    } catch (err) {
      console.error('Erreur chargement clients:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Charger les messages quand un client est sélectionné
  useEffect(() => {
    if (selectedClient) {
      loadMessages(selectedClient);
      
      // Réinitialiser le compteur de messages non lus pour ce client
      setClients(prev => ({
        ...prev,
        [selectedClient]: {
          ...prev[selectedClient],
          unread: 0
        }
      }));
    }
  }, [selectedClient]);

  const loadMessages = async (clientEmail) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/messages/${clientEmail}`);
      const formattedMessages = response.data.map(msg => ({
        id: msg.id,
        message_text: msg.message_text,
        sent_by_admin: msg.sent_by_admin,
        timestamp: msg.timestamp
      }));
      
      setMessages(prev => ({
        ...prev,
        [clientEmail]: formattedMessages
      }));
    } catch (err) {
      console.error('Erreur chargement messages:', err);
    }
  };

  const sendMessage = () => {
    if (newMessage.trim() && selectedClient) {
      console.log('📤 Envoi message admin:', { selectedClient, newMessage });
      
      socket.emit('send-message', { 
        email_client: selectedClient, 
        message_text: newMessage.trim(), 
        sent_by_admin: true 
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
    <div className="admin-chat">
      <h2>💬 Chat avec les Clients</h2>
      <div className="chat-container">
        <div className="client-list2">
          <h3>Clients ({Object.keys(clients).length})</h3>
          <div className="client-buttons">
            {Object.entries(clients).map(([email, clientData]) => (
              <button 
                key={email} 
                onClick={() => setSelectedClient(email)} 
                className={`client-button ${selectedClient === email ? 'active' : ''}`}
              >
                <span className="client-name">{clientData.nom}</span>
                {clientData.unread > 0 && (
                  <span className="unread-badge">{clientData.unread}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        
        <div className="chat-box">
          {selectedClient ? (
            <>
              <div className="chat-header">
                <h3>Conversation avec {clients[selectedClient]?.nom}</h3>
                <span className="client-email">{selectedClient}</span>
              </div>
              
              <div className="messages">
                {(messages[selectedClient] || []).map((msg, idx) => (
                  <div key={msg.id || idx} className={`message ${msg.sent_by_admin ? 'admin' : 'client'}`}>
                    <div className="message-content">
                      <p>{msg.message_text}</p>
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleString('fr-FR')}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
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
            </>
          ) : (
            <div className="no-client-selected">
              <p>👈 Sélectionnez un client pour commencer à chatter</p>
              <p className="hint">Les messages des clients apparaîtront ici en temps réel</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminChat;