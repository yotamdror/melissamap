import { useState, type FormEvent } from 'react';

interface Props {
  onSuccess: (role: 'admin' | 'viewer') => void;
}

export default function PasswordGate({ onSuccess }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const { role } = await res.json();
        onSuccess(role);
      } else {
        setError('Incorrect password.');
        setPassword('');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="password-gate">
      <form className="password-gate__card" onSubmit={handleSubmit}>
        <div className="password-gate__collage">
          <img src="/leo/leo-2.jpg" alt="Leo the dog in a cone, very proud of it" className="password-gate__photo password-gate__photo--1" />
          <img src="/leo/leo-1.jpg" alt="Leo the dog looking distinguished" className="password-gate__photo password-gate__photo--2" />
          <img src="/leo/leo-3.jpg" alt="Leo the dog wearing crocheted goat horns and a beard" className="password-gate__photo password-gate__photo--3" />
        </div>
        <h1 className="password-gate__title">Melissa Map 🗺️</h1>
        <p className="password-gate__subtitle">built by her amazing husband, so he doesn't have to keep updating it manually</p>
        <input
          className="password-gate__input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
        />
        {error && <p className="password-gate__error">{error}</p>}
        <button
          className="password-gate__btn"
          type="submit"
          disabled={loading || !password}
        >
          {loading ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
