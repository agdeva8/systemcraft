import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

const errorRate = new Rate('errors');
const cacheHitRate = new Rate('cache_hits');
const thunderingHerdSpike = new Trend('thundering_herd_latency_spike');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

// Must match init.sql: substring(md5(N::text), 1, 6) for N in 1..10000
// First 200 are "hot" cohort (all cached at same time → same TTL expiry)
const SHORT_CODES = Array.from({ length: 1000 }, (_, i) =>
  crypto.md5(String(i + 1), 'hex').substring(0, 6)
);

export const options = {
  stages: [
    { duration: '1m', target: 150 },
    { duration: '7m', target: 150 },  // thundering herd hits at ~4m mark
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    errors: ['rate<0.10'],
  },
};

export default function () {
  const isRead = Math.random() < 0.95;
  const elapsed = __ITER * 0.1;  // rough time tracker

  if (isRead) {
    const code = SHORT_CODES[Math.floor(Math.random() * SHORT_CODES.length)];
    const res = http.get(`${BASE_URL}/r/${code}`);
    const ok = check(res, { 'status ok': (r) => r.status === 200 || r.status === 404 });
    errorRate.add(!ok);

    // Track latency spikes in the thundering herd window (240-300s)
    if (elapsed > 240 && elapsed < 360) {
      thunderingHerdSpike.add(res.timings.duration);
    }

    if (res.status === 200) {
      const body = JSON.parse(res.body || '{}');
      cacheHitRate.add(body.cache === 'hit');
    }
  } else {
    const payload = JSON.stringify({ url: `https://example.com/path/${Math.random()}` });
    http.post(`${BASE_URL}/shorten`, payload, { headers: { 'Content-Type': 'application/json' } });
  }

  sleep(0.1);
}
