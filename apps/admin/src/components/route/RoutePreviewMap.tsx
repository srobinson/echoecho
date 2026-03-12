import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import type { Building, Route } from '@echoecho/shared';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { BuildingLayer } from '../map/BuildingLayer';
import { PoiLayer } from '../map/PoiLayer';
import { RouteLayer } from '../map/RouteLayer';
import { filterLngLatPairs, hasFiniteCoordinate } from '../../lib/mapboxCoordinates';

interface Props {
  route: Route;
  buildings?: Building[];
  height: number;
  interactive?: boolean;
}

export const RoutePreviewMap = memo(function RoutePreviewMap({
  route,
  buildings = [],
  height,
  interactive = false,
}: Props) {
  const bounds = useMemo(() => computeBounds(route, buildings), [route, buildings]);
  const cameraPadding = useMemo(
    () => ({ paddingTop: 28, paddingBottom: 28, paddingLeft: 28, paddingRight: 28 }),
    [],
  );

  return (
    <View style={[styles.container, { height }]}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL="mapbox://styles/mapbox/satellite-v9"
        logoEnabled={false}
        scaleBarEnabled={false}
        compassEnabled={interactive}
        attributionEnabled={false}
        zoomEnabled={interactive}
        scrollEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
      >
        <MapboxGL.Camera
          animationDuration={0}
          bounds={{
            ne: bounds.ne,
            sw: bounds.sw,
            ...cameraPadding,
          }}
        />
        <BuildingLayer buildings={buildings} onBuildingPress={() => {}} />
        <RouteLayer routes={[route]} onRoutePress={() => {}} />
        <PoiLayer waypoints={route.waypoints} onWaypointPress={() => {}} />
        <HazardPreviewLayer route={route} />
      </MapboxGL.MapView>
    </View>
  );
});

const HAZARD_SOURCE_ID = 'route-preview-hazards';
const HAZARD_CIRCLE_LAYER_ID = 'route-preview-hazards-circle';
const HAZARD_SYMBOL_LAYER_ID = 'route-preview-hazards-symbol';

const HazardPreviewLayer = memo(function HazardPreviewLayer({ route }: { route: Route }) {
  const shape = useMemo((): FeatureCollection<Point> => ({
    type: 'FeatureCollection',
    features: (route.hazards ?? []).flatMap((hazard): Feature<Point>[] => {
      if (!hasFiniteCoordinate(hazard.coordinate)) return [];

      return [{
        type: 'Feature',
        id: hazard.id,
        properties: { id: hazard.id },
        geometry: {
          type: 'Point',
          coordinates: [hazard.coordinate.longitude, hazard.coordinate.latitude],
        },
      }];
    }),
  }), [route.hazards]);

  if ((route.hazards?.length ?? 0) === 0) {
    return null;
  }

  return (
    <MapboxGL.ShapeSource id={`${HAZARD_SOURCE_ID}-${route.id}`} shape={shape}>
      <MapboxGL.CircleLayer
        id={`${HAZARD_CIRCLE_LAYER_ID}-${route.id}`}
        style={{
          circleRadius: 7,
          circleColor: '#FFA726',
          circleStrokeColor: '#0A0A0F',
          circleStrokeWidth: 2,
          circleOpacity: 0.95,
        }}
      />
      <MapboxGL.SymbolLayer
        id={`${HAZARD_SYMBOL_LAYER_ID}-${route.id}`}
        style={{
          textField: '!',
          textSize: 11,
          textColor: '#0A0A0F',
          textAllowOverlap: true,
          textAnchor: 'center',
        }}
      />
    </MapboxGL.ShapeSource>
  );
});

function computeBounds(route: Route, buildings: Building[]) {
  const points: [number, number][] = [];

  for (const waypoint of route.waypoints) {
    if (hasFiniteCoordinate(waypoint.coordinate)) {
      points.push([waypoint.coordinate.longitude, waypoint.coordinate.latitude]);
    }
  }
  for (const hazard of route.hazards ?? []) {
    if (hasFiniteCoordinate(hazard.coordinate)) {
      points.push([hazard.coordinate.longitude, hazard.coordinate.latitude]);
    }
  }
  for (const building of buildings) {
    for (const vertex of filterLngLatPairs(building.footprint ?? [])) {
      points.push(vertex);
    }
    for (const entrance of building.entrances ?? []) {
      if (hasFiniteCoordinate(entrance.coordinate)) {
        points.push([entrance.coordinate.longitude, entrance.coordinate.latitude]);
      }
    }
  }

  if (points.length === 0) {
    return {
      ne: [0.001, 0.001] as [number, number],
      sw: [-0.001, -0.001] as [number, number],
    };
  }

  let minLng = points[0][0];
  let maxLng = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];

  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  const lngPad = Math.max((maxLng - minLng) * 0.2, 0.00035);
  const latPad = Math.max((maxLat - minLat) * 0.2, 0.00035);

  return {
    ne: [maxLng + lngPad, maxLat + latPad] as [number, number],
    sw: [minLng - lngPad, minLat - latPad] as [number, number],
  };
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#141418',
  },
});
