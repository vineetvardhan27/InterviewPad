import React from "react";
import { useGoogleLogin } from "@react-oauth/google";
import axios from "axios";

/**
 * AuthScreen — Login / Register / Google Auth / Guest-continue UI.
 *
 * App.jsx owns all auth state and passes handlers down as props.
 * Google Sign-In uses @react-oauth/google (useGoogleLogin) which issues an
 * authorization code flow and exchanges for an ID token via the backend.
 * We use the implicit flow here (responseType: "token") to get a credential
 * directly, then pass it to onGoogleAuth just like the GIS credential flow.
 */
function GoogleSignInButton({ selectedRole, onGoogleAuth, setAuthError }) {
  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        // tokenResponse.access_token — exchange for user info then send to backend
        // We use the ID token flow: get userinfo from Google with access_token,
        // but our backend expects a Google ID token (credential).
        // To get an ID token we must use the credential (code) flow.
        // useGoogleLogin with flow:"auth-code" gives us an auth code to exchange server-side,
        // but our backend already accepts ID tokens from the GSI credential callback.
        // Best approach: use a custom button that triggers the Google Identity Services
        // credential popup, which gives us an ID token directly.
        // Since @react-oauth/google wraps GIS, we'll use its credential response.
        setAuthError("Google login error: unexpected response format");
      } catch (err) {
        setAuthError("Google authentication failed");
      }
    },
    onError: () => setAuthError("Google Sign-In was cancelled or failed")
  });

  return (
    <button
      type="button"
      className="google-signin-btn"
      onClick={() => login()}
    >
      <GoogleIcon />
      Continue with Google
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  );
}

/**
 * AuthScreen — Login / Register / Google Auth / Guest-continue UI.
 * App.jsx owns all auth state and passes handlers down as props.
 */
function AuthScreen({
  theme,
  authMode,
  setAuthMode,
  authError,
  setAuthError,
  authForm,
  setAuthForm,
  authLoading,
  username,
  setUsername,
  onAuth,
  onGoogleAuth,
  onGuestContinue,
}) {
  const selectedRole = authForm.role || "candidate";

  // Use Google Identity Services via script tag — gives us a real ID token (credential)
  // @react-oauth/google's GoogleOAuthProvider handles the GIS init in main.jsx
  const handleGoogleCredential = React.useCallback((credential) => {
    if (credential && onGoogleAuth) {
      onGoogleAuth(credential, selectedRole);
    }
  }, [onGoogleAuth, selectedRole]);

  React.useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) return;

    const renderGoogleBtn = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (response) => {
              if (response?.credential) {
                handleGoogleCredential(response.credential);
              }
            }
          });

          const container = document.getElementById("google-btn-slot");
          if (container) {
            container.innerHTML = "";
            window.google.accounts.id.renderButton(container, {
              theme: theme === "dark" ? "filled_black" : "outline",
              size: "large",
              width: 336,
              text: "continue_with",
              shape: "rectangular",
              logo_alignment: "left"
            });
          }
        } catch (err) {
          console.warn("[Google Auth] GIS render error:", err);
        }
      }
    };

    if (!window.google?.accounts?.id) {
      // Script may already be loaded by @react-oauth/google provider
      const existing = document.querySelector('script[src*="accounts.google.com/gsi"]');
      if (existing) {
        // Wait for it
        existing.addEventListener("load", renderGoogleBtn);
      } else {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = renderGoogleBtn;
        document.head.appendChild(script);
      }
    } else {
      renderGoogleBtn();
    }
  }, [theme, selectedRole, handleGoogleCredential]);

  if (authLoading) {
    return (
      <div className="app" data-theme={theme}>
        <div className="auth-loading">
          <div className="spinner" />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  const handleRoleChange = (newRole) => {
    setAuthForm((prev) => ({ ...prev, role: newRole }));
  };

  return (
    <div className="app" data-theme={theme}>
      <div className="auth-backdrop">
        <div className="auth-card">
          <h1 className="auth-brand">Interview Pad</h1>
          <p className="auth-subtitle">
            Real-time collaborative coding for interviews
          </p>

          {/* Role Selector */}
          <div className="auth-role-header">
            <span className="auth-role-label">Select Your Role:</span>
            <div className="auth-role-toggle">
              <button
                type="button"
                className={`auth-role-btn ${selectedRole === "candidate" ? "active" : ""}`}
                onClick={() => handleRoleChange("candidate")}
              >
                Candidate
              </button>
              <button
                type="button"
                className={`auth-role-btn ${selectedRole === "interviewer" ? "active" : ""}`}
                onClick={() => handleRoleChange("interviewer")}
              >
                Interviewer
              </button>
            </div>
          </div>

          {/* Google Sign-In */}
          <div className="google-auth-wrapper">
            {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
              <div id="google-btn-slot" className="google-btn-slot" />
            ) : (
              /* Fallback styled button if no client ID configured */
              <button
                type="button"
                className="google-fallback-btn"
                disabled
              >
                <GoogleIcon />
                Google Sign-In (configure VITE_GOOGLE_CLIENT_ID)
              </button>
            )}
          </div>

          <div className="auth-divider">
            <span>or email sign in</span>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${authMode === "login" ? "active" : ""}`}
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab ${authMode === "register" ? "active" : ""}`}
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
              }}
            >
              Register
            </button>
          </div>

          {authError && <div className="auth-error">{authError}</div>}

          <form onSubmit={onAuth} className="auth-form">
            {authMode === "register" && (
              <input
                type="text"
                placeholder="Username"
                value={authForm.username}
                onChange={(e) =>
                  setAuthForm({ ...authForm, username: e.target.value })
                }
                className="input-field"
                required
                minLength={2}
                maxLength={30}
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(e) =>
                setAuthForm({ ...authForm, email: e.target.value })
              }
              className="input-field"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authForm.password}
              onChange={(e) =>
                setAuthForm({ ...authForm, password: e.target.value })
              }
              className="input-field"
              required
              minLength={6}
            />
            <button type="submit" className="btn-primary auth-submit">
              {authMode === "register" ? `Create Account (${selectedRole})` : "Sign In"}
            </button>
          </form>

          <div className="auth-divider">
            <span>or guest mode</span>
          </div>

          <div className="guest-section">
            <input
              type="text"
              placeholder="Enter your name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              maxLength={30}
            />
            <button className="btn-secondary" onClick={onGuestContinue}>
              Continue as Guest
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
