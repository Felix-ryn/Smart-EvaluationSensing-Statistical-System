import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiClient } from "../api/client";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "JUKIR" | "USER";
  status: "ACTIVE" | "BLOCKED";
  areaId?: string;
  area?: {
    name: string;
    location: string;
    vehicleType: string;
  };
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    const checkAuth = async () => {
      try {
        const userData = localStorage.getItem("user");
        const tokenData = localStorage.getItem("token");
        
        if (userData && tokenData) {
          const parsed = JSON.parse(userData);
          setUser(parsed);
        }
      } catch (error) {
        console.error("Error checking auth:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await apiClient.post("/auth/login", {
        email,
        password,
      });
      
      if (response.data.success && response.data.user) {
        const userData = response.data.user;
        setUser(userData);
        localStorage.setItem("user", JSON.stringify(userData));
        localStorage.setItem("token", response.data.token);
      } else {
        throw new Error(response.data.message || "Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
