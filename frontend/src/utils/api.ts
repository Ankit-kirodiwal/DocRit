import axios from 'axios';

// Support VITE_API_URL environment variable for production deployments (e.g. Vercel, Netlify)
// If VITE_API_URL is "https://api.docrit.com", baseURL becomes "https://api.docrit.com/api/pdf"
// Otherwise, it falls back to the dynamic hostname on port 5000.
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
