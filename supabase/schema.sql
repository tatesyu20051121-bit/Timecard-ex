-- =============================================
-- タイムカードアプリ Supabase スキーマ
-- Supabase の SQL Editor に貼り付けて実行してください
-- =============================================

-- ① プロフィールテーブル
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name          TEXT NOT NULL,
  hourly_rate   INTEGER NOT NULL DEFAULT 1100,
  night_start   TIME NOT NULL DEFAULT '22:00:00',
  night_end     TIME NOT NULL DEFAULT '05:00:00',
  night_rate    NUMERIC(4,2) NOT NULL DEFAULT 1.25,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ② 勤務記録テーブル
CREATE TABLE time_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  clock_in              TIME,
  clock_out             TIME,
  break_start           TIME,
  break_end             TIME,
  transport_fee         INTEGER,
  transport_pattern_id  UUID,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ③ 交通費パターンテーブル
CREATE TABLE transport_patterns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  fee         INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ④ 修正履歴テーブル
CREATE TABLE edit_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  field_changed  TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- RLS（Row Level Security）設定
-- 各ユーザーが自分のデータしか見られないようにする
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_history ENABLE ROW LEVEL SECURITY;

-- profiles ポリシー
CREATE POLICY "自分のプロフィールのみ" ON profiles
  FOR ALL USING (auth.uid() = id);

-- time_records ポリシー
CREATE POLICY "自分の勤務記録のみ" ON time_records
  FOR ALL USING (auth.uid() = user_id);

-- transport_patterns ポリシー
CREATE POLICY "自分の交通費パターンのみ" ON transport_patterns
  FOR ALL USING (auth.uid() = user_id);

-- edit_history ポリシー
CREATE POLICY "自分の修正履歴のみ" ON edit_history
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- 3年以上前のデータを自動削除する関数
-- =============================================

CREATE OR REPLACE FUNCTION delete_old_records()
RETURNS void AS $$
BEGIN
  DELETE FROM time_records WHERE date < CURRENT_DATE - INTERVAL '3 years';
  DELETE FROM edit_history WHERE created_at < NOW() - INTERVAL '3 years';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- インデックス（検索を高速化）
-- =============================================

CREATE INDEX idx_time_records_user_date ON time_records(user_id, date);
CREATE INDEX idx_edit_history_user ON edit_history(user_id, created_at DESC);
