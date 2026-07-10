UPDATE users
SET
  password_hash = 'Z8xteN/S4FgpiUE6st/BrxMCvh63GhIV3GaZ4GHl2js=',
  password_iterations = 100000,
  updated_at = CURRENT_TIMESTAMP
WHERE email = 'admin@admin.com';
