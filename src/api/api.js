
export const BASE_URL = 'http://localhost:3001/api';

export const fetchApi = async (endpoint) => {
  const response = await fetch(`${BASE_URL}${endpoint}`);
  return response.json();
};