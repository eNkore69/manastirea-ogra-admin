export type AdminRole = "admin";

export interface AdminSession {
  tokenHash: string;
  csrfHash: string;
  role: AdminRole;
  expiresAt: number;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    session: AdminSession;
  };
};
