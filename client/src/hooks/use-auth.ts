import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { useLocation } from "wouter";

type UserWithoutPassword = Omit<User, "passwordHash">;

async function fetchUser(): Promise<UserWithoutPassword | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logoutRequest(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to log out");
  }
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  title?: string;
  position?: string;
  municipality?: string;
}

async function loginRequest(credentials: LoginCredentials): Promise<UserWithoutPassword> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    const msg = [error.message, error.hint, error.detail].filter(Boolean).join(" ");
    throw new Error(msg || "Login failed");
  }

  return response.json();
}

async function registerRequest(credentials: RegisterCredentials): Promise<UserWithoutPassword> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    const msg = [error.message, error.hint, error.detail].filter(Boolean).join(" ");
    throw new Error(msg || "Registration failed");
  }

  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: user, isLoading } = useQuery<UserWithoutPassword | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      setLocation("/");
    },
  });

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/user"], data);
      setLocation("/dashboard");
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/user"], data);
      setLocation("/dashboard");
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    login: loginMutation.mutate,
    loginError: loginMutation.error?.message,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutate,
    registerError: registerMutation.error?.message,
    isRegistering: registerMutation.isPending,
  };
}
