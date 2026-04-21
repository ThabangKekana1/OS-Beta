#!/usr/bin/env node
/**
 * Generate a pbkdf2 password hash for ONEOS_AUTH_PROFILES_JSON.
 *
 * Usage:
 *   node scripts/hash-password.mjs "my plaintext password"
 *
 * Output is in the format expected by lib/auth.ts:
 *   pbkdf2:<iterations>:<saltHex>:<hashHex>
 */
import { webcrypto as crypto } from "node:crypto";

const ITERATIONS = 200_000;
const KEY_LENGTH_BYTES = 32;

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs \"<password>\"");
  process.exit(1);
}

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const keyMaterial = await crypto.subtle.importKey(
  "raw",
  enc.encode(password),
  { name: "PBKDF2" },
  false,
  ["deriveBits"],
);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
  keyMaterial,
  KEY_LENGTH_BYTES * 8,
);

const toHex = (buf) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

console.log(`pbkdf2:${ITERATIONS}:${toHex(salt)}:${toHex(bits)}`);
