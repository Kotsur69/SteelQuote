-- Migration: dosynchronizuj kontakty główne dopisane/zmienione w panelu Klienci
-- po migracji 010, zanim app/api/admin/clients zaczął je automatycznie
-- synchronizować do client_contacts (patrz lib/clientDirectory.ts:syncPrimaryContact).
-- Run: psql $DATABASE_URL -f migrations/012_resync_client_contacts.sql
--
-- Kontekst: migracja 010 zrobiła JEDNORAZOWY backfill z kolumn clients.first_name/
-- last_name/phone/email do client_contacts. Każdy klient dodany albo edytowany w
-- panelu admina "Klienci" PO tamtej migracji, a PRZED wdrożeniem tej poprawki, ma
-- więc dane osoby w `clients`, ale nie ma odpowiadającego wiersza w client_contacts
-- — stąd nie widać go w zakładce "Kontakty". Ten skrypt to dokłada.
--
-- Idempotentna: identyczny wzorzec jak backfill w 010 (ON CONFLICT DO NOTHING na tym
-- samym unikalnym indeksie client_id + imię + nazwisko), bezpieczna przy wielokrotnym
-- uruchomieniu i nie dubluje osób, które już mają wiersz w client_contacts.

BEGIN;

INSERT INTO client_contacts (client_id, first_name, last_name, phone, email, created_by, created_at, updated_at)
SELECT c.id,
       NULLIF(TRIM(c.first_name), ''),
       NULLIF(TRIM(c.last_name),  ''),
       NULLIF(TRIM(c.phone),      ''),
       NULLIF(TRIM(c.email),      ''),
       c.created_by,
       c.created_at,
       c.updated_at
FROM clients c
WHERE NULLIF(TRIM(c.first_name), '') IS NOT NULL
   OR NULLIF(TRIM(c.last_name),  '') IS NOT NULL
ON CONFLICT DO NOTHING;

\echo '== Firmy z kontaktem w clients, ale bez wiersza w client_contacts (spodziewane: 0) =='
SELECT COUNT(*) AS missed
FROM clients c
WHERE (NULLIF(TRIM(c.first_name), '') IS NOT NULL OR NULLIF(TRIM(c.last_name), '') IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.client_id = c.id);

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
