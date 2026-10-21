import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { supabaseConfigured } from './lib/supabase';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false
    }
  }
});

function NotConfigured() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <div className="max-w-md bg-white border border-stone-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-semibold text-stone-900 tracking-tight">App isn’t connected to Supabase</h1>
        <p className="mt-2 text-sm text-stone-600">
          This build has no Supabase URL or anon key. In Vercel → Settings → Environment Variables, set{' '}
          <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> (or connect the
          Supabase integration) for Production, then redeploy.
        </p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {supabaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    ) : (
      <NotConfigured />
    )}
  </React.StrictMode>
);
