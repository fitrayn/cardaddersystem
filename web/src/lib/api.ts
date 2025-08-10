// API configuration for connecting to the server
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const apiConfig = {
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
  },
};

// API endpoints
export const API_ENDPOINTS = {
  // Auth endpoints
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  LOGOUT: '/auth/logout',
  
  // Card management endpoints
  CARDS: '/cards',
  ADD_CARD: '/cards/add',
  DELETE_CARD: '/cards/delete',
  UPDATE_CARD: '/cards/update',
  
  // User management endpoints
  USERS: '/users',
  USER_PROFILE: '/users/profile',
  
  // System status
  HEALTH: '/health',
  STATUS: '/status',
  
  // Stats endpoints
  STATS_SUMMARY: '/api/stats/summary',
  STATS_TOP_COUNTRIES: '/api/stats/top-countries',
  STATS_COMMON_ERRORS: '/api/stats/common-errors',
} as const;

// API client class
export class ApiClient {
  private baseURL: string;
  private headers: Record<string, string>;

  constructor() {
    this.baseURL = API_BASE_URL;
    this.headers = {
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const headers: Record<string, string> = {
      ...this.headers,
      ...(options.headers as Record<string, string> || {}),
    };

    // Only set JSON content-type when we have a string body (not FormData)
    const hasBody = options.body !== undefined && options.body !== null;
    const isFormData = typeof FormData !== 'undefined' && hasBody && options.body instanceof FormData;
    if (!hasBody || isFormData) {
      delete headers['Content-Type'];
    } else if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const config: RequestInit = {
      headers,
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        let details: any = null;
        try { details = await response.json(); } catch {}
        const msg = `HTTP error! status: ${response.status}` + (details ? ` - ${JSON.stringify(details)}` : '');
        throw new Error(msg);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // GET request
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  // POST request
  async post<T>(endpoint: string, data?: any): Promise<T> {
    const body = data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined);
    return this.request<T>(endpoint, {
      method: 'POST',
      body,
    });
  }

  // PUT request
  async put<T>(endpoint: string, data?: any): Promise<T> {
    const body = data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined);
    return this.request<T>(endpoint, {
      method: 'PUT',
      body,
    });
  }

  // PATCH request
  async patch<T>(endpoint: string, data?: any): Promise<T> {
    const body = data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined);
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body,
    });
  }

  // DELETE request
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Set authorization header
  setAuthToken(token: string) {
    this.headers['Authorization'] = `Bearer ${token}`;
  }

  // Clear authorization header
  clearAuthToken() {
    delete this.headers['Authorization'];
  }
}

// Create a singleton instance
export const apiClient = new ApiClient(); 