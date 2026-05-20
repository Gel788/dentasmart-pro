export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  permissions: string[];
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
