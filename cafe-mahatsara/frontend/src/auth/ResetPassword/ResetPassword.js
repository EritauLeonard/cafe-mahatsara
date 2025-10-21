import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import "./ResetPassword.css";

function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    if (!newPassword || !confirmPassword) {
      setMessage("Veuillez remplir tous les champs.");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Les mots de passe ne correspondent pas.");
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setMessage("Le mot de passe doit contenir au moins 6 caractères.");
      setLoading(false);
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
      setTimeout(() => navigate("/"), 3000);
    } catch (err) {
      console.error("Erreur réinitialisation:", err);
      if (err.response) {
        setMessage(err.response.data.message || "Erreur lors de la réinitialisation");
      } else {
        setMessage("Erreur réseau. Vérifiez votre connexion.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const email = params.get('email');
    
    if (!token || !email) {
      setMessage("Lien de réinitialisation invalide.");
    }
  }, [location]);

  return (
    <div className="reset-password-container">
      <div className="reset-password-box">
        <div className="reset-password-header">
          <h2>Réinitialisation du mot de passe</h2>
          <p>Café Mahatsara</p>
        </div>

        <form onSubmit={handleResetPassword} className="reset-password-form">
          <div className="input-group">
            <div className="input-box">
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
            
            <div className="input-box">
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
          </div>

          <button 
            type="submit" 
            className="reset-btn"
            disabled={loading}
          >
            {loading ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
          </button>
        </form>

        {message && (
          <div className={`message ${message.includes("succès") ? "success" : "error"}`}>
            {message}
          </div>
        )}

        <div className="reset-footer">
          <button 
            onClick={() => navigate("/")}
            className="back-to-login"
          >
            ← Retour à la connexion
          </button>
        </div>
      </div>
    </div>
  );
}
export default ResetPassword;