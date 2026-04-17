import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_DIALER_API_URL || 'http://localhost:5000';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000
});

let cachedToken: string | null = null;

export function setAuthToken(token: string | null) {
  cachedToken = token;
}

export function clearAuthToken() {
  cachedToken = null;
}

api.interceptors.request.use((config) => {
  const token =
    cachedToken ||
    (typeof window !== 'undefined' ? window.localStorage.getItem('dialer.token') : null);
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('dialer.token');
      window.localStorage.removeItem('dialer.user');
      window.localStorage.removeItem('dialer.voximplant');
      clearAuthToken();
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);
