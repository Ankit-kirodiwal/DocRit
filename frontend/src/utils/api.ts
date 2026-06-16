import axios from 'axios';

// Support VITE_API_URL environment variable for custom production API endpoints
// If VITE_API_URL is configured, baseURL uses that path.
// Otherwise, it falls back to '/api/pdf' (which is reverse-proxied by IIS web.config).
const getBaseURL = () => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) {
    const cleanUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
    return `${cleanUrl}/api/pdf`;
  }
  return '/api/pdf';
};

const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 600000, // 10 minutes timeout for large files
});

export default api;
