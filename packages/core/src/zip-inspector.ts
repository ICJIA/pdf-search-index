/**
 * Minimal read-only ZIP central-directory inspector. Sums the
 * uncompressed sizes of every entry in a ZIP archive without invoking
 * a full ZIP-decompression library. Used by `parseOfficeDoc` to enforce
 * the `maxInflatedArchiveBytes` cap *before* handing bytes to
 * `officeparser`, which materializes the inflated XML in memory.
 *
 * Defense against the "deflate-bomb Office document" class: a few-KB
 * input that inflates to multi-GB on extraction. The Content-Length cap
 * (`maxBytes`) bounds the compressed input; the extracted-text cap
 * (`maxExtractedTextChars`) bounds the post-extraction text. **This
 * inspector closes the window between those two caps** by failing fast
 * on archives whose declared central-directory sum exceeds the cap.
 *
 * Conservative posture: any malformed structure, ZIP64 sentinel, or
 * missing EOCD returns `null` (= "couldn't inspect"). Callers should
 * treat `null` as "skip the cap check and let the parser surface a
 * proper error" — not as "abort."
 *
 * Added in 1.2. Closes the deferral from the 2026-05-17 v1.1 audit.
 */

// ZIP signature bytes (little-endian on the wire).
const EOCD_SIG = [0x50, 0x4b, 0x05, 0x06]; // "PK\x05\x06"
const CD_ENTRY_SIG = [0x50, 0x4b, 0x01, 0x02]; // "PK\x01\x02"

// EOCD layout: 22-byte fixed header followed by up to 65535-byte
// optional comment. Total max search range from end of file: 65557 bytes.
const EOCD_FIXED_SIZE = 22;
const EOCD_MAX_COMMENT = 65535;

// CD entry layout: 46-byte fixed header followed by variable-length
// filename + extra field + comment.
const CD_ENTRY_FIXED_SIZE = 46;

// ZIP64 sentinel — uncompressed/compressed size of 0xFFFFFFFF in the
// classic 32-bit field means "see the ZIP64 extra field for the real
// value." We don't parse ZIP64 — too rare in Office documents, and an
// attacker controlling ZIP64 sizes can encode arbitrary amounts. Treat
// any ZIP64 entry as "unknown size → conservative pass-through."
const ZIP64_SENTINEL = 0xffffffff;

export interface ZipInspectionResult {
  /** Sum of uncompressed sizes across all CD entries (bytes). */
  totalUncompressedBytes: number;
  /** Number of central-directory entries enumerated. */
  entryCount: number;
}

function startsWithAt(bytes: Uint8Array, offset: number, sig: readonly number[]): boolean {
  if (offset + sig.length > bytes.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Locate the End of Central Directory record by scanning backward from
 * the buffer end. EOCD is followed only by an optional comment of up to
 * 65535 bytes; the comment may itself contain bytes that look like the
 * signature, so the canonical strategy is "first signature match while
 * scanning backward from the latest plausible position."
 */
function findEocd(bytes: Uint8Array): number {
  if (bytes.length < EOCD_FIXED_SIZE) return -1;
  const lastEocdPos = bytes.length - EOCD_FIXED_SIZE;
  const earliestPlausible = Math.max(0, lastEocdPos - EOCD_MAX_COMMENT);
  for (let i = lastEocdPos; i >= earliestPlausible; i--) {
    if (startsWithAt(bytes, i, EOCD_SIG)) {
      return i;
    }
  }
  return -1;
}

/**
 * Inspect a ZIP buffer's central directory and return the total
 * declared uncompressed size. Returns `null` on:
 *
 * - non-ZIP input (no EOCD signature found)
 * - ZIP64 archive (out of scope; conservative pass-through)
 * - malformed structure (CD offset/size out of bounds, missing entry
 *   signature, entry count mismatch, etc.)
 *
 * **Side effects:** none. Pure function over the byte buffer.
 *
 * The reported size is the **declared** central-directory uncompressed
 * size. It is NOT a guarantee — a malicious encoder could lie about the
 * uncompressed size. The cap is therefore a best-effort upfront filter,
 * not a hard guarantee. Defense-in-depth: the existing
 * `maxExtractedTextChars` cap (after extraction) is the second line.
 */
export function inspectZipUncompressedSize(bytes: Uint8Array): ZipInspectionResult | null {
  const eocdOffset = findEocd(bytes);
  if (eocdOffset === -1) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // EOCD field offsets (little-endian):
  //   +10 (u16) total CD entries
  //   +12 (u32) CD size
  //   +16 (u32) CD offset
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  // ZIP64 sentinel: caller using ZIP64 — out of scope.
  if (cdOffset === ZIP64_SENTINEL || cdSize === ZIP64_SENTINEL) return null;
  if (totalEntries === 0xffff) return null; // ZIP64 entry-count sentinel

  // Bounds check: CD must fit inside the buffer.
  if (cdOffset + cdSize > bytes.length) return null;
  if (cdOffset >= bytes.length) return null;

  let total = 0;
  let count = 0;
  let offset = cdOffset;
  const cdEnd = cdOffset + cdSize;

  while (offset < cdEnd && count < totalEntries) {
    // Each entry begins with the CD entry signature; if not, the CD is
    // malformed.
    if (offset + CD_ENTRY_FIXED_SIZE > bytes.length) return null;
    if (!startsWithAt(bytes, offset, CD_ENTRY_SIG)) return null;

    // CD entry field offsets (little-endian):
    //   +24 (u32) uncompressed size
    //   +28 (u16) filename length
    //   +30 (u16) extra-field length
    //   +32 (u16) comment length
    const uncompSize = view.getUint32(offset + 24, true);
    const filenameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);

    // Any ZIP64 entry → conservative pass-through (we don't decode the
    // ZIP64 extra field).
    if (uncompSize === ZIP64_SENTINEL) return null;

    total += uncompSize;
    // Guard against arithmetic overflow on adversarial input. JS numbers
    // are 64-bit doubles so this is purely defensive; cap our sum at
    // Number.MAX_SAFE_INTEGER to keep callers' comparison sane.
    if (total < 0 || !Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
      return null;
    }

    count++;
    offset += CD_ENTRY_FIXED_SIZE + filenameLen + extraLen + commentLen;
  }

  // Entry count must match the EOCD claim exactly. A mismatch means the
  // CD is internally inconsistent — bail.
  if (count !== totalEntries) return null;

  return { totalUncompressedBytes: total, entryCount: count };
}
