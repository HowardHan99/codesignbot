import { AppData, Json } from '@mirohq/websdk-types';

interface AuthorizedAccess {
  frameId: string;
  authorizedEmails: string[];
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

type StoredAuthData = {
  [key: string]: string[];
};

/**
 * Service for managing user authentication and frame access control
 */
export class UserAuthService {
  private static readonly AUTH_METADATA_KEY = 'frame_auth';
  private static readonly AUTH_METADATA_SCOPE = 'shared';

  /**
   * Gets the current user's email
   */
  public static async getCurrentUserEmail(): Promise<string> {
    const userInfo = await miro.board.getUserInfo() as UserInfo;
    return userInfo.email;
  }

  /**
   * Checks if the current user is authorized to access a specific frame
   */
  public static async isAuthorizedForFrame(frameId: string): Promise<boolean> {
    const userEmail = await this.getCurrentUserEmail();
    const authorizedAccess = await this.getAuthorizedAccess();
    const frameAccess = authorizedAccess.find(access => access.frameId === frameId);
    
    return frameAccess ? frameAccess.authorizedEmails.includes(userEmail) : true;
  }

  /**
   * Gets all frames that the current user is authorized to access
   */
  public static async getAuthorizedFrames(): Promise<string[]> {
    const userEmail = await this.getCurrentUserEmail();
    const authorizedAccess = await this.getAuthorizedAccess();
    
    return authorizedAccess
      .filter(access => access.authorizedEmails.includes(userEmail))
      .map(access => access.frameId);
  }

  /**
   * Sets the authorization for a specific frame
   */
  public static async setFrameAuthorization(frameId: string, authorizedEmails: string[]): Promise<void> {
    const currentAccess = await this.getAuthorizedAccess();
    const existingIndex = currentAccess.findIndex(access => access.frameId === frameId);

    if (existingIndex >= 0) {
      currentAccess[existingIndex].authorizedEmails = authorizedEmails;
    } else {
      currentAccess.push({ frameId, authorizedEmails });
    }

    await this.saveAuthorizedAccess(currentAccess);
  }

  /**
   * Gets all stored access permissions
   */
  private static async getAuthorizedAccess(): Promise<AuthorizedAccess[]> {
    try {
      const appData = await miro.board.getAppData();
      const storedData = appData[this.AUTH_METADATA_KEY] as StoredAuthData | undefined;
      
      if (!storedData || typeof storedData !== 'object') {
        return [];
      }

      return Object.entries(storedData).map(([frameId, authorizedEmails]) => ({
        frameId,
        authorizedEmails
      }));
    } catch (error) {
      console.error('Error getting authorized access:', error);
      return [];
    }
  }

  /**
   * Saves access permissions to board metadata
   */
  private static async saveAuthorizedAccess(authorizedAccess: AuthorizedAccess[]): Promise<void> {
    try {
      const storedData: StoredAuthData = {};
      authorizedAccess.forEach(access => {
        storedData[access.frameId] = access.authorizedEmails;
      });

      const data = storedData as Json;
      await miro.board.setAppData(this.AUTH_METADATA_KEY, data);
    } catch (error) {
      console.error('Error saving authorized access:', error);
      throw error;
    }
  }
} 