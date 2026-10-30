import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEY_ADMIN, fetchAuthMe, loginAuth, logoutAuth } from '../services/api';

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingIn: boolean;
  isSetupComplete: boolean;
  apiKey: string | null;
  error: string | null;
  login: (key: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSetup: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSetupComplete] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetchAuthMe();
      if (res.authenticated) {
        setIsAuthenticated(true);
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
            }
          } catch {
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(false);
        }
      }
    } catch {
      setIsAuthenticated(false);
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

  const logout = async () => {
    await logoutAuth();
    setApiKey(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isLoggingIn,
        isSetupComplete,
        apiKey,
        error,
        login,
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
