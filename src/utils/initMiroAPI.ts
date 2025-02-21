import {Miro} from '@mirohq/miro-api';
import {cookies} from 'next/headers';

const tokensCookie = 'miro_tokens';

export default function initMiroAPI(customToken?: string) {
  const cookieStore = cookies();
  const tokens = cookieStore.get(tokensCookie)?.value;
  const state = tokens ? JSON.parse(tokens) : {};

  // If a custom token is provided, use it instead of the cookie token
  const effectiveState = customToken ? {
    accessToken: customToken,
    userId: state.userId // Preserve user ID if available
  } : state;

  const miro = new Miro({
    storage: {
      get: async () => effectiveState,
      set: async (newState) => {
        // State updates should be handled through API routes
        console.log('State update requested:', newState);
      },
    },
  });

  return {
    miro,
    userId: effectiveState.userId,
  };
}
