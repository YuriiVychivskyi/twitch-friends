CREATE TRIGGER friendships_limit_before_insert
BEFORE INSERT ON friendships
WHEN
  (SELECT COUNT(*) FROM friendships WHERE user_a = NEW.user_a OR user_b = NEW.user_a) >= 100
  OR
  (SELECT COUNT(*) FROM friendships WHERE user_a = NEW.user_b OR user_b = NEW.user_b) >= 100
BEGIN
  SELECT RAISE(ABORT, 'friendship limit reached');
END;
