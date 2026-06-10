import React from 'react';
import { useAppContext } from '../AppContext';

export default function DetailedLogs() {
  const {
    logs,
    fetchLogs,
    loadingLogs,
    logsFilter, setLogsFilter,
    logsSearch, setLogsSearch
  } = useAppContext();

  // Compile detailed logs list from backend data
  const getLogsList = () => {
    const list = [];

    // Add items from download_links.json (API Scraper)
    if (logs?.downloadLinks) {
      Object.entries(logs.downloadLinks).forEach(([query, info]) => {
        list.push({
          query,
          title: info.title || query,
          artist: info.artist || 'Unknown Artist',
          album: info.album || 'Unknown Album',
          duration: info.duration || '-',
          source: 'API Scraper',
          status: info.status || 'unknown',
          time: info.download_completed || info.search_time || '-',
          error: info.error || null
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
          list.push({
            query,
            title: query,
            artist: '-',
            album: '-',
            duration: '-',
            source: 'Selenium Scraper',
            status: resolvedStatus,
            time: '-',
            error: status.includes('Failed') ? status : null
          });
        }
      });
    }

    return list;
  };

  return (
    <div className="tab-content animate-fade-in">
      <div className="header-summary">
        <div>
          <h2>Execution & Scrape Logs</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Detailed report of all searched queries and their resolve status</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchLogs} disabled={loadingLogs}>
          Refresh Logs
        </button>
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
                  <th style={{ paddingLeft: '24px' }}>Query / Song Name</th>
                  <th>Resolved Match</th>
                  <th>Album / Artist</th>
                  <th>Engine</th>
                  <th>Status</th>
                  <th style={{ paddingRight: '24px', textAlign: 'right' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {getLogsList()
                  .filter(item => {
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
                  })
                  .map((item, idx) => {
                    const statusClass =
                      item.status === 'downloaded' ? 'badge-success' :
                        item.status === 'ready_to_download' ? 'badge-info' :
                          item.status === 'not_found' ? 'badge-danger' : 'badge-warning';

                    return (
                      <tr key={idx}>
                        <td style={{ paddingLeft: '24px', fontWeight: 600 }}>{item.query}</td>
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
                    <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No log files parsed. Make sure <code>download_links.json</code> or <code>scrape_log.json</code> exist in the root of the project.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
