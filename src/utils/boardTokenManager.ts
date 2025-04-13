class BoardTokenManager {
  private static readonly STORAGE_KEY = 'miro_board_tokens';

  static saveToken(boardId: string, token: string): void {
    const tokens = this.getTokens();
    tokens.set(boardId, token);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(tokens.entries())));
  }

  static getToken(boardId: string): string | undefined {
    return this.getTokens().get(boardId);
  }

  static getAllTokens(): Map<string, string> {
    return this.getTokens();
  }

  private static getTokens(): Map<string, string> {
    try {
      const storedTokens = localStorage.getItem(this.STORAGE_KEY);
      if (!storedTokens) return new Map();
      return new Map(JSON.parse(storedTokens));
    } catch (error) {
      console.error('Error reading board tokens:', error);
      return new Map();
    }
  }
}

export default BoardTokenManager; 