/**
 * Temporary Pages API
 * Retrieves Facebook pages stored in cookies from OAuth callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const pagesData = cookieStore.get('fb_pages_temp');
    
    if (!pagesData) {
      return NextResponse.json(
        { error: 'No pages data found. Please restart the connection process.' },
        { status: 404 }
      );
    }
    
    const pages = JSON.parse(pagesData.value);
    
    return NextResponse.json({ pages });
    
  } catch (error) {
    console.error('❌ Error retrieving temp pages:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve pages data' },
      { status: 500 }
    );
  }
}
