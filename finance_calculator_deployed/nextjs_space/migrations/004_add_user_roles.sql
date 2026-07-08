-- Migration: Add roles, full name and soft-delete flag to users
-- Run this manually with: psql $DATABASE_URL -f migrations/004_add_user_roles.sql
--
-- Trzy role handlowców: junior (młodszy), senior (starszy), admin.
-- Wszyscy dotychczasowi użytkownicy dostają domyślnie rolę 'junior' (backfill przez DEFAULT).
-- "Usuwanie" handlowca w panelu admina = ustawienie is_active=false (soft delete),
-- żeby nie stracić historii ofert — dlatego is_active, a nie fizyczny DELETE wiersza.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'junior'
        CHECK (role IN ('junior', 'senior', 'admin'));

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Szybszy lookup aktywnych kont po roli (panel admina, RBAC).
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- BOOTSTRAP ADMINA — brak trasy rejestracji, więc admina trzeba wskazać ręcznie.
-- Odkomentuj i podmień e-mail na docelowe konto administratora, potem uruchom ponownie:
--
-- UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
