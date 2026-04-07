export interface AppConfig {
  host: string;
  port: number;
  tunnelPort: number;
  tunnelSubdomain: string;
  tunnelHost: string;
  tunnelProvider: 'cloudflare' | 'localtunnel';
  cloudflaredToken?: string;
  cloudflaredHostname?: string;
  cloudflaredBinary?: string;
}
