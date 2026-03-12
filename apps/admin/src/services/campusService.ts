import { supabase } from '../lib/supabase';
import type { Campus } from '@echoecho/shared';

interface CreateCampusParams {
  name: string;
  latitude: number;
  longitude: number;
  isBootstrap: boolean;
  shortName?: string;
}

export async function createCampus({
  name,
  latitude,
  longitude,
  isBootstrap,
  shortName,
}: CreateCampusParams): Promise<Campus> {
  const trimmedName = name.trim();
  const trimmedShortName = shortName?.trim() || trimmedName;

  if (!trimmedName) {
    throw new Error('Campus name is required');
  }

  let campusId: string;

  if (isBootstrap) {
    const { data, error } = await supabase.rpc('create_bootstrap_campus', {
      p_name: trimmedName,
      p_latitude: latitude,
      p_longitude: longitude,
    });

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to create campus');
    }

    campusId = data as string;
  } else {
    const { data, error } = await supabase.rpc('create_campus', {
      p_name: trimmedName,
      p_short_name: trimmedShortName,
      p_latitude: latitude,
      p_longitude: longitude,
    });

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to create campus');
    }

    campusId = data as string;
  }

  const { data: created, error: fetchErr } = await supabase
    .from('v_campuses' as 'campuses')
    .select('*')
    .eq('id', campusId)
    .single();

  if (fetchErr || !created) {
    throw new Error(fetchErr?.message ?? 'Failed to fetch created campus');
  }

  return created as unknown as Campus;
}

export async function softDeleteCampus(campusId: string) {
  const { error } = await supabase.rpc('soft_delete_campus', {
    p_campus_id: campusId,
  });

  if (error) {
    throw new Error(error.message);
  }
}
