/**
 * Which proxies may tell us the caller's address. Only machines on this host or a private network are believed,
 * so someone reaching the app port directly from outside cannot invent an X-Forwarded-For to dodge rate limits.
 */
import proxyaddr from 'proxy-addr';

const privateNetwork = proxyaddr.compile(['loopback', 'linklocal', 'uniquelocal']);

export const trustProxySetting = (value = process.env.TRUST_PROXY, production = process.env.NODE_ENV === 'production') => {
  if (value === 'false') return false;
  const parsed = parseInt(value);
  const hops = Number.isFinite(parsed) ? parsed : production ? 1 : 0;
  return hops ? (address, index) => index < hops && privateNetwork(address, index) : false;
};
