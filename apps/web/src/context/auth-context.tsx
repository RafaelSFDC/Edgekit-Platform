import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEY_ADMIN, checkSetupStatus } from '../services/api';

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isSetupComplete: boolean;
  apiKey: string | null;
  login: (key: string) => void;
  logout: () => void;
  checkSetup: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkSetup = useCallback(async () => {
    try {
      const res = await checkSetupStatus();
      setIsSetupComplete(res.isSetupComplete ?? true);
    } catch {
      setIsSetupComplete(true);
    }
  }, []);

  useEffect(() => {
    const savedKey = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ADMIN) : null;
    if (savedKey) {
      setApiKey(savedKey);
      setIsAuthenticated(true);
    } else {
      // In local dev, default admin key if available in dev environment
      const devKey = (import.meta as any).env?.VITE_SERVICE_ROLE_KEY || 'hb_service_default';
      if (devKey && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ADMIN, devKey);
        setApiKey(devKey);
        setIsAuthenticated(true);
      }
    }

    checkSetup().finally(() => {
      setIsLoading(false);
    });
  }, [checkSetup]);

  const login = (key: string) => {
    const cleanKey = key.trim();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_ADMIN, cleanKey);
    }
    setApiKey(cleanKey);
    setIsAuthenticated(true);
  };

  const logout = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_ADMIN);
    }
    setApiKey(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isSetupComplete,
        apiKey,
        login,
        logout,
        checkSetup,
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
