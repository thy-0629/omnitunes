import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string;
  setToken: (token: string) => void;
}

/**
 * Bearer token, persisted to localStorage. Dev backends with the default
 * AUTH_TOKEN skip auth entirely, so an empty token is fine there.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: '',
      setToken: (token) => set({ token }),
    }),
    { name: 'omnitunes-auth' },
  ),
);
