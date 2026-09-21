import {
  AuditEventFields,
  AuditSerializer,
  getAuditSerializer,
} from './audit-canonical.util';

/**
 * COPIED KIT — see audit-hash.util.ts. Generic chain verifier, portable across
 * services. Derived from securechain-vault's audit-chain.ts.
 *
 * A stored audit row as far as chain verification is concerned: the canonical
 * event fields plus the three persisted hashes and versioning metadata.
 */
export type ChainRow = AuditEventFields & {
  prevHash: string | null;
  eventHash: string;
  chainHash: string;
  schemaVersion: number;
  hashAlg: string;
};

export type SerializerResolver = (version: number) => AuditSerializer | null;

export type ChainBreakReason =
  | 'BAD_GENESIS'
  | 'SEQ_GAP'
  | 'PREV_HASH_MISMATCH'
  | 'UNKNOWN_SCHEMA_VERSION'
  | 'HASH_ALG_MISMATCH'
  | 'EVENT_HASH_MISMATCH'
  | 'CHAIN_HASH_MISMATCH';

export type ChainBreak = { seq: string; reason: ChainBreakReason; detail: string };

export type ChainVerifyStatus = 'VALID' | 'BROKEN' | 'EMPTY';

export type ChainVerifyResult = {
  scope: string;
  status: ChainVerifyStatus;
  checked: number;
  headSeq: string | null;
  headHash: string | null;
  firstBreak: ChainBreak | null;
};

type ChainState = {
  checked: number;
  prevChainHash: string | null;
  headSeq: string | null;
  expectedSeq: bigint;
};

export function initialChainState(): ChainState {
  return { checked: 0, prevChainHash: null, headSeq: null, expectedSeq: 1n };
}

export type StepResult = { state: ChainState; firstBreak: ChainBreak | null };

function fail(
  state: ChainState,
  seq: string,
  reason: ChainBreakReason,
  detail: string,
): StepResult {
  return { state, firstBreak: { seq, reason, detail } };
}

/**
 * Verify a single row against the running state. Rows MUST arrive in ascending
 * seq order. Cannot detect deletion of the newest suffix — that needs an
 * external anchored checkpoint of {scope, seq, headHash}.
 */
export function stepChain(
  state: ChainState,
  row: ChainRow,
  resolve: SerializerResolver = getAuditSerializer,
): StepResult {
  const isGenesis = state.checked === 0;

  if (isGenesis) {
    if (row.seq !== '1' || row.prevHash !== null) {
      return fail(
        state,
        row.seq,
        'BAD_GENESIS',
        `first row of scope must have seq=1 and prevHash=null; got seq=${row.seq}, prevHash=${row.prevHash ?? 'null'}`,
      );
    }
  } else {
    if (row.seq !== state.expectedSeq.toString()) {
      return fail(
        state,
        row.seq,
        'SEQ_GAP',
        `expected seq=${state.expectedSeq.toString()}, got seq=${row.seq}`,
      );
    }
    if (row.prevHash !== state.prevChainHash) {
      return fail(
        state,
        row.seq,
        'PREV_HASH_MISMATCH',
        `prevHash does not match the previous row's chainHash`,
      );
    }
  }

  const serializer = resolve(row.schemaVersion);
  if (!serializer) {
    return fail(
      state,
      row.seq,
      'UNKNOWN_SCHEMA_VERSION',
      `no serializer registered for schema version ${row.schemaVersion}`,
    );
  }
  if (serializer.hashAlg !== row.hashAlg) {
    return fail(
      state,
      row.seq,
      'HASH_ALG_MISMATCH',
      `stored hashAlg '${row.hashAlg}' does not match version ${row.schemaVersion} serializer hashAlg '${serializer.hashAlg}'`,
    );
  }

  const eventHash = serializer.computeEventHash(row);
  if (eventHash !== row.eventHash) {
    return fail(
      state,
      row.seq,
      'EVENT_HASH_MISMATCH',
      `row contents were altered: recomputed eventHash differs from stored`,
    );
  }

  const chainHash = serializer.computeChainHash(row.prevHash, eventHash);
  if (chainHash !== row.chainHash) {
    return fail(
      state,
      row.seq,
      'CHAIN_HASH_MISMATCH',
      `stored chainHash is inconsistent with prevHash|eventHash`,
    );
  }

  return {
    state: {
      checked: state.checked + 1,
      prevChainHash: row.chainHash,
      headSeq: row.seq,
      expectedSeq: BigInt(row.seq) + 1n,
    },
    firstBreak: null,
  };
}

/** Verify an in-memory array of rows (ascending seq) for one scope. */
export function verifyRows(
  scope: string,
  rows: ChainRow[],
  resolve: SerializerResolver = getAuditSerializer,
): ChainVerifyResult {
  if (rows.length === 0) {
    return { scope, status: 'EMPTY', checked: 0, headSeq: null, headHash: null, firstBreak: null };
  }

  let state = initialChainState();
  for (const row of rows) {
    const result = stepChain(state, row, resolve);
    if (result.firstBreak) {
      return {
        scope,
        status: 'BROKEN',
        checked: state.checked,
        headSeq: state.headSeq,
        headHash: state.prevChainHash,
        firstBreak: result.firstBreak,
      };
    }
    state = result.state;
  }

  return {
    scope,
    status: 'VALID',
    checked: state.checked,
    headSeq: state.headSeq,
    headHash: state.prevChainHash,
    firstBreak: null,
  };
}
