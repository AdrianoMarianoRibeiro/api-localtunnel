export interface TunnelConfig {
  port: number;
  provider: 'cloudflare' | 'localtunnel';
  cloudflaredBinary?: string;
  cloudflaredHostname?: string;
  cloudflaredToken?: string;
  cloudflaredProtocol?: 'http' | 'https';
  tunnelHost: string;
  tunnelSubdomain: string;
}

export enum TunnelStatus {
  STOPPED = 'stopped',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

export interface TunnelInfo {
  status: TunnelStatus;
  url: string | null;
  provider: 'cloudflare' | 'localtunnel';
  connectedAt: Date | null;
}

export interface TunnelProvider {
  readonly name: 'cloudflare' | 'localtunnel';
  start(): Promise<TunnelInfo>;
  stop(): Promise<void>;
  getInfo(): TunnelInfo;
}
