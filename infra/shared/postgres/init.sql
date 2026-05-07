CREATE TABLE urls (
    id BIGSERIAL PRIMARY KEY,
    short_code VARCHAR(8) UNIQUE NOT NULL,
    long_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    click_count BIGINT DEFAULT 0
);

CREATE UNIQUE INDEX idx_urls_short_code ON urls (short_code);
CREATE INDEX idx_urls_click_count ON urls (click_count DESC);

INSERT INTO urls (short_code, long_url)
SELECT
    substring(md5(generate_series::text), 1, 6) AS short_code,
    'https://example.com/path/' || generate_series AS long_url
FROM generate_series(1, 10000)
ON CONFLICT (short_code) DO NOTHING;

ANALYZE urls;
