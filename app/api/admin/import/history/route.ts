import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Not implemented: CSV dry-run and commit import.' },
    { status: 501 }
  );
}
