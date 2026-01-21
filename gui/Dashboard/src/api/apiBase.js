export const getApiBaseUrl = () => {
  const raw = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_BASE_URL : '';
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value ? value.replace(/\/$/, '') : 'http://localhost:8000';
};

