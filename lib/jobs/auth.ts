import { NextRequest } from 'next/server';

export function assertAdminJobRequest(request: NextRequest) {
  const configuredToken = process.env.JOB_ADMIN_TOKEN;

  if (!configuredToken) {
    return;
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (!token || token !== configuredToken) {
    throw new Error('Unauthorized admin job request.');
  }
}
