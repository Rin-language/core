export type UserId = string;

export interface AuthenticatedUser {
  userId: UserId;
}

/**
 * Tells who is calling. The user always comes from here, never from a request
 * parameter or body.
 */
export interface Identity {
  /** Null when the request carries no valid credentials. */
  authenticate(request: Request): Promise<AuthenticatedUser | null>;
}
