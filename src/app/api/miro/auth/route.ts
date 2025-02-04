import { NextResponse } from 'next/server';
import initMiroAPI from '../../../../utils/initMiroAPI';

export async function GET() {
  const { miro, userId } = initMiroAPI();
  
  const isAuthorized = userId ? await miro.isAuthorized(userId) : false;
  
  return NextResponse.json({
    userId,
    isAuthorized,
    authUrl: miro.getAuthUrl(),
  });
} 