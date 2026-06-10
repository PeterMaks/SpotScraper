import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScraperControl from './pages/ScraperControl';
import Downloads from './pages/Downloads';
import DetailedLogs from './pages/DetailedLogs';
import AcquireDataGuide from './pages/AcquireDataGuide';

import './App.css';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="scraper" element={<ScraperControl />} />
            <Route path="downloads" element={<Downloads />} />
            <Route path="logs" element={<DetailedLogs />} />
            <Route path="acquire" element={<AcquireDataGuide />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
