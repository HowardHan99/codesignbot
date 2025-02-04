'use client';

export async function getMiroAuth() {
  try {
    const response = await fetch('/api/miro/auth');
    if (!response.ok) {
      throw new Error('Failed to fetch Miro auth status');
    }
    return await response.json();
  } catch (error) {
    console.error('Error getting Miro auth:', error);
    return { isAuthorized: false };
  }
} 