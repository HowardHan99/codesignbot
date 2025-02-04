import {Miro} from '@mirohq/miro-api';
import {cookies} from 'next/headers';

const tokensCookie = 'miro_tokens';

export default function initMiroAPI() {
  const cookieStore = cookies();
  const tokens = cookieStore.get(tokensCookie)?.value;
  const state = tokens ? JSON.parse(tokens) : {};

  const miro = new Miro({
    storage: {
      get: async () => state,
      set: async (newState) => {
        // State updates should be handled through API routes
        console.log('State update requested:', newState);
      },
    },
  });

  return {
    miro,
    userId: state.userId,
  };
}
