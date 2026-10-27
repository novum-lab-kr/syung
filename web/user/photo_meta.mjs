// web/user/photo_meta.mts
function stripJpegMeta(bytes) {
	if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) return bytes;
	const parts = [bytes.subarray(0, 2)];
	let offset = 2;
	while (offset + 4 <= bytes.length && bytes[offset] === 255) {
		const marker = bytes[offset + 1];
		if (marker === 255) {
			offset += 1;
			continue;
		}
		if (marker === 218 || marker === 217) break;
		const end = offset + 2 + (bytes[offset + 2] << 8 | bytes[offset + 3]);
		if (end > bytes.length) return bytes;
		if (!(marker >= 225 && marker <= 239 || marker === 254)) parts.push(bytes.subarray(offset, end));
		offset = end;
	}
	parts.push(bytes.subarray(offset));
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}
export { stripJpegMeta };
