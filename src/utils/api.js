// API base path — must match the ProxyPass prefix configured in Apache.
// In production: Apache proxies /gas/api → http://localhost:3009/api
// In development: Vite proxy rewrites /gas/api → /api on localhost:3009
export const API_BASE = '/gas/api';
