// Local-only surface: reject non-loopback (proxied) origins and rebound Host headers.
// Browsers send Origin on state-changing same-site requests; Sec-Fetch-Site covers
// older tooling. Loopback aliases (localhost, [::1], 127.0.0.0/8) stay allowed.
const INTERNAL_PREFIX = '/api/internal/';

function createApiGuard({ internalToken } = {}) {
  const token = internalToken || process.env.SCRAPER_INTERNAL_TOKEN || '';
  return function apiGuard(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    const host = String(req.headers.host || '');
    const hostName = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    const hostAllowed = hostName === 'localhost' || hostName === '127.0.0.1' ||
      hostName === '::1' || /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(hostName);
    const origin = req.headers.origin;
    const originAllowed = !origin ||
      /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i.test(origin);
    const fetchSite = req.headers['sec-fetch-site'];
    const crossSite = fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite);
    if (!hostAllowed || !originAllowed || crossSite) {
      return res.status(403).json({ error: 'Cross-site or non-local requests are not allowed.' });
    }
    if (req.method === 'POST' && req.path.startsWith(INTERNAL_PREFIX)) {
      if (!token || req.headers.authorization !== `Bearer ${token}`) {
        return res.status(401).json({ error: 'Internal token required.' });
      }
    }
    next();
  };
}

module.exports = { createApiGuard };
