import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

const errorRate = new Rate('errors');
const dbWaitTime = new Trend('db_wait_time');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

// Must match init.sql: substring(md5(N::text), 1, 6) for N in 1..10000
const SHORT_CODES = Array.from({ length: 1000 }, (_, i) =>
  crypto.md5(String(i + 1), 'hex').substring(0, 6)
);

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '8m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.02'],
  },
};

export default function () {
  const isRead = Math.random() < 0.9;

  if (isRead) {
    const code = SHORT_CODES[Math.floor(Math.random() * SHORT_CODES.length)];
    const res = http.get(`${BASE_URL}/r/${code}`);
    const ok = check(res, {
      'status 200 or 404': (r) => r.status === 200 || r.status === 404,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });
    errorRate.add(!ok);
    if (res.headers['X-Db-Wait-Ms']) {
      dbWaitTime.add(parseFloat(res.headers['X-Db-Wait-Ms']));
    }
  } else {
    const payload = JSON.stringify({ url: `https://example.com/path/${Math.random()}` });
    const res = http.post(`${BASE_URL}/shorten`, payload, { headers: { 'Content-Type': 'application/json' } });
    const ok = check(res, { 'status 200': (r) => r.status === 200 });
    errorRate.add(!ok);
  }

  sleep(0.1);
}
