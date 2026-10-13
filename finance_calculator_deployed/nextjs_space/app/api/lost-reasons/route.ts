import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/access/context';
import { loadLostReasons } from '@/lib/lostReasonsDb';

// GET - the lost-reason list for every signed-in user: the offers page needs the active ones
// for the picker and the archived ones to label old losses. { reasons, migrated }.
export async function GET() {
  const auth = await requireAccess();
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json(await loadLostReasons());
  } catch (error) {
    console.error('Error fetching lost reasons:', error);
    return NextResponse.json({ error: 'Failed to fetch lost reasons' }, { status: 500 });
  }
}
