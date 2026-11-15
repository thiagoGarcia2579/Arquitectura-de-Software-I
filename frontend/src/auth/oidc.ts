import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

export { ErrorResponse } from 'oidc-client-ts';

const AUTHORITY = (import.meta.env.VITE_OIDC_AUTHORITY as string | undefined) ?? 'http://localhost:8180/realms/inspecciones';
const CLIENT_ID = (import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined) ?? 'inspecciones-web';

// Cliente PÚBLICO: Authorization Code + PKCE (no hay secreto en el navegador).
export const userManager = new UserManager({
  authority: AUTHORITY,
  client_id: CLIENT_ID,
  redirect_uri: `${window.location.origin}/login/callback`,
  post_logout_redirect_uri: `${window.location.origin}/login`,
  response_type: 'code',
  scope: 'openid profile',
  userStore: new WebStorageStateStore({ store: window.localStorage }),   // sobrevive al cierre de la pestaña
  automaticSilentRenew: false,   // la renovación la maneja http.ts (single-flight + lock entre pestañas)
  loadUserInfo: false,           // los claims ya vienen en el access token
  monitorSession: false,
});