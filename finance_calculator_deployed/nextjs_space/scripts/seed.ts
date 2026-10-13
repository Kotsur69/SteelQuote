import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Local test accounts (v2.0 flow model, migrations 025-029). Every role of both seeded flows
// gets an account; Head of Projects and CEO hold a role in each flow. Memberships reference
// flows/roles by code, so this works on any database the migrations ran on.
interface SeedAccount {
  email: string;
  password: string;
  fullName: string;
  superuser?: boolean;
  /** [flowCode, roleCode] */
  memberships: [string, string][];
}

const ACCOUNTS: SeedAccount[] = [
  // Legacy accounts, mapped as the backfill (029) maps junior/senior/admin.
  { email: 'example@gmail.com', password: '1234', fullName: 'Admin User', superuser: true, memberships: [] },
  { email: 'john@doe.com', password: 'johndoe123', fullName: 'John Doe', memberships: [['FLOW1', 'IFO']] },
  { email: 'starszy@email.com', password: '1234', fullName: 'Jane Doe', memberships: [['FLOW1', 'ASM']] },
  { email: 'mlodszy@email.com', password: '1234', fullName: 'Jack Doe', memberships: [['FLOW1', 'IFO']] },
  // One account per role.
  { email: 'ifo.f1@steelquote.test', password: '1234', fullName: 'Iga Front (F1 IFO)', memberships: [['FLOW1', 'IFO']] },
  { email: 'efo.f1@steelquote.test', password: '1234', fullName: 'Edek Zewnętrzny (F1 EFO)', memberships: [['FLOW1', 'EFO']] },
  { email: 'asm.f1@steelquote.test', password: '1234', fullName: 'Adam Area (F1 ASM)', memberships: [['FLOW1', 'ASM']] },
  { email: 'hoc.f1@steelquote.test', password: '1234', fullName: 'Hanna Cluster (F1 HoC)', memberships: [['FLOW1', 'HOC']] },
  { email: 'ifo.f2@steelquote.test', password: '1234', fullName: 'Ilona Projekt (F2 IFO)', memberships: [['FLOW2', 'IFO']] },
  { email: 'kam.f2@steelquote.test', password: '1234', fullName: 'Kamil Key (F2 KAM)', memberships: [['FLOW2', 'KAM']] },
  { email: 'hop@steelquote.test', password: '1234', fullName: 'Henryk Projects (HoP)', memberships: [['FLOW1', 'HOP'], ['FLOW2', 'HOP']] },
  { email: 'ceo@steelquote.test', password: '1234', fullName: 'Celina CEO', memberships: [['FLOW1', 'CEO'], ['FLOW2', 'CEO']] },
];

// Team (visibility "team" column): the Flow 1 ASM leads the Flow 1 front office.
const TEAMS: [string, string][] = [
  ['asm.f1@steelquote.test', 'ifo.f1@steelquote.test'],
  ['asm.f1@steelquote.test', 'efo.f1@steelquote.test'],
  ['starszy@email.com', 'mlodszy@email.com'],
];

async function upsertAccount(a: SeedAccount): Promise<void> {
  const hash = await bcrypt.hash(a.password, 10);
  const user = await pool.query(
    `INSERT INTO users (email, password, full_name, is_superuser, is_active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (email) DO UPDATE SET password = $2, full_name = $3, is_superuser = $4, is_active = true
     RETURNING id`,
    [a.email, hash, a.fullName, a.superuser === true]
  );
  const userId = user.rows[0].id;
  for (const [flowCode, roleCode] of a.memberships) {
    await pool.query(
      `INSERT INTO user_flow_roles (user_id, flow_id, role_id)
       SELECT $1, f.id, r.id FROM flows f JOIN roles r ON r.code = $3
       JOIN flow_roles fr ON fr.flow_id = f.id AND fr.role_id = r.id
       WHERE f.code = $2
       ON CONFLICT (user_id, flow_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [userId, flowCode, roleCode]
    );
  }
}

async function main() {
  for (const account of ACCOUNTS) await upsertAccount(account);
  for (const [leader, member] of TEAMS) {
    await pool.query(
      `INSERT INTO team_members (senior_id, junior_id)
       SELECT l.id, m.id FROM users l, users m WHERE l.email = $1 AND m.email = $2
       ON CONFLICT DO NOTHING`,
      [leader, member]
    );
  }
  console.log(`Seed completed: ${ACCOUNTS.length} accounts`);
}

main().catch(console.error).finally(() => pool.end());
