import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export const DEFAULT_CONTENT_SETTINGS = {
  autopilot_enabled: false,
  posts_per_week: 3,
  topics: ['level10', 'rocks', 'vto', 'people', 'process', 'traction', 'general'],
  posting_days: [2, 3, 4],
  posting_time: '08:30',
  timezone: 'America/New_York',
  guidance: '',
  voice_profile: '',
  voice_profile_updated_at: null,
  last_batch_at: null
};

export function useContentSettings(workspaceId) {
  return useQuery({
    queryKey: ['content_settings', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_CONTENT_SETTINGS, ...(data ?? {}), workspace_id: workspaceId };
    }
  });
}

export function useSaveContentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, updates }) => {
      const { data, error } = await supabase
        .from('content_settings')
        .upsert({ workspace_id: workspaceId, ...updates }, { onConflict: 'workspace_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content_settings'] })
  });
}

// ---------- Voice samples ----------

export function useVoiceSamples() {
  return useQuery({
    queryKey: ['voice_samples'],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('voice_samples')
        .select('id, source, content, posted_at', { count: 'exact' })
        .order('posted_at', { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return { samples: data, count: count ?? data.length };
    }
  });
}

/** Inserts samples, silently skipping exact duplicates (same text already saved). */
export function useAddVoiceSamples() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, samples }) => {
      let added = 0;
      for (let i = 0; i < samples.length; i += 200) {
        const rows = samples.slice(i, i + 200).map((s) => ({ ...s, workspace_id: workspaceId }));
        const { data, error } = await supabase
          .from('voice_samples')
          .upsert(rows, { onConflict: 'workspace_id,content_hash', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        added += data?.length ?? 0;
      }
      return added;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice_samples'] })
  });
}

export function useDeleteVoiceSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('voice_samples').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice_samples'] })
  });
}

// ---------- Review queue ----------

export function useReviewQueue() {
  return useQuery({
    queryKey: ['posts', 'review'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'review')
        .order('scheduled_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    }
  });
}

/** Approve → scheduled; reject → rejected (kept, with the note, to steer future batches). */
export function useReviewDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, content, scheduledAt, note }) => {
      const updates =
        decision === 'approve'
          ? { status: 'scheduled', content, scheduled_at: scheduledAt, review_note: null }
          : { status: 'rejected', review_note: note?.trim() || null };
      const { error } = await supabase.from('posts').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] })
  });
}

// ---------- Edge function calls ----------

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // supabase-js wraps non-2xx responses; surface the function's own message
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const buildVoiceProfile = () => invoke('claude-draft', { mode: 'voice' });
export const generateBatch = (count) => invoke('weekly-batch', count ? { count } : {});
