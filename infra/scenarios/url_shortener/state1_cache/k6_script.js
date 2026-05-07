import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

const errorRate = new Rate('errors');
const cacheHitRate = new Rate('cache_hits');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

// Must match init.sql: substring(md5(N::text), 1, 6) for N in 1..10000
const SHORT_CODES = Array.from({ length: 1000 }, (_, i) =>
  crypto.md5(String(i + 1), 'hex').substring(0, 6)
);

export const options = {
  stages: [
    { duration: '1m', target: 200 },
    { duration: '8m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<50'],
    errors: ['rate<0.01'],
  },
};

export default function () {
  const isRead = Math.random() < 0.95;

  if (isRead) {
    const code = SHORT_CODES[Math.floor(Math.random() * SHORT_CODES.length)];
    const res = http.get(`${BASE_URL}/r/${code}`);
    const ok = check(res, {
      'status ok': (r) => r.status === 200 || r.status === 404,
      'fast response': (r) => r.timings.duration < 50,
    });
    errorRate.add(!ok);
    if (res.status === 200) {
      const body = JSON.parse(res.body || '{}');
      cacheHitRate.add(body.cache === 'hit');
    }
  } else {
    const payload = JSON.stringify({ url: `https://example.com/path/${Math.random()}` });
    const res = http.post(`${BASE_URL}/shorten`, payload, { headers: { 'Content-Type': 'application/json' } });
    check(res, { 'status 200': (r) => r.status === 200 });
  }

  sleep(0.05);
}
