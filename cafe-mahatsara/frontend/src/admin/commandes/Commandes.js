import React, { useState, useEffect } from "react";
import axios from "axios";
import io from "socket.io-client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./Commandes.css";

const socket = io("http://localhost:5000");

const Commandes = () => {
  const [commandes, setCommandes] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [livraisonsEnCours, setLivraisonsEnCours] = useState([]);
  const [factures, setFactures] = useState({});
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("en-attente");
  const [factureAffichee, setFactureAffichee] = useState(null);

  useEffect(() => {
    fetchCommandesEnAttente();
    fetchHistorique();
    fetchLivreurs();
    fetchLivraisonsEnCours();

    // Gestion des événements Socket.IO
    socket.on("nouvelle-commande", (data) => {
      console.log("Nouvelle commande:", data);
      fetchCommandesEnAttente();
    });

    socket.on("commande-validee", (data) => {
      console.log("Commande validée:", data);
      fetchCommandesEnAttente();
      fetchHistorique();
      fetchLivraisonsEnCours();
    });

    socket.on("commande-mise-a-jour", (data) => {
      console.log("Commande mise à jour:", data);
      fetchLivraisonsEnCours();
      fetchHistorique();
    });

    socket.on("facture-generee", (data) => {
      console.log("Facture générée:", data);
      fetchLivraisonsEnCours();
      setMessage(data.message);
    });

    socket.on("facture-confirmee", (data) => {
      console.log("Facture confirmée:", data);
      fetchLivraisonsEnCours();
      setMessage(data.message);
    });

    socket.on("commande-annulee", (data) => {
      console.log("Commande annulée:", data);
      fetchCommandesEnAttente();
      fetchLivraisonsEnCours();
      fetchHistorique();
      setMessage(data.message);
    });

    // Dans Commandes.js - Ajouter dans le useEffect des sockets
    socket.on("livreur-accepte-commande", (data) => {
      console.log("🔄 Livreur a accepté commande:", data);
      fetchLivraisonsEnCours(); // Recharger les livraisons en cours
      fetchCommandesEnAttente(); // Recharger les commandes en attente
      setMessage(`Livreur a accepté la commande #${data.commandeId}`);
    });

    // Nettoyage des listeners
    return () => {
      socket.off("nouvelle-commande");
      socket.off("commande-validee");
      socket.off("commande-mise-a-jour");
      socket.off("facture-generee");
      socket.off("facture-confirmee");
      socket.off("commande-annulee");
    };
  }, []);

  // Récupération des commandes en attente
  const fetchCommandesEnAttente = () => {
    axios
      .get("http://localhost:5000/api/commandes-en-attente")
      .then((response) => setCommandes(response.data))
      .catch((err) => {
        console.error("Erreur récupération commandes:", err);
        setMessage("Erreur lors du chargement des commandes");
      });
  };

  // Récupération des livraisons en cours
  const fetchLivraisonsEnCours = () => {
    axios
      .get("http://localhost:5000/api/livraisons-en-cours")
      .then((response) => {
        console.log("Livraisons en cours:", response.data);
        setLivraisonsEnCours(response.data);
      })
      .catch((err) => {
        console.error("Erreur récupération livraisons:", err);
        setMessage("Erreur lors du chargement des livraisons en cours");
      });
  };

  // Récupération de l'historique
  const fetchHistorique = () => {
    console.log("Tentative de récupération de l'historique...");
    axios
      .get("http://localhost:5000/api/commandes/historique")
      .then((response) => {
        console.log("Historique reçu:", response.data);
        setHistorique(response.data);
        setMessage("");
      })
      .catch((err) => {
        console.error("Erreur détaillée récupération historique:", err);
        if (err.response) {
          console.error("Status:", err.response.status);
          console.error("Data:", err.response.data);
          setMessage(
            `Erreur ${err.response.status}: ${
              err.response.data.message || "Route non trouvée"
            }`
          );
        } else if (err.request) {
          console.error("No response received:", err.request);
          setMessage(
            "Serveur inaccessible - vérifie que le serveur est démarré"
          );
        } else {
          console.error("Error:", err.message);
          setMessage("Erreur de configuration: " + err.message);
        }
      });
  };

  // Récupération des livreurs
  const fetchLivreurs = () => {
    axios
      .get("http://localhost:5000/api/livreurs")
      .then((response) => setLivreurs(response.data))
      .catch((err) => console.error("Erreur récupération livreurs:", err));
  };

  // Validation d'une commande
  const validerCommande = (id, emailLivreur) => {
    axios
      .put(`http://localhost:5000/api/commandes/${id}/valider`, {
        email_livreur: emailLivreur,
      })
      .then(() => {
        setMessage("Commande validée avec succès");
        fetchCommandesEnAttente();
        fetchHistorique();
        fetchLivraisonsEnCours();
      })
      .catch((err) => {
        console.error("Erreur validation:", err);
        setMessage(
          err.response?.data?.message || "Erreur lors de la validation"
        );
      });
  };

  // Annulation d'une commande
  const annulerCommande = (id) => {
    axios
      .put(`http://localhost:5000/api/commandes/${id}/annuler`)
      .then(() => {
        setMessage("Commande annulée avec succès");
        fetchCommandesEnAttente();
        fetchLivraisonsEnCours();
        fetchHistorique();
      })
      .catch((err) => {
        console.error("Erreur annulation:", err);
        setMessage(
          err.response?.data?.message || "Erreur lors de l'annulation"
        );
      });
  };

  // Génération d'une facture
  const genererFacture = async (commandeId) => {
    try {
      const response = await axios.post(
        `http://localhost:5000/api/commandes/${commandeId}/generer-facture`
      );
      setFactures((prev) => ({
        ...prev,
        [commandeId]: response.data.facture,
      }));
      setMessage("Facture générée avec succès");

      socket.emit("notification-livreur", {
        message: `Facture générée pour la commande #${commandeId}`,
        commandeId: commandeId,
      });
    } catch (err) {
      console.error("Erreur génération facture:", err);
      setMessage(
        err.response?.data?.message ||
          "Erreur lors de la génération de la facture"
      );
    }
  };

  // Confirmation d'une facture
  const confirmerFacture = async (commandeId) => {
    try {
      await axios.put(
        `http://localhost:5000/api/factures/${commandeId}/confirmer`
      );
      setMessage("Facture confirmée avec succès");

      setFactures((prev) => ({
        ...prev,
        [commandeId]: {
          ...prev[commandeId],
          statut: "Facture confirmée",
        },
      }));
    } catch (err) {
      console.error("Erreur confirmation facture:", err);
      setMessage(
        err.response?.data?.message ||
          "Erreur lors de la confirmation de la facture"
      );
    }
  };

  // Affichage d'une facture
  const afficherFacture = (commandeId) => {
    const facture = factures[commandeId];
    if (!facture) {
      setMessage("Facture non trouvée");
      return;
    }
    setFactureAffichee(facture);
  };

  // Génération d'un PDF de facture - VERSION CORRIGÉE
  const genererPDF = (facture) => {
    const doc = new jsPDF();

    // En-tête
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text("CAFÉ MAHATSARA", 105, 20, { align: "center" });
    doc.setFontSize(16);
    doc.text("FACTURE", 105, 30, { align: "center" });

    // Informations de la facture
    doc.setFontSize(10);
    doc.text(`N° Facture: #${facture.id_commande}`, 20, 45);
    doc.text(
      `Date: ${new Date(facture.date_facture).toLocaleDateString("fr-FR")}`,
      20,
      50
    );

    // SUPPRIMER LA LIGNE DU STATUT - NE PAS AFFICHER LE STATUT DANS LA FACTURE
    // doc.text(`Statut: ${facture.statut}`, 20, 55); // LIGNE SUPPRIMÉE

    // Client
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text("CLIENT:", 20, 65);
    doc.setFontSize(10);
    doc.text(`Nom: ${facture.client.nom}`, 20, 70);
    doc.text(`Adresse: ${facture.client.adresse}`, 20, 75);
    doc.text(`Contact: ${facture.client.contact}`, 20, 80);

    // Livreur
    if (facture.livreur && facture.livreur.nom) {
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      doc.text("LIVREUR:", 120, 65);
      doc.setFontSize(10);
      doc.text(`Nom: ${facture.livreur.nom}`, 120, 70);
      doc.text(`Contact: ${facture.livreur.contact}`, 120, 75);
    }

    // Séparateur
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 85, 190, 85);

    // CORRECTION: Afficher "sac" au lieu de "sec" et format des prix
    const produitsCorriges = facture.produits.map((produit) => ({
      ...produit,
      // Corriger "sec" en "sac"
      type: produit.type === "sec" ? "sac" : produit.type,
      // Formater correctement les prix
      prix_unitaire_formate: produit.prix_unitaire
        .toLocaleString("fr-FR", { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 0 
      }),

      prix_total_formate: produit.prix_total
        .toLocaleString("fr-FR", { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 0 
  }),
    }));

    // Tableau produits avec autoTable
    autoTable(doc, {
      startY: 90,
      head: [["Produit", "Quantité", "Prix Unitaire", "Total"]],
      body: produitsCorriges.map((produit) => [
        produit.type,
        produit.quantite,
        `${produit.prix_unitaire.toLocaleString("fr-FR")} Ar`, // Format correct
        `${produit.prix_total.toLocaleString("fr-FR")} Ar`, // Format correct
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [139, 69, 19], // Couleur café
        textColor: 255,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 10,
        cellPadding: 3,
      },
    });

    // Total
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("TOTAL:", 150, finalY);
    doc.text(
      `${facture.produits
        .reduce((acc, p) => acc + p.prix_total, 0)
        .toLocaleString("fr-FR")} Ar`, // Format correct
      170,
      finalY,
      { align: "right" }
    );

    // Pied de page
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      "Merci pour votre confiance ! Café Mahatsara - Contact: +261 34 00 000 00",
      105,
      280,
      { align: "center" }
    );

    // Sauvegarde
    doc.save(`facture-${facture.id_commande}.pdf`);
  };

  // Impression d'une facture - VERSION CORRIGÉE
  const imprimerFacture = (facture) => {
    // CORRECTION: Afficher "sac" au lieu de "sec" et format des prix
    const produitsCorriges = facture.produits.map((produit) => ({
      ...produit,
      type: produit.type === "sec" ? "sac" : produit.type,
      prix_unitaire_formate: produit.prix_unitaire
        .toLocaleString("fr-FR")
        .replace(/\//g, " "),
      prix_total_formate: produit.prix_total
        .toLocaleString("fr-FR")
        .replace(/\//g, " "),
    }));

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
    <html>
      <head>
        <title>Facture Commande #${facture.id_commande}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background-color: white; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .info { margin-bottom: 20px; display: flex; justify-content: space-between; }
          .info-section { width: 45%; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .table th { background-color: #8B4513; color: white; }
          .total { font-weight: bold; text-align: right; margin-top: 20px; font-size: 16px; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
          @media print { body { margin: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>CAFÉ MAHATSARA</h1>
          <h2>FACTURE</h2>
          <p>Commande #${facture.id_commande}</p>
        </div>
        
        <div class="info">
          <div class="info-section">
            <h3>INFORMATIONS CLIENT</h3>
            <p><strong>Nom:</strong> ${facture.client.nom}</p>
            <p><strong>Adresse:</strong> ${facture.client.adresse}</p>
            <p><strong>Contact:</strong> ${facture.client.contact}</p>
            <p><strong>Date:</strong> ${new Date(
              facture.date_facture
            ).toLocaleDateString("fr-FR")}</p>
          </div>
          ${
            facture.livreur && facture.livreur.nom
              ? `
          <div class="info-section">
            <h3>INFORMATIONS LIVREUR</h3>
            <p><strong>Nom:</strong> ${facture.livreur.nom}</p>
            <p><strong>Contact:</strong> ${facture.livreur.contact}</p>
          </div>
          `
              : ""
          }
        </div>
        
        <table class="table">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Quantité</th>
              <th>Prix Unitaire</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${produitsCorriges
              .map(
                (produit) => `
              <tr>
                <td>${produit.type}</td>
                <td>${produit.quantite}</td>
                <td>${produit.prix_unitaire.toLocaleString("fr-FR")} Ar</td>
                <td>${produit.prix_total.toLocaleString("fr-FR")} Ar</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        
        <div class="total">
          <p>TOTAL: ${produitsCorriges[0].prix_total.toLocaleString(
            "fr-FR"
          )} Ar</p>
        </div>
        
        <div class="footer">
          <p>Merci pour votre confiance ! Café Mahatsara</p>
          <p>Contact: +261 34 00 000 00 | Email: contact@cafe-mahatsara.mg</p>
        </div>

        <div class="no-print" style="margin-top: 20px; text-align: center;">
          <button onclick="window.print()" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">
            🖨️ Imprimer
          </button>
          <button onclick="window.close()" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
            ❌ Fermer
          </button>
        </div>
      </body>
    </html>
  `);
    printWindow.document.close();
  };

  // Détermination de la classe CSS pour le statut
  const getStatusBadageClass = (statut) => {
    switch (statut) {
      case "Validée":
        return "statut-validee";
      case "En préparation":
        return "statut-preparation";
      case "En route pour livraison":
        return "statut-en-route";
      case "Livré":
        return "statut-livre";
      case "Facture confirmée":
        return "statut-confirmee";
      case "Annulée":
        return "statut-annulee";
      default:
        return "statut-default";
    }
  };

  // Rendu du composant
  return (
    <div className="admin-section">
      <h3>Gérer les Commandes</h3>
      {message && <p className="message">{message}</p>}

      {/* Modal d'affichage de facture */}
      {factureAffichee && (
        <div className="modal-overlay">
          <div className="modal-facture">
            <div className="modal-header">
              <h2>Facture #{factureAffichee.id_commande}</h2>
              <button
                onClick={() => setFactureAffichee(null)}
                className="btn-close"
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="facture-info">
                <div className="info-section">
                  <h4>CLIENT</h4>
                  <p>
                    <strong>Nom:</strong> {factureAffichee.client.nom}
                  </p>
                  <p>
                    <strong>Adresse:</strong> {factureAffichee.client.adresse}
                  </p>
                  <p>
                    <strong>Contact:</strong> {factureAffichee.client.contact}
                  </p>
                </div>
                {factureAffichee.livreur && factureAffichee.livreur.nom && (
                  <div className="info-section">
                    <h4>LIVREUR</h4>
                    <p>
                      <strong>Nom:</strong> {factureAffichee.livreur.nom}
                    </p>
                    <p>
                      <strong>Contact:</strong>{" "}
                      {factureAffichee.livreur.contact}
                    </p>
                  </div>
                )}
              </div>
              
              <table className="facture-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Quantité</th>
                    <th>Prix Unitaire</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {factureAffichee.produits.map((produit, index) => (
                    <tr key={index}>
                      <td>{produit.type === "sec" ? "sac" : produit.type}</td>{" "}
                      {/* CORRECTION ICI */}
                      <td>{produit.quantite}</td>
                      <td>
                        {produit.prix_unitaire.toLocaleString("fr-FR")} Ar{" "}
                        {/* FORMAT CORRECT */}
                      </td>
                      <td>{produit.prix_total.toLocaleString("fr-FR")} Ar</td>{" "}
                      {/* FORMAT CORRECT */}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="facture-total">
                <h3>
                  TOTAL:{" "}
                  {factureAffichee.produits[0].prix_total.toLocaleString(
                    "fr-FR"
                  )}{" "}
                  Ar
                </h3>
              </div>
              <div className="facture-actions-modal">
                <button
                  onClick={() => imprimerFacture(factureAffichee)}
                  className="btn-print"
                >
                  🖨️ Imprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="tabs">
        <button
          className={activeTab === "en-attente" ? "active" : ""}
          onClick={() => setActiveTab("en-attente")}
        >
          📋 En attente ({commandes.length})
        </button>
        <button
          className={activeTab === "en-cours" ? "active" : ""}
          onClick={() => setActiveTab("en-cours")}
        >
          🚚 Livraisons en cours ({livraisonsEnCours.length})
        </button>
        <button
          className={activeTab === "historique" ? "active" : ""}
          onClick={() => setActiveTab("historique")}
        >
          📊 Historique ({historique.length})
        </button>
      </div>

      {activeTab === "en-attente" && (
        <div className="commandes-list">
          <h4>Commandes en attente de validation</h4>
          {commandes.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Produit</th>
                  <th>Quantité</th>
                  <th>Prix total</th>
                  <th>Date</th>
                  <th>Assigner Livreur</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {commandes.map((cmd) => (
                  <tr key={cmd.id}>
                    <td>{cmd.client_nom}</td>
                    <td>{cmd.type_produit}</td>
                    <td>{cmd.quantite}</td>
                    <td>{cmd.prix_total} Ar</td>
                    <td>
                      {new Date(cmd.date_commande).toLocaleString("fr-FR")}
                    </td>
                    <td>
                      <select
                        onChange={(e) => {
                          const emailLivreur = e.target.value;
                          if (emailLivreur)
                            validerCommande(cmd.id, emailLivreur);
                        }}
                      >
                        <option value="">Sélectionner un livreur</option>
                        {livreurs.map((livreur) => (
                          <option key={livreur.email} value={livreur.email}>
                            {livreur.nom}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button onClick={() => validerCommande(cmd.id, "")}>
                        Valider sans livreur
                      </button>
                      <button
                        onClick={() => annulerCommande(cmd.id)}
                        className="btn-annuler"
                      >
                        ❌ Annuler
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Aucune commande en attente</p>
          )}
        </div>
      )}

      {activeTab === "en-cours" && (
        <div className="livraisons-list">
          <h4>Livraisons en cours</h4>
          {livraisonsEnCours.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Adresse</th>
                  <th>Produit</th>
                  <th>Quantité</th>
                  <th>Livreur</th>
                  <th>Statut</th>
                  <th>Date commande</th>
                  <th>Actions Facture</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {livraisonsEnCours.map((livraison) => (
                  <tr key={livraison.id}>
                    <td>{livraison.client_nom}</td>
                    <td>{livraison.client_adresse}</td>
                    <td>{livraison.type_produit}</td>
                    <td>{livraison.quantite}</td>
                    <td>{livraison.livreur_nom || "Non assigné"}</td>
                    <td>
                      <span
                        className={`statut-badge ${getStatusBadageClass(
                          livraison.statut
                        )}`}
                      >
                        {livraison.statut}
                      </span>
                    </td>
                    <td>
                      {new Date(livraison.date_commande).toLocaleString(
                        "fr-FR"
                      )}
                    </td>
                    <td>
                      {factures[livraison.id] && (
                        <div className="facture-actions">
                          <button
                            className="btn-afficher"
                            onClick={() => afficherFacture(livraison.id)}
                          >
                            👁️ Voir
                          </button>
                          <button
                            className="btn-imprimer"
                            onClick={() =>
                              imprimerFacture(factures[livraison.id])
                            }
                          >
                            🖨️ Imprimer
                          </button>
                        </div>
                      )}
                      {(livraison.statut === "Validée" ||
                        livraison.statut === "En préparation") &&
                        !factures[livraison.id] && (
                          <button
                            className="btn-generer"
                            onClick={() => genererFacture(livraison.id)}
                          >
                            📄 Générer Facture
                          </button>
                        )}
                      {livraison.statut === "En préparation" &&
                        factures[livraison.id] && (
                          <button
                            className="btn-confirmer"
                            onClick={() => confirmerFacture(livraison.id)}
                          >
                            ✅ Confirmer
                          </button>
                        )}
                    </td>
                    <td>
                      <button
                        onClick={() => annulerCommande(livraison.id)}
                        className="btn-annuler"
                      >
                        ❌ Annuler
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Aucune livraison en cours</p>
          )}
        </div>
      )}

      {activeTab === "historique" && (
        <div className="historique-list2">
          <h4>Historique des Commandes</h4>
          {historique.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Quantité</th>
                  <th>Date</th>
                  <th>Prix Produit</th>
                  <th>Prix Total</th>
                  <th>Livreur</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {historique.map((cmd) => (
                  <tr key={cmd.id}>
                    <td>{cmd.client_nom || "Non spécifié"}</td>
                    <td>{cmd.quantite}</td>
                    <td>
                      {new Date(cmd.date_commande).toLocaleString("fr-FR")}
                    </td>
                    <td>
                      {cmd.prix_total && cmd.quantite
                        ? cmd.prix_total / cmd.quantite + " Ar"
                        : "N/A"}
                    </td>
                    <td>{cmd.prix_total || "N/A"} Ar</td>
                    <td>{cmd.email_livreur || "Non assigné"}</td>
                    <td>
                      <span
                        className={`statut-badge ${getStatusBadageClass(
                          cmd.statut
                        )}`}
                      >
                        {cmd.statut}
                      </span>
                    </td>
                    <td>
                      {factures[cmd.id] && (
                        <div className="facture-actions">
                          <button
                            className="btn-afficher"
                            onClick={() => afficherFacture(cmd.id)}
                          >
                            👁️ Voir
                          </button>
                          <button
                            className="btn-pdf"
                            onClick={() => genererPDF(factures[cmd.id])}
                          >
                            📄 PDF
                          </button>
                          <button
                            className="btn-imprimer"
                            onClick={() => imprimerFacture(factures[cmd.id])}
                          >
                            🖨️ Imprimer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Aucun historique disponible</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Commandes;
