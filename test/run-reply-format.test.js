"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const {
  formatCursorAdhocReply,
  getCursorTaskAckMessage,
} = require("../lib/run-reply-format");

describe("run-reply-format", () => {
  test("formatCursorAdhocReply success prefers stdout", () => {
    const s = formatCursorAdhocReply({ code: 0, stdout: "OK\n", stderr: "" });
    assert.strictEqual(s, "OK");
  });

  test("formatCursorAdhocReply failure includes code", () => {
    const s = formatCursorAdhocReply({ code: 7, stdout: "", stderr: "boom" });
    assert.ok(s.includes("7"));
    assert.ok(s.includes("boom"));
  });

  test("formatCursorAdhocReply emits mismatch callback when trace id differs", () => {
    let hit = 0;
    formatCursorAdhocReply(
      {
        code: 0,
        stdout: "body",
        runtimeRunTrace: { requestId: "wrong-id", source: "runtime" },
      },
      {
        sourceMessageId: "right-id",
        onRequestIdMismatch: () => {
          hit += 1;
        },
      }
    );
    assert.strictEqual(hit, 1);
  });

  test("formatCursorAdhocReply prefers structured summary", () => {
    const s = formatCursorAdhocReply({
      code: 0,
      stdout: "RAW_STDOUT",
      structuredResult: { summary: "SUMMARY_ONLY" },
    });
    assert.strictEqual(s, "SUMMARY_ONLY");
  });

  test("getCursorTaskAckMessage default", () => {
    const prev = process.env.CURSOR_TASK_ACK_MESSAGE_OFF;
    delete process.env.CURSOR_TASK_ACK_MESSAGE_OFF;
    assert.strictEqual(getCursorTaskAckMessage(), "⏳");
    if (prev === undefined) delete process.env.CURSOR_TASK_ACK_MESSAGE_OFF;
    else process.env.CURSOR_TASK_ACK_MESSAGE_OFF = prev;
  });
});
