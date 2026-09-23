CREATE TABLE IF NOT EXISTS pincode_searches (
  id BIGSERIAL PRIMARY KEY,
  pincode VARCHAR(6) NOT NULL,
  result VARCHAR(30) NOT NULL,
  delivery_type VARCHAR(30),
  delivery_date VARCHAR(100),
  product_id VARCHAR(100),
  product_handle VARCHAR(255),
  variant_id VARCHAR(100),
  page_url TEXT,
  session_id VARCHAR(100),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pincode_searches_created_at
  ON pincode_searches (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pincode_searches_pincode
  ON pincode_searches (pincode);

CREATE INDEX IF NOT EXISTS idx_pincode_searches_result
  ON pincode_searches (result);