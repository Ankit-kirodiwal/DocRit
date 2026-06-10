import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api/pdf',
  timeout: 600000, // 10 minutes timeout for large files
});

export default api;
