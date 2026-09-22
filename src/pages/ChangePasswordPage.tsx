import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';

// REQ-38 (screens-and-flows.md 2.18): the signed-in staff member changes their
// own password. Deliberately absent from the nav -- reached by typing
// /change-password -- so a shared shop device doesn't advertise it.
export function ChangePasswordPage() {
  const { session, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The part before the synthetic @-domain is the username staff type at login.
  const username = session?.user.email?.split('@')[0];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('The new password must be different from the current one.');
      return;
    }

    setSubmitting(true);
    const { error } = await changePassword(currentPassword, newPassword);
    setSubmitting(false);

    if (error) {
      setError(error);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSuccess(true);
  }

  return (
    <div className='page'>
      <h1>Change password</h1>
      <p className='muted'>
        Signed in as <strong>{username}</strong>. The new password applies from your next sign-in.
      </p>

      <form className='form-card' onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
        <label className='field'>
          Current password
          <input
            type='password'
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
            autoComplete='current-password'
          />
        </label>
        <label className='field'>
          New password
          <input
            type='password'
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoComplete='new-password'
          />
        </label>
        <label className='field'>
          Confirm new password
          <input
            type='password'
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete='new-password'
          />
        </label>

        {error && <p className='error'>{error}</p>}
        {success && <p className='success'>Password changed.</p>}

        <button type='submit' disabled={submitting}>
          {submitting ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
