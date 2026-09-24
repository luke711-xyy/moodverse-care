-- Removes only the synthetic sample owners; related sample planets, histories,
-- doodles, billboards, and care cards are removed by the schema's foreign keys.
DELETE FROM users WHERE id IN (
  'mv-demo-account-01', 'mv-demo-account-02', 'mv-demo-account-03', 'mv-demo-account-04',
  'mv-demo-account-05', 'mv-demo-account-06', 'mv-demo-account-07', 'mv-demo-account-08',
  'mv-demo-account-09', 'mv-demo-account-10'
);
