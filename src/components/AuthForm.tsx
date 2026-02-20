import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PartyPopper } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isForgotPassword) {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setMessage('Check your email for the password reset link.');
      } else if (isSignUp) {
        await signUp(email, password, fullName);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-4 rounded-2xl">
              <PartyPopper className="w-12 h-12 text-white" />
            </div>
          </div>
          <h2 className="text-4xl font-bold text-white mb-2">PartySync</h2>
          <p className="text-neutral-400">Organize perfect parties together</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            {isForgotPassword && (
              <div>
                <label htmlFor="email-reset" className="block text-sm font-medium text-neutral-300 mb-2">
                  Email
                </label>
                <input
                  id="email-reset"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
                  placeholder="Enter your email"
                />
              </div>
            )}
            {isSignUp && !isForgotPassword && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-neutral-300 mb-2">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
                  placeholder="Enter your full name"
                />
              </div>
            )}

            {!isForgotPassword && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
                    placeholder="Enter your email"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-2">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
                    placeholder="Enter your password"
                  />
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 text-green-400 text-sm">
              {message}
            </div>
          )}

          {!message && (
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-3 px-4 rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-neutral-950 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait...' : isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          )}

          <div className="text-center space-y-2">
            {isForgotPassword ? (
              <button
                type="button"
                onClick={() => { setIsForgotPassword(false); setError(''); setMessage(''); }}
                className="text-orange-400 hover:text-orange-300 text-sm transition"
              >
                Back to Sign In
              </button>
            ) : (
              <>
                <div>
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
                    className="text-orange-400 hover:text-orange-300 text-sm transition"
                  >
                    {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                  </button>
                </div>
                {!isSignUp && (
                  <div>
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(true); setError(''); setMessage(''); }}
                      className="text-neutral-500 hover:text-neutral-400 text-sm transition"
                    >
                      Forgot your password?
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
