import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  STORAGE_KEY_ADMIN,
  fetchAuthMe,
  loginAuth,
  loginAdminCredentials,
  logoutAuth,
  checkSetupStatus,
} from '../services/api';
import type { AdminUser } from '../types';

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingIn: boolean;
  isSetupComplete: boolean;
  admin: AdminUser | null;
  apiKey: string | null;
  error: string | null;
  login: (key: string) => Promise<boolean>;
  loginWithCredentials: (credentials: { email: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSetup: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      // 1. Verifica status do setup da plataforma
      try {
        const setup = await checkSetupStatus();
        setIsSetupComplete(setup.isSetupComplete);
      } catch {
        // Se falhar a verificação de setup, assume completo por segurança
        setIsSetupComplete(true);
      }

      // 2. Verifica se já existe sessão válida (via cookie HttpOnly ou apikey)
      const res = await fetchAuthMe();
      if (res.authenticated) {
        setIsAuthenticated(true);
        if (res.data?.admin) {
          setAdmin(res.data.admin);
        }
      } else {
        // Fallback: se há chave no localStorage, tenta auto-login
        const savedKey =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem(STORAGE_KEY_ADMIN)
            : null;

        if (savedKey) {
          try {
            const loginRes = await loginAuth(savedKey);
            if (loginRes.authenticated) {
              setApiKey(savedKey);
              setIsAuthenticated(true);
            } else {
              setIsAuthenticated(false);
              setAdmin(null);
            }
          } catch {
            setIsAuthenticated(false);
            setAdmin(null);
          }
        } else {
          setIsAuthenticated(false);
          setAdmin(null);
        }
      }
    } catch {
      setIsAuthenticated(false);
      setAdmin(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (key: string): Promise<boolean> => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const res = await loginAuth(key);
      if (res.authenticated) {
        setApiKey(key.trim());
        setIsAuthenticated(true);
        return true;
      }
      setError('Chave de acesso inválida.');
      return false;
    } catch (err: any) {
      const msg = err.message || 'Falha ao autenticar com a chave informada.';
      setError(msg);
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const loginWithCredentials = async (credentials: {
    email: string;
    password: string;
  }): Promise<boolean> => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const res = await loginAdminCredentials(credentials);
      if (res.authenticated) {
        setIsAuthenticated(true);
        if (res.admin) {
          setAdmin(res.admin);
        }
        return true;
      }
      setError('Credenciais de administrador inválidas.');
      return false;
    } catch (err: any) {
      const msg = err.message || 'Falha ao autenticar com as credenciais informadas.';
      setError(msg);
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    await logoutAuth();
    setApiKey(null);
    setAdmin(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isLoggingIn,
        isSetupComplete,
        admin,
        apiKey,
        error,
        login,
        loginWithCredentials,
        logout,
        checkSetup: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
