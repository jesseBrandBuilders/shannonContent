import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startOfWeek } from 'date-fns';
import { supabase } from '../lib/supabase';

/** The signed-in user's workspace (first membership). Needed for client-side inserts. */
export function useWorkspace() {
  return useQuery({
    queryKey: ['workspace'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    }
  });
}

export function useLeads({ status } = {}) {
  return useQuery({
    queryKey: ['leads', status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('*')
        .order('fit_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000);
      if (status && status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }
  });
}

export function useLeadCounts() {
  return useQuery({
    queryKey: ['leads', 'counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('status');
      if (error) throw error;
      return data.reduce((acc, { status }) => ({ ...acc, [status]: (acc[status] || 0) + 1 }), {});
    }
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] })
  });
}

const IMPORT_CHUNK = 500;

/** Upserts mapped rows (see supabase/functions/_shared/leadFields.js). Existing leads keep their status. */
export function useImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, workspaceId, onProgress }) => {
      let done = 0;
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
        const chunk = rows
          .slice(i, i + IMPORT_CHUNK)
          .map((r) => ({ ...r, workspace_id: workspaceId, source: 'csv' }));
        const { error } = await supabase
          .from('leads')
          .upsert(chunk, { onConflict: 'workspace_id,linkedin_url' });
        if (error) throw error;
        done += chunk.length;
        onProgress?.(done);
      }
      return done;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] })
  });
}

// ---------- Outreach ----------

export function useLeadOutreach(leadId) {
  return useQuery({
    queryKey: ['outreach', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_outreach')
        .select('*, posts(id, content)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });
}

/** Sent counts this week (Mon start) — LinkedIn throttles invites at roughly 100/week. */
export function useOutreachPacing() {
  return useQuery({
    queryKey: ['outreach', 'pacing'],
    queryFn: async () => {
      const since = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
      const { data, error } = await supabase
        .from('lead_outreach')
        .select('kind')
        .eq('status', 'sent')
        .gte('sent_at', since);
      if (error) throw error;
      return data.reduce((acc, { kind }) => ({ ...acc, [kind]: (acc[kind] || 0) + 1 }), {});
    }
  });
}

export function useLogOutreach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row) => {
      const { data, error } = await supabase.from('lead_outreach').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['outreach'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      return data;
    }
  });
}

// ---------- Sources (AudienceLab webhooks) ----------

export function useLeadSources() {
  return useQuery({
    queryKey: ['lead_sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_sources')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    }
  });
}

export function useCreateLeadSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, workspaceId }) => {
      const { data, error } = await supabase
        .from('lead_sources')
        .insert({ name, workspace_id: workspaceId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead_sources'] })
  });
}

export function webhookUrlFor(source) {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
  return `${base}/functions/v1/audiencelab-webhook?token=${source.webhook_token}`;
}
