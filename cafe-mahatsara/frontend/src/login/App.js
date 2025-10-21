import { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";
import { useNavigate, useLocation } from "react-router-dom";

function App() {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [message, setMessage] = useState("");
  const [estConnecte, setEstConnecte] = useState(false);
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [contact, setContact] = useState("");
  const [inscription, setInscription] = useState(false);
  const [userType, setUserType] = useState("");
  const [photo, setPhoto] = useState(null);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetPassword, setResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!email) {
      setMessage("Veuillez entrer votre email.");
      return;
    }
    try {
      const response = await axios.post("http://localhost:5000/forgot-password", { email });
      setMessage(response.data.message);
      setForgotPassword(false);
      setEmail("");
    } catch (err) {
      console.error("Erreur demande réinitialisation:", err);
      if (err.response) {
        setMessage(err.response.data.message || "Erreur lors de la demande de réinitialisation");
      } else {
        setMessage(`Erreur réseau : ${err.message}`);
      }
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMessage("");
    
    if (!newPassword) {
      setMessage("Veuillez entrer un nouveau mot de passe.");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setMessage("Les mots de passe ne correspondent pas.");
      return;
    }
    
    if (newPassword.length < 6) {
      setMessage("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    try {
      const params = new URLSearchParams(location.search);
      const token = params.get('token');
      const email = params.get('email');
      const response = await axios.post("http://localhost:5000/reset-password", {
        email,
        token,
        newPassword
      });
      setMessage(response.data.message);
      setResetPassword(false);
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      console.error("Erreur réinitialisation mot de passe:", err);
      if (err.response) {
        setMessage(err.response.data.message || "Erreur lors de la réinitialisation");
      } else {
        setMessage(`Erreur réseau : ${err.message}`);
      }
    }
  };

  const gererConnexion = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!email || !motDePasse) {
      setMessage("Veuillez remplir tous les champs de connexion.");
      return;
    }
    try {
      const response = await axios.post("http://localhost:5000/login", {
        email,
        motDePasse,
      });
      setMessage(response.data.message);
      setEstConnecte(true);
      setUserType(response.data.userType || "");

      if (response.data.userType === "admin") {
        navigate("/admin");
      } else if (response.data.userType === "client") {
        localStorage.setItem("clientEmail", response.data.email);
        const clientDetails = await axios.get(
          `http://localhost:5000/api/clients/${response.data.email}`
        );
        const clientNom = clientDetails.data.nom;
        localStorage.setItem("clientNom", clientNom);
        navigate("/client");
      } else if (response.data.userType === "livreur") {
        localStorage.setItem("livreurEmail", response.data.email);
        localStorage.setItem("livreurCode", response.data.code);
        navigate("/livreur");
      } else {
        setMessage(
          "Utilisateur non reconnu. Aucun rôle (admin, client, livreur) trouvé."
        );
        setEstConnecte(false);
      }

      setEmail("");
      setMotDePasse("");
    } catch (err) {
      if (err.code === "ECONNREFUSED") {
        setMessage(
          'Erreur : Le serveur backend n\'est pas démarré. Vérifiez que "node server.js" est lancé sur le port 5000.'
        );
      } else if (err.response) {
        setMessage(err.response.data.message || "Erreur lors de la connexion");
      } else {
        setMessage(
          `Erreur réseau : ${err.message}. Vérifiez votre connexion ou le backend.`
        );
      }
      console.error("Erreur connexion:", err);
      setEstConnecte(false);
    }
  };

  const gererInscription = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!nom || !email || !motDePasse || !adresse || !contact || !photo) {
      setMessage(
        "Veuillez remplir tous les champs d'inscription, y compris la photo."
      );
      return;
    }
    const formData = new FormData();
    formData.append("nom", nom);
    formData.append("email", email);
    formData.append("motDePasse", motDePasse);
    formData.append("adresse", adresse);
    formData.append("contact", contact);
    formData.append("photo", photo);

    try {
      const response = await axios.post(
        "http://localhost:5000/register",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      setMessage(response.data.message);
      setInscription(false);
      setNom("");
      setEmail("");
      setMotDePasse("");
      setAdresse("");
      setContact("");
      setPhoto(null);
    } catch (err) {
      console.error("Erreur inscription:", err);
      if (err.response) {
        setMessage(err.response.data.message || "Erreur lors de l'inscription");
      } else {
        setMessage(
          `Erreur réseau : ${err.message}. Vérifiez votre connexion ou le backend.`
        );
      }
    }
  };

  const gererDeconnexion = () => {
    setEstConnecte(false);
    setUserType("");
    setMessage("");
    localStorage.removeItem("clientNom");
    localStorage.removeItem("clientEmail");
    localStorage.removeItem("livreurEmail");
    localStorage.removeItem("livreurCode");
    navigate("/");
  };

  const basculerInscription = () => {
    setInscription((prev) => !prev);
    setForgotPassword(false);
    setResetPassword(false);
    setMessage("");
    setNom("");
    setEmail("");
    setMotDePasse("");
    setAdresse("");
    setContact("");
    setPhoto(null);
  };

  const basculerMotDePasseOublie = () => {
    setForgotPassword((prev) => !prev);
    setInscription(false);
    setResetPassword(false);
    setMessage("");
    setEmail("");
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const email = params.get('email');
    if (token && email) {
      setResetPassword(true);
      setForgotPassword(false);
      setInscription(false);
      setEmail(decodeURIComponent(email));
    }
  }, [location]);

  return (
    <div className="app-container">
      <div className={`wrapper ${inscription ? "active" : ""}`}>
        <span className="bg-animate"></span>
        <span className="bg-animate2"></span>

        <div className="form-box login">
          {!estConnecte && !forgotPassword && !resetPassword ? (
            <>
              <h2 className="animation" style={{ "--i": 0, "--j": 21 }}>
                Café Mahatsara
              </h2>
              <form onSubmit={gererConnexion}>
                <div
                  className="input-box animation"
                  style={{ "--i": 1, "--j": 22 }}
                >
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder=" "
                    required
                  />
                  <label>Email :</label>
                  <i className="bx bxs-user"></i>
                </div>
                <div
                  className="input-box animation"
                  style={{ "--i": 2, "--j": 23 }}
                >
                  <input
                    type="password"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    placeholder=" "
                    required
                  />
                  <label>Mot de passe :</label>
                  <i className="bx bxs-lock-alt"></i>
                </div>
                <button
                  type="submit"
                  className="btn animation"
                  style={{ "--i": 3, "--j": 24 }}
                >
                  Se connecter
                </button>
                <div
                  className="logreg-link animation"
                  style={{ "--i": 4, "--j": 25 }}
                >
                  <p>
                    Pas de compte ?{" "}
                    <button
                      type="button"
                      onClick={basculerInscription}
                      className="register-link"
                    >
                      S'inscrire
                    </button>
                  </p>
                  <p>
                    <button
                      type="button"
                      onClick={basculerMotDePasseOublie}
                      className="forgot-password-link"
                    >
                      Mot de passe oublié ?
                    </button>
                  </p>
                </div>
              </form>
            </>
          ) : forgotPassword ? (
            <>
              <h2 className="animation" style={{ "--i": 0, "--j": 21 }}>
                Réinitialiser le mot de passe
              </h2>
              <form onSubmit={handleForgotPassword}>
                <div
                  className="input-box animation"
                  style={{ "--i": 1, "--j": 22 }}
                >
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder=" "
                    required
                  />
                  <label>Email :</label>
                  <i className="bx bxs-envelope"></i>
                </div>
                <button
                  type="submit"
                  className="btn animation"
                  style={{ "--i": 2, "--j": 23 }}
                >
                  Envoyer le lien
                </button>
                <div
                  className="logreg-link animation"
                  style={{ "--i": 3, "--j": 24 }}
                >
                  <p>
                    <button
                      type="button"
                      onClick={basculerMotDePasseOublie}
                      className="login-link"
                    >
                      Retour à la connexion
                    </button>
                  </p>
                </div>
              </form>
            </>
          ) : resetPassword ? (
            <>
              <h2 className="animation" style={{ "--i": 0, "--j": 21 }}>
                Nouveau mot de passe
              </h2>
              <form onSubmit={handleResetPassword}>
                <div
                  className="input-box animation"
                  style={{ "--i": 1, "--j": 22 }}
                >
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder=" "
                    required
                  />
                  <label>Nouveau mot de passe :</label>
                  <i className="bx bxs-lock-alt"></i>
                </div>
                <div
                  className="input-box animation"
                  style={{ "--i": 2, "--j": 23 }}
                >
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder=" "
                    required
                  />
                  <label>Confirmer le mot de passe :</label>
                  <i className="bx bxs-lock-alt"></i>
                </div>
                <button
                  type="submit"
                  className="btn animation"
                  style={{ "--i": 3, "--j": 24 }}
                >
                  Réinitialiser
                </button>
                <div
                  className="logreg-link animation"
                  style={{ "--i": 4, "--j": 25 }}
                >
                  <p>
                    <button
                      type="button"
                      onClick={() => navigate("/")}
                      className="login-link"
                    >
                      Retour à la connexion
                    </button>
                  </p>
                </div>
              </form>
            </>
          ) : userType === "client" ? (
            <div
              className="client-panel animation"
              style={{ "--i": 0, "--j": 21 }}
            >
              <h2>Bienvenue, {localStorage.getItem("clientNom")} !</h2>
              <p>
                Vous êtes connecté en tant que client. Redirection en cours...
              </p>
              <button
                onClick={gererDeconnexion}
                className="btn animation"
                style={{ "--i": 3, "--j": 24 }}
              >
                Déconnexion
              </button>
            </div>
          ) : userType === "admin" ? (
            <div
              className="admin-panel animation"
              style={{ "--i": 0, "--j": 21 }}
            >
              <h2>Bienvenue, Admin !</h2>
              <p>Redirection vers le dashboard...</p>
            </div>
          ) : userType === "livreur" ? (
            <div
              className="livreur-panel animation"
              style={{ "--i": 0, "--j": 21 }}
            >
              <h2>Bienvenue, Livreur !</h2>
              <p>Redirection vers votre tableau de bord...</p>
            </div>
          ) : null}
        </div>

        <div className="info-text login">
          <h2 className="animation" style={{ "--i": 0, "--j": 20 }}>
            Bienvenue
          </h2>
          <p className="animation" style={{ "--i": 1, "--j": 21 }}>
            Café pur 100% - Café Mahatsara
          </p>
        </div>

        <div className="form-box register">
          <h2 className="animation" style={{ "--i": 17, "--j": 0 }}>
            Café Mahatsara
          </h2>
          <form onSubmit={gererInscription}>
            <div
              className="input-box animation"
              style={{ "--i": 18, "--j": 1 }}
            >
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder=" "
                required
              />
              <label>Nom :</label>
              <i className="bx bxs-user"></i>
            </div>
            <div
              className="input-box animation"
              style={{ "--i": 19, "--j": 2 }}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                required
              />
              <label>Email :</label>
              <i className="bx bxs-envelope"></i>
            </div>
            <div
              className="input-box animation"
              style={{ "--i": 20, "--j": 3 }}
            >
              <input
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                placeholder=" "
                required
              />
              <label>Mot de passe :</label>
              <i className="bx bxs-lock-alt"></i>
            </div>
            <div
              className="input-box animation"
              style={{ "--i": 21, "--j": 4 }}
            >
              <input
                type="text"
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder=" "
                required
              />
              <label>Adresse :</label>
            </div>
            <div
              className="input-box animation"
              style={{ "--i": 22, "--j": 5 }}
            >
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder=" "
                required
              />
              <label>Contact :</label>
            </div>
            <div
              className="input-box animation"
              style={{ "--i": 23, "--j": 6 }}
            >
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhoto(e.target.files[0])}
                required
              />
              <label>Photo de profil :</label>
            </div>
            <button
              type="submit"
              className="btn animation"
              style={{ "--i": 24, "--j": 7 }}
            >
              S'inscrire
            </button>
            <div
              className="logreg-link animation"
              style={{ "--i": 25, "--j": 8 }}
            >
              <p>
                Déjà un compte ?{" "}
                <button
                  type="button"
                  onClick={basculerInscription}
                  className="login-link"
                >
                  Se connecter
                </button>
              </p>
            </div>
          </form>
        </div>

        <div className="info-text register">
          <h2 className="animation" style={{ "--i": 17, "--j": 0 }}>
            Bienvenue
          </h2>
          <p className="animation" style={{ "--i": 18, "--j": 1 }}>
            Découvrez notre café pur 100% - Café Mahatsara
          </p>
        </div>

        {message && (
          <p
            className={`message-display ${
              message.includes("incorrect") || 
              message.includes("Erreur") || 
              message.includes("non trouvé") || 
              message.includes("invalide")
                ? "error"
                : "success"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

export default App;