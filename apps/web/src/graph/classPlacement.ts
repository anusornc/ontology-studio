import type { Ontology, Position } from "@onto/core";

const GRID_ORIGIN_X = 80;
const GRID_ORIGIN_Y = 80;
const GRID_COLUMNS = 3;
const GRID_COLUMN_WIDTH = 280;
const GRID_ROW_HEIGHT = 200;

/**
 * Deterministic grid slot for a newly created class:
 * `x = 80 + (index % 3) * 280`, `y = 80 + floor(index / 3) * 200`.
 * Using the existing class count guarantees new nodes never stack exactly.
 */
export function nextClassPosition(ontology: Ontology): Position {
  const index = ontology.classes.length;
  return {
    x: GRID_ORIGIN_X + (index % GRID_COLUMNS) * GRID_COLUMN_WIDTH,
    y: GRID_ORIGIN_Y + Math.floor(index / GRID_COLUMNS) * GRID_ROW_HEIGHT
  };
}
