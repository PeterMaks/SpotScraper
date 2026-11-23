
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScraperControl from './pages/ScraperControl';
import Downloads from './pages/Downloads';
import DetailedLogs from './pages/DetailedLogs';
import AcquireDataGuide from './pages/AcquireDataGuide';
import VisualizerPage from './pages/VisualizerPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';

import './App.css';

function App() {
  return (
    <AppProvider>
      <ThemeProvider defaultTheme="system" storageKey="spotscraper-theme">
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="scraper" element={<ScraperControl />} />
                <Route path="downloads" element={<Downloads />} />
                <Route path="visualizer" element={<VisualizerPage />} />
                <Route path="logs" element={<DetailedLogs />} />
                <Route path="acquire" element={<AcquireDataGuide />} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </ThemeProvider>
    </AppProvider>
  );
}

export default App;
