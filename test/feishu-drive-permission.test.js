"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  grantAutoAdminForFile,
  collectAdminOpenIds,
  collectAdminEmails,
} = require("../lib/feishu-drive-permission");

test("module loads (regression: feishu-docx-export require chain)", () => {
  assert.ok(typeof grantAutoAdminForFile === "function");
});

test("collectAdminOpenIds merges admin + owner + drive alias", () => {
  const env = {
    FEISHU_DOC_ADMIN_OPEN_IDS: "ou_a,ou_b",
    FEISHU_DOC_OWNER_OPEN_IDS: "ou_b,ou_c",
    FEISHU_DRIVE_GRANT_OPEN_IDS: "ou_d",
  };
  const ids = collectAdminOpenIds(env).sort();
  assert.deepStrictEqual(ids, ["ou_a", "ou_b", "ou_c", "ou_d"]);
});

test("collectAdminEmails lowercases and dedupes", () => {
  const env = {
    FEISHU_DOC_ADMIN_EMAILS: "A@x.com,b@x.com",
    FEISHU_DOC_OWNER_EMAILS: "B@x.com",
  };
  const emails = collectAdminEmails(env).sort();
  assert.deepStrictEqual(emails, ["a@x.com", "b@x.com"]);
});

test("grantAutoAdminForFile with empty config does not throw", async () => {
  await assert.doesNotReject(async () => {
    await grantAutoAdminForFile("doccnFakeTokenForTest", "docx", console, {});
  });
});
