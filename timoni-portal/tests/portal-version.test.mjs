import test from "node:test";
import assert from "node:assert/strict";
import { hasNewVersion } from "../lib/portal-version.ts";

test("versão igual à carregada não pede atualização", () => assert.equal(hasNewVersion("abc", "abc"), false));
test("versão publicada diferente pede atualização", () => assert.equal(hasNewVersion("abc", "def"), true));
test("ambiente local ou resposta inválida nunca pede atualização", () => {
  assert.equal(hasNewVersion("dev", "def"), false);
  assert.equal(hasNewVersion(undefined, "def"), false);
  assert.equal(hasNewVersion("abc", "dev"), false);
  assert.equal(hasNewVersion("abc", ""), false);
  assert.equal(hasNewVersion("abc", null), false);
});
