export interface RegisterBody {
  email: string;
  password: string;
  name: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface RefreshBody {
  refreshToken: string;
}

// Shape of the data encoded inside a JWT access token.
// The gateway decodes this on every protected request (Day 4).
export interface TokenPayload {
  userId: string;
  name: string;
  email: string;
  role: string;
  jti: string; // unique token ID — used to blacklist the token on logout
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// User shape returned to clients — password is always omitted
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}
