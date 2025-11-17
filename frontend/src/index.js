import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './login/App';
import ResetPassword from './auth/ResetPassword/ResetPassword';
import Dashboard from './admin/Dashboard';
import Client from './client/Client';
import Clients from './admin/clients/Clients';
import Produits from './admin/produits/Produits';
import Livreurs from './admin/livreurs/Livreurs';
import Commandes from './admin/commandes/Commandes';
import Suivi from './admin/suivie/suivie';
import LivreurUnifie from './components/LivreurUnifie';
import Statistiques from './admin/statistiques/Statistiques';
import AdminChat from './admin/chat/AdminChat';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/reset-password" element={<ResetPassword/>} />
      
      <Route path="/admin/*" element={<Dashboard />}>
        <Route path="clients" element={<Clients />} />
        <Route path="produits" element={<Produits />} />
        <Route path="livreurs" element={<Livreurs />} />
        <Route path="commandes" element={<Commandes />} />
        <Route path="suivie" element={<Suivi />} />
        <Route path="statistique" element={<Statistiques />} />
        <Route path="chat" element={<AdminChat />} />
      </Route>
      
      <Route path="/client/*" element={<Client />}>
        <Route path="dashboard" element={<Client />} />
        <Route path="orders" element={<Client />} />
        <Route path="invoices" element={<Client />} />
        <Route path="tracking" element={<Client />} />
        <Route path="contact" element={<Client />} />
        <Route path="profile" element={<Client />} />
      </Route>
      
      <Route path="/livreur" element={<LivreurUnifie />} />
    </Routes>
  </BrowserRouter>
);