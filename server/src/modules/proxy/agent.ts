import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyConfig } from './types';

export function buildAgent(proxy?: ProxyConfig) {
  if (!proxy) return undefined;
  const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : '';
  const url = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
  if (proxy.type === 'http') return new HttpProxyAgent(url);
  if (proxy.type === 'https') return new HttpsProxyAgent(url);
  return new SocksProxyAgent(url);
} 