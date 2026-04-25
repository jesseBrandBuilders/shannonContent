import { useState } from 'react';
import { Sparkles, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signInWithEmail } = useAuth();
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmail(email);
      setSent(true);
    } catch (err) {
      toast.error(err.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-stone-50 to-indigo-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20 mb-4">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tighter">
            Content Studio
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            LinkedIn content, designed for EOS leaders.
          </p>
        </div>

        <div className="bg-white border border-stone-200/80 rounded-2xl shadow-sm p-6">
          {sent ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-emerald-50 rounded-full mb-3">
                <Mail className="w-5 h-5 text-emerald-600" />
              </div>
              <h2 className="text-base font-semibold text-stone-900">Check your email</h2>
              <p className="mt-1 text-sm text-stone-500">
                We sent a magic link to <span className="font-medium text-stone-900">{email}</span>.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="shannon@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Sending…' : 'Send magic link'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-stone-400">
          No password needed — we'll email you a sign-in link.
        </p>
      </div>
    </div>
  );
}
