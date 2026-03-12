import { supabase } from '../lib/supabase';
import type { Campus } from '@echoecho/shared';
import { toClosedRing } from '../lib/mapboxCoordinates';

interface CreateCampusParams {
  name: string;
  footprint: [number, number][];
  isBootstrap: boolean;
  shortName?: string;
}

export async function createCampus({
  name,
  footprint,
  isBootstrap,
  shortName,
}: CreateCampusParams): Promise<Campus> {
  const trimmedName = name.trim();
  const trimmedShortName = shortName?.trim() || trimmedName;
  const boundaryWkt = boundaryWktFromVertices(footprint);

  if (!trimmedName) {
    throw new Error('Campus name is required');
  }

  let campusId: string;

  if (isBootstrap) {
    const { data, error } = await supabase.rpc('create_bootstrap_campus_with_bounds', {
      p_name: trimmedName,
      p_boundary_wkt: boundaryWkt,
    });

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to create campus');
    }
    campusId = data as string;
  } else {
    const { data, error } = await supabase.rpc('create_campus_with_bounds', {
      p_name: trimmedName,
      p_short_name: trimmedShortName,
      p_boundary_wkt: boundaryWkt,
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

export async function replaceCampusBoundary(campusId: string, footprint: [number, number][]) {
  const boundaryWkt = boundaryWktFromVertices(footprint);

  const { error } = await supabase.rpc('replace_campus_bounds', {
    p_campus_id: campusId,
    p_boundary_wkt: boundaryWkt,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data: updated, error: fetchErr } = await supabase
    .from('v_campuses' as 'campuses')
    .select('*')
    .eq('id', campusId)
    .single();

  if (fetchErr || !updated) {
    throw new Error(fetchErr?.message ?? 'Failed to fetch updated campus');
  }

  return updated as unknown as Campus;
}

export async function softDeleteCampus(campusId: string) {
  const { error } = await supabase.rpc('soft_delete_campus', {
    p_campus_id: campusId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

function boundaryWktFromVertices(vertices: [number, number][]): string {
  const ring = toClosedRing(vertices);
  if (!ring) {
    throw new Error('Campus boundary requires at least 3 points.');
  }

  return `SRID=4326;POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`;
}
