// Frontend API configuration. Set VITE_API_URL in .env (local) or Vercel env.
// When unset, API calls go to the same origin the frontend is served from.
const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export const API_BASE_URL = raw.replace(/\/+$/, '');