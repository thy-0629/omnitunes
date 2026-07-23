export interface HealthResponse {
  status: 'ok';
  uptime: number;
  version: string;
  env: string;
  timestamp: string;
}
