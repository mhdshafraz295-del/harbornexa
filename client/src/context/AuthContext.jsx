import React, { createContext, useState, useEffect, useCallback } from 'react';
import { getMe, login as apiLogin, logout as apiLogout } from '../services/authService';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check authentication status strictly via httpOnly cookie
  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMe();
      if (data && data.success && data.admin) {
        setAdmin(data.admin);
        setIsAuthenticated(true);
      } else {
        setAdmin(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      setAdmin(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loginUser = async (email, password) => {
    const data = await apiLogin(email, password);
    if (data && data.success && data.admin) {
      setAdmin(data.admin);
      setIsAuthenticated(true);
      return data.admin;
    }
    throw new Error(data?.message || 'Login failed.');
  };

  const logoutUser = async () => {
    try {
      await apiLogout();
    } catch (error) {
      console.error('Logout error:', error.message);
    } finally {
      setAdmin(null);
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        admin,
        isAuthenticated,
        loading,
        loginUser,
        logoutUser,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
