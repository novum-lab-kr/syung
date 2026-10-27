// 프로필 사진 JPEG 의 APP1(Exif) · APP13 · COM 떼기(web/user/photo_meta.mjs) — 사파리 · 아이폰 canvas JPEG 를 서버가 받게
import test from 'node:test';
import assert from 'node:assert/strict';
import {stripJpegMeta} from '../web/user/photo_meta.mjs';

const seg = (marker, body) => [0xFF, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
const ascii = text => [...text].map(char => char.charCodeAt(0));
const JFIF = seg(0xE0, ascii('JFIF\0\x01\x01\0\0\x01\0\x01\0\0'));
const SOF = seg(0xC0, [8, 1, 0, 1, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const SCAN = [...seg(0xDA, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3F, 0]), 1, 0xFF, 0, 2, 0xFF, 0xD0, 3, 0xFF, 0xD9];

test('사파리 JPEG 의 APP1 · APP13 · COM 을 떼고 나머지는 그대로', () => {
  const input = Uint8Array.from([0xFF, 0xD8, ...JFIF, ...seg(0xE1, ascii('Exif\0\0MM')), ...seg(0xED, ascii('Photoshop 3.0')),
    ...seg(0xFE, ascii('comment')), ...SOF, ...SCAN]);
  assert.deepEqual([...stripJpegMeta(input)], [0xFF, 0xD8, ...JFIF, ...SOF, ...SCAN]);
});

test('뗄 것이 없으면 같은 바이트 · JPEG 가 아니면 그대로', () => {
  const plain = Uint8Array.from([0xFF, 0xD8, ...JFIF, ...SOF, ...SCAN]);
  assert.deepEqual([...stripJpegMeta(plain)], [...plain]);
  const webp = Uint8Array.from(ascii('RIFF\0\0\0\0WEBP'));
  assert.equal(stripJpegMeta(webp), webp);
});
