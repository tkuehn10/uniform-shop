import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SHOP_NAME, LOGIN_EMAIL_DOMAIN } from '../lib/config';

// Staff log in with a plain username, not an email address. Supabase Auth
// itself only knows about emails, so Admin provisions each account with a
// synthetic `<username>@LOGIN_EMAIL_DOMAIN` address (docs/screens-and-flows.md
// section 4) and this screen appends the same domain to whatever's typed
// here before calling signInWithPassword -- the username/domain split never
// needs to be a real, deliverable email address.
export function LoginPage() {
  const { signInWithPassword, session } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Once sign-in succeeds, AuthContext's session state updates asynchronously
  // (via supabase.auth.onAuthStateChange) — nothing else on this page redirects
  // away from /login, so without this the form just sits there looking like
  // nothing happened even though auth actually succeeded.
  useEffect(() => {
    if (session) {
      navigate('/stock', { replace: true });
    }
  }, [session, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    const { error } = await signInWithPassword(`${trimmed}@${LOGIN_EMAIL_DOMAIN}`, password);
    setSubmitting(false);
    if (error) setError(error);
  }

  return (
    <div className='centered-page'>
      <form className='card' onSubmit={handleSubmit}>
        <h1>{SHOP_NAME}</h1>
        <p className='muted'>Stock management system.</p>
        <label>
          Username
          <input
            type='text'
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoComplete='username'
            autoCapitalize='none'
            spellCheck={false}
          />
        </label>
        <label>
          Password
          <input
            type='password'
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete='current-password'
          />
        </label>
        {error && <p className='error'>{error}</p>}
        <button type='submit' disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
