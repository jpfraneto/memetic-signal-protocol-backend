// Status enum mapped to numbers to match Ponder indexer schema
export enum SignalStatus {
  ACTIVE = 0,
  WON = 1,
  LOST = 2,
}

// Direction type to match Ponder boolean schema
export type SignalDirection = boolean; // false = DOWN, true = UP
