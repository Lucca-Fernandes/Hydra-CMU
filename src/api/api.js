
export const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/api';

export const fetchApi = async (endpoint) => {
  const response = await fetch(`${BASE_URL}${endpoint}`);
  return response.json();
};