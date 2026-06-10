import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import * as Icons from 'lucide-react';

export default function DetailedLogs() {
  const {
    logs,
    fetchLogs,
    loadingLogs,
    logsFilter, setLogsFilter,
    logsSearch, setLogsSearch,
    backendUrl
  } = useAppContext();

  const [selectedLogs, setSelectedLogs] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);

  // Fetch logs when the component mounts
  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compile detailed logs list from backend data
  const getLogsList = () => {
    const list = [];

    // Add items from download_links.json (API Scraper)
    if (logs?.downloadLinks) {
      Object.entries(logs.downloadLinks).forEach(([query, info]) => {
        let title = info.title || query;
        let artist = info.artist || 'Unknown Artist';
        
        if ((artist === 'Unknown Artist' || artist === 'Local Cache') && query.includes(' - ')) {
          const parts = query.split(' - ');
          artist = parts[0].trim();
        }

        let rawTime = 0;
        const timeStr = info.download_completed || info.search_time;
        if (timeStr && timeStr !== '-') {
          const parsed = new Date(timeStr.replace(' ', 'T')).getTime();
          if (!isNaN(parsed)) rawTime = parsed;
        }

        list.push({
          query,
          title,
          artist,
          album: info.album || 'Unknown Album',
          duration: info.duration || '-',
          source: info.source === 'selenium' ? 'Selenium Scraper' : 'API Scraper',
          status: info.status || 'unknown',
          time: timeStr || '-',
          error: info.error || null,
          rawTime
        });
      });
    }

    // Add items from scrape_log.json (Selenium Scraper)
    if (logs?.scrapeLog) {
      Object.entries(logs.scrapeLog).forEach(([query, status]) => {
        let resolvedStatus = 'unknown';
        const lowerStatus = status.toLowerCase();
        if (lowerStatus.includes('success')) resolvedStatus = 'downloaded';
        else if (lowerStatus.includes('failed')) resolvedStatus = 'not_found';
        else if (lowerStatus.includes('skipped')) resolvedStatus = 'skipped';
        else if (lowerStatus.includes('skipped mismatch')) resolvedStatus = 'skipped mismatch';

        // Avoid duplicates if already in API logs
        if (!list.some(item => item.query === query)) {
          let title = query;
          let artist = '-';
          
          if (query.includes(' - ')) {
            const parts = query.split(' - ');
            artist = parts[0].trim();
          }

          list.push({
            query,
            title,
            artist,
            album: '-',
            duration: '-',
            source: 'Selenium Scraper',
            status: resolvedStatus,
            time: '-',
            error: status.includes('Failed') ? status : null,
            rawTime: 0 // Selenium logs don't currently save time, default to 0
          });
        }
      });
    }

    // Sort descending by time
    list.sort((a, b) => b.rawTime - a.rawTime);

    return list;
  };

  const filteredLogs = getLogsList().filter(item => {
    if (logsFilter === 'DOWNLOADED' && item.status !== 'downloaded') return false;
    if (logsFilter === 'NOT_FOUND' && item.status !== 'not_found') return false;
    if (logsFilter === 'ERROR' && item.status !== 'error' && item.status !== 'api_error' && item.status !== 'timeout') return false;
    if (logsFilter === 'SKIPPED/MISMATCH/UNKNOWN' && !['skipped', 'mismatch', 'unknown'].includes(item.status)) return false;

    const term = logsSearch.toLowerCase();
    return (
      item.query.toLowerCase().includes(term) ||
      item.title.toLowerCase().includes(term) ||
      item.artist.toLowerCase().includes(term) ||
      item.album.toLowerCase().includes(term)
    );
  });

  const handleCheckboxClick = (e, query, index) => {
    e.stopPropagation();
    const newSelected = new Set(selectedLogs);

    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const isSelected = newSelected.has(query);

      for (let i = start; i <= end; i++) {
        if (isSelected) {
          newSelected.delete(filteredLogs[i].query);
        } else {
          newSelected.add(filteredLogs[i].query);
        }
      }
    } else {
      if (newSelected.has(query)) {
        newSelected.delete(query);
      } else {
        newSelected.add(query);
      }
    }

    setSelectedLogs(newSelected);
    setLastSelectedIndex(index);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedLogs(new Set(filteredLogs.map(item => item.query)));
    } else {
      setSelectedLogs(new Set());
    }
    setLastSelectedIndex(null);
  };

  const handleBatchDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedLogs.size} logs? They will be archived.`)) return;

    try {
      const res = await fetch(`${backendUrl}/api/logs/delete-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: Array.from(selectedLogs) })
      });
      if (res.ok) {
        setSelectedLogs(new Set());
        fetchLogs();
      }
    } catch (err) {
      console.error('Error batch deleting logs:', err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear ALL logs? They will be archived.')) return;

    try {
      const res = await fetch(`${backendUrl}/api/logs/clear`, { method: 'POST' });
      if (res.ok) {
        setSelectedLogs(new Set());
        fetchLogs();
      }
    } catch (err) {
      console.error('Error clearing logs:', err);
    }
  };

  return (
    <div className="tab-content animate-fade-in">
      <div className="header-summary">
        <div>
          <h2>Execution & Scrape Logs</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Detailed report of all searched queries and their resolve status</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary danger" onClick={handleClearAll} disabled={loadingLogs || getLogsList().length === 0}>
            Clear All
          </button>
          <button className="btn btn-secondary" onClick={fetchLogs} disabled={loadingLogs}>
            Refresh Logs
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
        <div className="filter-bar">
          {['ALL', 'DOWNLOADED', 'NOT_FOUND', 'ERROR', 'SKIPPED/MISMATCH/UNKNOWN'].map(status => (
            <button
              key={status}
              className={`filter-chip ${logsFilter === status ? 'active' : ''}`}
              onClick={() => setLogsFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>
        <div style={{ width: '280px' }}>
          <input
            type="text"
            className="input"
            placeholder="Search logs..."
            value={logsSearch}
            onChange={(e) => setLogsSearch(e.target.value)}
          />
        </div>
      </div>

      {loadingLogs ? (
        <div style={{ textAlign: 'center', padding: '40px' }} className="pulse">
          <p>Loading log files...</p>
        </div>
      ) : (
        <div className="panel" style={{ padding: '0px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tracks-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: '16px', width: '40px' }}>
                    <input 
                      type="checkbox" 
                      checked={filteredLogs.length > 0 && selectedLogs.size === filteredLogs.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>Query / Song Name</th>
                  <th>Resolved Match</th>
                  <th>Album / Artist</th>
                  <th>Engine</th>
                  <th>Status</th>
                  <th style={{ paddingRight: '24px', textAlign: 'right' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((item, idx) => {
                  const statusClass =
                    item.status === 'downloaded' ? 'badge-success' :
                      item.status === 'ready_to_download' ? 'badge-info' :
                        item.status === 'not_found' ? 'badge-danger' : 'badge-warning';

                  return (
                    <tr key={idx} onClick={(e) => {
                      if (e.target.type !== 'checkbox') {
                        handleCheckboxClick(e, item.query, idx);
                      }
                    }} style={{ cursor: 'pointer' }} className={selectedLogs.has(item.query) ? 'selected' : ''}>
                      <td style={{ paddingLeft: '16px' }} onClick={(e) => handleCheckboxClick(e, item.query, idx)}>
                        <input 
                          type="checkbox" 
                          checked={selectedLogs.has(item.query)}
                          onChange={() => {}} 
                          onClick={(e) => e.stopPropagation()} 
                        />
                      </td>
                      <td style={{ fontWeight: 600 }}>{item.query}</td>
                      <td>{item.title !== item.query ? item.title : '-'}</td>
                      <td>
                        {item.artist !== '-' ? (
                          <div>
                            <div>{item.artist}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.album}</div>
                          </div>
                        ) : '-'}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.source}</td>
                      <td>
                        <span className={`badge ${statusClass}`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ paddingRight: '24px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {item.time}
                      </td>
                    </tr>
                  );
                })}
                {getLogsList().length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No log files parsed. Make sure <code>download_links.json</code> or <code>scrape_log.json</code> exist in the root of the project.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedLogs.size > 0 && (
        <div className="batch-action-bar animate-slide-up">
          <span className="batch-count">{selectedLogs.size} logs selected</span>
          <div className="batch-actions">
            <button className="btn btn-secondary danger" onClick={handleBatchDelete}>
              <Icons.Trash /> Archive Selected
            </button>
            <button className="btn btn-secondary" onClick={() => setSelectedLogs(new Set())}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
