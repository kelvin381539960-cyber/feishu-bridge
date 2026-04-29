"use strict";

const baseContract = require("./base.contract");
const prdContract = require("./prd.contract");
const researchContract = require("./research.contract");
const codeContract = require("./code.contract");
const solutionContract = require("./solution.contract");
const generalContract = require("./general.contract");

const CONTRACTS = Object.freeze({
  base: baseContract,
  prd: prdContract,
  research: researchContract,
  code: codeContract,
  solution: solutionContract,
  general: generalContract,
});

const FINAL_WORKFLOWS = Object.freeze([
  "prd",
  "research",
  "code",
  "solution",
  "general",
]);

function getContract(taskType) {
  return CONTRACTS[taskType] || generalContract;
}

function requireContract(taskType) {
  if (!FINAL_WORKFLOWS.includes(taskType)) {
    throw new Error(`Unsupported workflow contract: ${taskType}`);
  }
  return CONTRACTS[taskType];
}

module.exports = {
  ...CONTRACTS,
  CONTRACTS,
  FINAL_WORKFLOWS,
  getContract,
  requireContract,
};
