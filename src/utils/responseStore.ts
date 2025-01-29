interface StoredResponse {
  stickyId: string;
  content: string;
  response: string;
}

class ResponseStore {
  private static instance: ResponseStore;
  private responses: Map<string, StoredResponse>;

  private constructor() {
    this.responses = new Map();
  }

  public static getInstance(): ResponseStore {
    if (!ResponseStore.instance) {
      ResponseStore.instance = new ResponseStore();
    }
    return ResponseStore.instance;
  }

  public storeResponse(stickyId: string, content: string, response: string) {
    this.responses.set(stickyId, { stickyId, content, response });
  }

  public getStoredResponse(stickyId: string): StoredResponse | undefined {
    return this.responses.get(stickyId);
  }

  public hasContentChanged(stickyId: string, newContent: string): boolean {
    const stored = this.responses.get(stickyId);
    return !stored || stored.content !== newContent;
  }

  public getAllResponses(): StoredResponse[] {
    return Array.from(this.responses.values());
  }

  public clear() {
    this.responses.clear();
  }
}

export default ResponseStore; 