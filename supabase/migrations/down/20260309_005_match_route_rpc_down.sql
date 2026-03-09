-- Migration: 20260309_005_match_route_rpc
-- DOWN: Remove match_route RPC

REVOKE EXECUTE ON FUNCTION match_route(float, float, text, uuid, int) FROM authenticated;
DROP FUNCTION IF EXISTS match_route(float, float, text, uuid, int);
