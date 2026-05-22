import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Not implemented: create/update web push subscription.' },
    { status: 501 }
  );
}
