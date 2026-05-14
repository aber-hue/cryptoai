type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(_options?: UseAuthOptions) {
  return {
    user: null,
    loading: false,
    error: null,
    isAuthenticated: false,
    refresh: async () => null,
    logout: async () => undefined,
  };
}
