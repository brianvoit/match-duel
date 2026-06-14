import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { createServiceRoleClient } from '@/lib/supabase/service';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB safety cap (client resizes well below this)

export async function POST(request: NextRequest) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ ok: false, error: 'File must be an image.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'Image is too large (max 5 MB).' }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const bytes = await file.arrayBuffer();

    // Stable per-user path (overwritten on each upload) + cache-busting query param.
    const path = `${appUser.id}.jpg`;
    const { error: uploadError } = await service.storage
      .from('avatars')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) {
      return NextResponse.json({ ok: false, error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: pub } = service.storage.from('avatars').getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await service
      .from('app_user')
      .update({ avatar_url: url })
      .eq('id', appUser.id);

    if (updateError) {
      return NextResponse.json({ ok: false, error: `Failed to save avatar: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Avatar upload failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
