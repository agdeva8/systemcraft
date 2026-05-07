import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import crypto from 'k6/crypto';

const errorRate = new Rate('errors');
const hotKeyRequests = new Counter('hot_key_requests');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';
// Hot key is pre-seeded in Redis by app startup — must match docker-compose HOT_KEY env
const HOT_KEY = __ENV.HOT_KEY || 'viral001';

// Must match init.sql: substring(md5(N::text), 1, 6) for N in 1..10000
const REGULAR_CODES = Array.from({ length: 500 }, (_, i) =>
  crypto.md5(String(i + 2), 'hex').substring(0, 6)
);

export const options = {
  stages: [
    { duration: '1m', target: 200 },
    { duration: '8m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },
};

export default function () {
  // 80% traffic hits the single hot key
  const isHotKey = Math.random() < 0.80;

  if (isHotKey) {
    const res = http.get(`${BASE_URL}/r/${HOT_KEY}`);
    hotKeyRequests.add(1);
    const ok = check(res, { 'status ok': (r) => r.status === 200 || r.status === 404 });
    errorRate.add(!ok);
  } else {
    const code = REGULAR_CODES[Math.floor(Math.random() * REGULAR_CODES.length)];
    const res = http.get(`${BASE_URL}/r/${code}`);
    const ok = check(res, { 'status ok': (r) => r.status === 200 || r.status === 404 });
    errorRate.add(!ok);
  }

  sleep(0.05);
}
