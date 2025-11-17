import React, { useState, useEffect } from "react";
import axios from "axios";
import "./Clients.css"; // Styles pour la liste des clients

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await axios.get("http://localhost:5000/api/clients");
        setClients(response.data);
        setError(null);
      } catch (err) {
        console.error("Erreur chargement clients:", err);
        setError("Erreur lors du chargement des clients.");
      }
    };
    fetchClients();

    const intervalId = setInterval(fetchClients, 10000);
    return () => clearInterval(intervalId);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const filteredClients = clients.filter(
      (client) =>
        client.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setClients(filteredClients);
  };

  const handleDelete = async (email) => {
    if (window.confirm(`Voulez-vous vraiment supprimer ${email} ?`)) {
      try {
        await axios.delete(`http://localhost:5000/api/clients/${email}`);
        setClients(clients.filter((client) => client.email !== email));
        setError(null);
      } catch (err) {
        console.error("Erreur suppression client:", err);
        setError(`Erreur lors de la suppression de ${email}: ${err.message}`);
      }
    }
  };

  return (
    <div className="client-section">
      <h3>Gérer les Clients</h3>
      <form onSubmit={handleSearch}>
        <div className="input-box">
          <input
            type="text"
            placeholder="Rechercher un client"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <label>Rechercher :</label>
        </div>
        <button type="submit" className="btn">
          Rechercher
        </button>
      </form>
      {error && <p className="error-message">{error}</p>}
      <div className="client-list">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Date d'Inscription</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client, index) => (
              <tr key={index}>
                <td>{client.nom}</td>
                <td>{client.email}</td>
                <td>{new Date(client.date_inscription).toLocaleDateString()}</td>
                <td>
                  <i
                    className="fa-solid fa-trash"
                    style={{ cursor: "pointer", color: "red" }}
                    onClick={() => handleDelete(client.email)}
                  ></i>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Clients;