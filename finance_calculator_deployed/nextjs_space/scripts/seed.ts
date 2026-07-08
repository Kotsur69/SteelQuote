import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const hash1 = await bcrypt.hash('1234', 10);
  await pool.query(
    `INSERT INTO users (email, password, role, full_name, is_active)
     VALUES ($1, $2, 'admin', 'Admin User', true)
     ON CONFLICT (email) DO UPDATE SET password=$2, role='admin', full_name='Admin User', is_active=true`,
    ['example@gmail.com', hash1]
  );

  const hash2 = await bcrypt.hash('johndoe123', 10);
  await pool.query(
    `INSERT INTO users (email, password, role, full_name, is_active)
     VALUES ($1, $2, 'junior', 'John Doe', true)
     ON CONFLICT (email) DO UPDATE SET password=$2, role='junior', full_name='John Doe', is_active=true`,
    ['john@doe.com', hash2]
  );

  const hash3 = await bcrypt.hash('1234', 10);
  await pool.query(
    `INSERT INTO users (email, password, role, full_name, is_active)
     VALUES ($1, $2, 'senior', 'Starszy Użytkownik', true)
     ON CONFLICT (email) DO UPDATE SET password=$2, role='senior', full_name='Starszy Użytkownik', is_active=true`,
    ['starszy@email.com', hash3]
  );

  const hash4 = await bcrypt.hash('1234', 10);
  await pool.query(
    `INSERT INTO users (email, password, role, full_name, is_active)
     VALUES ($1, $2, 'junior', 'Młodszy Użytkownik', true)
     ON CONFLICT (email) DO UPDATE SET password=$2, role='junior', full_name='Młodszy Użytkownik', is_active=true`,
    ['mlodszy@email.com', hash4]
  );

  console.log('Seed completed');
}

main().catch(console.error).finally(() => pool.end());
